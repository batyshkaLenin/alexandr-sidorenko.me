"""Exercise release ordering and failures using real disposable Git checkouts.

Cloudflare and HTTP are controlled fakes; these tests make no live deployments.
"""
import argparse
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SITE = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("production_deploy", SITE / "scripts/deploy-production.py")
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)
PREVIOUS = "11111111-1111-4111-8111-111111111111"
ROLLBACK = "22222222-2222-4222-8222-222222222222"
VERSION = "33333333-3333-4333-8333-333333333333"
DEPLOYMENT = "44444444-4444-4444-8444-444444444444"

FAKE_WRANGLER = '''#!/usr/bin/env python3
import json, os, pathlib, sys
a=sys.argv[1:]
config=json.loads(pathlib.Path(a[a.index('--config')+1]).read_text())
assert 'build' not in config and 'routes' not in config
assert config['name']=='release-test' and config['account_id']=='a'*32
p=pathlib.Path(os.environ['RELEASE_TEST_STATE'])
s=json.loads(p.read_text()) if p.exists() else {'calls':[]}
s['calls'].append(a[:2])
def save(): p.write_text(json.dumps(s))
save()
old={'id':'11111111-1111-4111-8111-111111111111','created_on':'2026-01-01T00:00:00Z',
     'versions':[{'version_id':'22222222-2222-4222-8222-222222222222','percentage':100}]}
new={'id':'44444444-4444-4444-8444-444444444444','created_on':'2026-02-01T00:00:00Z',
     'versions':[{'version_id':'33333333-3333-4333-8333-333333333333','percentage':100}]}
if a[:2]==['deployments','list']:
 if os.environ.get('RELEASE_TEST_NO_ROLLBACK'): print('[]')
 elif s.get('promoted') or (os.environ.get('RELEASE_TEST_RACE') and s['calls'].count(['deployments','list'])>1): print(json.dumps([old,new]))
 else: print(json.dumps([old]))
elif a[:2]==['versions','view']:
 print(json.dumps({'id':old['versions'][0]['version_id'] if not os.environ.get('RELEASE_TEST_BAD_ROLLBACK') else 'wrong'}))
elif a[:2]==['versions','upload']:
 assert pathlib.Path(config['assets']['directory'],'index.html').read_text().startswith('clean:')
 if os.environ.get('RELEASE_TEST_FAIL_UPLOAD'): sys.exit(2)
 if '--dry-run' not in a:
  pathlib.Path(os.environ['WRANGLER_OUTPUT_FILE_PATH']).write_text(json.dumps({'type':'version-upload','worker_name':'release-test','version_id':'33333333-3333-4333-8333-333333333333'})+'\\n')
elif a[:2]==['versions','deploy']:
 assert a[2]=='33333333-3333-4333-8333-333333333333@100%'
 if os.environ.get('RELEASE_TEST_FAIL_PROMOTE'): sys.exit(3)
 s['promoted']=True; save()
else: raise AssertionError(a)
'''


def git(root, *args):
    return subprocess.check_output(["git", "-c", "commit.gpgsign=false", *args], cwd=root,
                                   stderr=subprocess.DEVNULL, text=True).strip()


def put(root, name, text, executable=False):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    if executable:
        path.chmod(0o755)
    return path


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "repo"
        self.root.mkdir()
        git(self.root, "init", "-q", "-b", "main")
        git(self.root, "config", "user.name", "Release fixture")
        git(self.root, "config", "user.email", "fixture@example.invalid")
        theme = self.root / "themes/declassified"
        theme.mkdir(parents=True)
        git(theme, "init", "-q")
        git(theme, "config", "user.name", "Theme fixture")
        git(theme, "config", "user.email", "fixture@example.invalid")
        put(theme, "theme.txt", "theme")
        git(theme, "add", "theme.txt")
        git(theme, "commit", "-qm", "fixture")
        put(self.root, "scripts/deploy-production.py", (SITE / "scripts/deploy-production.py").read_text())
        put(self.root, "scripts/ci.sh", '''#!/bin/sh
set -eu
test "$HUGO_BUILD_ENVIRONMENT" = production
test "$HUGO_REFRESH_SNAPSHOTS" = 0
test -z "$PERF_PAGES"
test "$PUBLIC_DIR" = "$HUGO_DESTINATION"
test -z "${RELEASE_TEST_FAIL_BUILD:-}"
mkdir -p "$PUBLIC_DIR"
printf '%s:%s:%s' "$(cat content.txt)" "$(git rev-parse HEAD)" "$(git log -1 --format=%H -- content.txt)" > "$PUBLIC_DIR/index.html"
''')
        put(self.root, "scripts/check-http-matrix.py", "import os, sys\nsys.exit(1 if os.environ.get('RELEASE_TEST_FAIL_SMOKE') else 0)\n")
        put(self.root, "content.txt", "clean")
        put(self.root, ".tool-versions", "hugo 0.165.0\n")
        put(self.root, "package.json", json.dumps({"devDependencies": {"wrangler": "4.131.2"}}))
        put(self.root, "wrangler.jsonc", '''{
// This preview build must not be invoked during upload.
"name":"preview", "build":{"command":"FAIL"},
"compatibility_date":"2026-08-06",
"assets":{"directory":"./public","html_handling":"drop-trailing-slash","not_found_handling":"404-page"}
}''')
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "release fixture")
        self.commit = git(self.root, "rev-parse", "HEAD")
        # Contamination in the caller must not enter the release artifact.
        put(self.root, "content.txt", "DIRTY")
        put(self.root, "public/index.html", "POISON")
        put(self.root, "node_modules/wrangler/package.json", '{"version":"4.131.2"}')
        put(self.root, "node_modules/.bin/wrangler", FAKE_WRANGLER, executable=True)
        self.state = Path(self.temporary.name) / "state.json"
        self.args = argparse.Namespace(commit=self.commit, worker="release-test", account_id="a" * 32,
                                       origin="https://release-test.example.invalid", dry_run=False,
                                       record=Path(self.temporary.name) / "record.json")
        self.environ = patch.dict(os.environ, {"RELEASE_TEST_STATE": str(self.state),
                                              "PERF_PAGES": "POISON", "PUBLIC_DIR": "POISON"})
        self.environ.start()
        self.addCleanup(self.environ.stop)
        self.response = unittest.mock.MagicMock()
        self.response.__enter__.return_value = self.response
        self.response.geturl.return_value = self.args.origin + "/?release=" + self.commit
        self.response.read.return_value = ("clean:" + self.commit + ":" + self.commit).encode()
        self.http = patch.object(DEPLOY.urllib.request, "urlopen", return_value=self.response)
        self.urlopen = self.http.start()
        self.addCleanup(self.http.stop)

    def release(self):
        return DEPLOY.release(self.args, self.root)

    def calls(self):
        return json.loads(self.state.read_text())["calls"] if self.state.exists() else []

    def advance_history(self):
        put(self.root, "unrelated.txt", "second commit; content.txt is unchanged")
        git(self.root, "add", "unrelated.txt")
        git(self.root, "commit", "-qm", "unrelated history")
        self.args.commit = git(self.root, "rev-parse", "HEAD")

    def shallow_copy(self, source, name):
        target = Path(self.temporary.name) / name
        subprocess.run(["git", "clone", "--depth=1", source.as_uri(), str(target)],
                       check=True, capture_output=True)
        subprocess.run(["git", "clone", str(self.root / "themes/declassified"),
                        str(target / "themes/declassified")], check=True, capture_output=True)
        shutil.copytree(self.root / "node_modules", target / "node_modules")
        return target

    def test_exact_commit_and_record(self):
        record = self.release()
        self.assertEqual(record["status"], "passed")
        self.assertEqual(record["commit"], self.commit)
        self.assertEqual(record["theme_commit"], git(self.root, "rev-parse", "HEAD:themes/declassified"))
        self.assertEqual(record["hugo_version"], "0.165.0")
        self.assertEqual(record["deployment_id"], DEPLOYMENT)
        self.assertEqual(record["rollback_version_id"], ROLLBACK)
        self.assertEqual(record["previous_deployment_id"], PREVIOUS)
        self.assertEqual((self.root / "public/index.html").read_text(), "POISON")
        self.assertEqual((self.root / "content.txt").read_text(), "DIRTY")

    def test_dry_run_has_no_remote_preflight_or_promotion(self):
        self.args.dry_run = True
        record = self.release()
        self.assertEqual(record["status"], "dry-run")
        self.assertEqual(self.calls(), [["versions", "upload"]])
        self.assertNotIn("deployment_id", record)
        self.urlopen.assert_not_called()

    def test_failures_stop_at_the_correct_boundary(self):
        for flag, forbidden in [("FAIL_BUILD", ["versions", "upload"]),
                                ("NO_ROLLBACK", ["versions", "upload"]),
                                ("BAD_ROLLBACK", ["versions", "upload"]),
                                ("FAIL_UPLOAD", ["versions", "deploy"]),
                                ("RACE", ["versions", "deploy"])]:
            with self.subTest(flag=flag), patch.dict(os.environ, {"RELEASE_TEST_" + flag: "1"}):
                self.args.record = Path(self.temporary.name) / (flag + ".json")
                self.state.unlink(missing_ok=True)
                with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                    self.release()
                self.assertNotIn(forbidden, self.calls())
                self.assertEqual(json.loads(self.args.record.read_text())["status"], "failed")

    def test_smoke_failure_preserves_deployment_and_rollback_ids(self):
        with patch.dict(os.environ, {"RELEASE_TEST_FAIL_SMOKE": "1"}):
            with self.assertRaises(subprocess.CalledProcessError):
                self.release()
        record = json.loads(self.args.record.read_text())
        self.assertEqual(record["phase"], "smoke")
        self.assertEqual(record["status"], "failed")
        self.assertEqual(record["deployment_id"], DEPLOYMENT)
        self.assertEqual(record["rollback_version_id"], ROLLBACK)
        self.assertNotIn(["rollback"], self.calls())

    def test_wrong_origin_revision_fails(self):
        self.response.read.return_value = b"old home page"
        with self.assertRaisesRegex(ValueError, "exact release home"):
            self.release()

    def test_existing_record_is_not_overwritten(self):
        self.args.record.write_text("keep me")
        with self.assertRaises(FileExistsError):
            self.release()
        self.assertEqual(self.args.record.read_text(), "keep me")
        self.assertFalse(self.calls())

    def test_notification_failure_and_retry_do_not_redeploy(self):
        self.release()
        record = self.args.record.read_bytes()
        calls = self.calls()
        self.assertEqual(DEPLOY.notify(self.args.record, ["python3", "-c", "raise SystemExit(7)"]), 7)
        self.assertEqual(DEPLOY.notify(self.args.record, ["python3", "-c", "pass"]), 0)
        self.assertEqual(record, self.args.record.read_bytes())
        self.assertEqual(calls, self.calls())
        self.assertEqual(DEPLOY.notify(self.args.record, ["/nonexistent/notification-command"]), 127)
        self.assertEqual(record, self.args.record.read_bytes())

    def test_notification_cannot_announce_an_unverified_release(self):
        self.args.record.write_text('{"status":"failed"}')
        with self.assertRaises(ValueError):
            DEPLOY.notify(self.args.record, ["false"])

    def test_argument_validation_happens_before_checkout(self):
        for key, value in [("commit", "main"), ("origin", "http://example.invalid"),
                           ("origin", "https://user:pass@example.invalid"),
                           ("account_id", "unknown"), ("worker", "bad/name")]:
            with self.subTest(key=key, value=value):
                args = argparse.Namespace(**vars(self.args))
                setattr(args, key, value)
                with self.assertRaises(ValueError):
                    DEPLOY.release(args, self.root)
                self.assertFalse(self.args.record.exists())

    def test_split_deployment_is_not_an_implicit_rollback_choice(self):
        with self.assertRaisesRegex(ValueError, "single verified"):
            DEPLOY.latest_deployment([{"id": PREVIOUS, "created_on": "2026-01-01",
                                      "versions": [{"version_id": ROLLBACK, "percentage": 50}]}])

    def test_digest_rejects_asset_symlinks(self):
        (self.root / "public/alias").symlink_to("index.html")
        with self.assertRaises(ValueError):
            DEPLOY.asset_digest(self.root / "public")

    def test_failed_promotion_keeps_a_recoverable_record(self):
        with patch.dict(os.environ, {"RELEASE_TEST_FAIL_PROMOTE": "1"}):
            with self.assertRaises(subprocess.CalledProcessError):
                self.release()
        record = json.loads(self.args.record.read_text())
        self.assertEqual(record["phase"], "promote")
        self.assertEqual(record["version_id"], VERSION)
        self.assertEqual(record["rollback_version_id"], ROLLBACK)
        self.urlopen.assert_not_called()

    def test_wrong_installed_wrangler_stops_before_build_or_remote_calls(self):
        put(self.root, "node_modules/wrangler/package.json", '{"version":"0.0.0"}')
        with self.assertRaisesRegex(ValueError, "Installed Wrangler"):
            self.release()
        self.assertEqual(self.calls(), [])

    def test_dev_cannot_promote_a_production_release(self):
        with patch.dict(os.environ, {"WORKERS_CI_BRANCH": "dev"}):
            with self.assertRaisesRegex(ValueError, "dev is preview"):
                self.release()
        self.assertEqual(self.calls(), [])

    def test_workers_builds_cannot_deploy_a_different_commit(self):
        with patch.dict(os.environ, {"WORKERS_CI_BRANCH": "main", "WORKERS_CI_COMMIT_SHA": "f" * 40}):
            with self.assertRaisesRegex(ValueError, "Workers Builds commit"):
                self.release()
        self.assertEqual(self.calls(), [])

    def test_feature_commit_cannot_be_released_as_main(self):
        git(self.root, "checkout", "-qb", "feature")
        put(self.root, "feature.txt", "not in main")
        git(self.root, "add", "feature.txt")
        git(self.root, "commit", "-qm", "feature commit")
        self.args.commit = git(self.root, "rev-parse", "HEAD")
        with self.assertRaises(subprocess.CalledProcessError):
            self.release()
        self.assertEqual(self.calls(), [])

    def test_workers_builds_supports_an_exact_detached_main_checkout(self):
        git(self.root, "checkout", "--detach", self.commit)
        git(self.root, "branch", "-D", "main")
        with patch.dict(os.environ, {"WORKERS_CI_BRANCH": "main", "WORKERS_CI_COMMIT_SHA": self.commit}):
            self.assertEqual(self.release()["status"], "passed")

    def test_workers_builds_requires_both_branch_and_commit_identity(self):
        with patch.dict(os.environ, {"WORKERS_CI_BRANCH": "main"}):
            os.environ.pop("WORKERS_CI_COMMIT_SHA", None)
            with self.assertRaisesRegex(ValueError, "Workers Builds commit"):
                self.release()

    def test_full_and_shallow_sources_build_the_same_history_dependent_artifact(self):
        self.advance_history()
        self.args.dry_run = True
        self.args.record = Path(self.temporary.name) / "full.json"
        full = self.release()
        shallow = self.shallow_copy(self.root, "shallow-source")
        put(shallow, "content.txt", "DIRTY SHALLOW SOURCE")
        self.assertEqual(git(shallow, "rev-parse", "--is-shallow-repository"), "true")
        self.args.record = Path(self.temporary.name) / "shallow.json"
        result = DEPLOY.release(self.args, shallow)
        self.assertEqual(result["asset_digest"], full["asset_digest"])
        self.assertEqual(result["home_digest"], full["home_digest"])
        self.assertEqual(git(shallow, "rev-parse", "--is-shallow-repository"), "true")
        self.assertEqual((shallow / "content.txt").read_text(), "DIRTY SHALLOW SOURCE")

    def test_a_shallow_upstream_cannot_silently_supply_incomplete_history(self):
        self.advance_history()
        upstream = self.shallow_copy(self.root, "shallow-upstream")
        shallow = self.shallow_copy(upstream, "shallow-caller")
        with self.assertRaisesRegex(ValueError, "history is incomplete"):
            DEPLOY.release(self.args, shallow)
        self.assertEqual(self.calls(), [])
        self.assertEqual(json.loads(self.args.record.read_text())["phase"], "history")

    def test_missing_upstream_stops_before_upload_without_leaking_remote_details(self):
        self.advance_history()
        shallow = self.shallow_copy(self.root, "missing-history-source")
        git(shallow, "remote", "set-url", "origin", "file:///missing-history-fixture-private-token")
        with self.assertRaisesRegex(ValueError, "Could not obtain complete Git history"):
            DEPLOY.release(self.args, shallow)
        self.assertEqual(self.calls(), [])
        record = json.loads(self.args.record.read_text())
        self.assertNotIn("fixture-private-token", record["error"])


class BuildModeTests(unittest.TestCase):
    """Run the actual build.sh with a local pinned-Hugo archive, without network."""
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        git(self.root, "init", "-q")
        git(self.root, "config", "user.name", "Build fixture")
        git(self.root, "config", "user.email", "fixture@example.invalid")
        put(self.root, ".tool-versions", "hugo 0.165.0\n")
        for name in ["check-config-contract.py", "check-content-schema.py"]:
            put(self.root, "scripts/" + name, "pass\n")
        for name in ["lastfm", "dev-activity"]:
            put(self.root, "scripts/fetch-" + name + ".py",
                "from pathlib import Path\nPath('fetched-" + name + "').touch()\n")
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "build fixture")
        hugo = b'''#!/usr/bin/env python3
import json, pathlib, sys
if sys.argv[1]=='version': print('hugo v0.165.0+extended linux/amd64')
else: pathlib.Path('hugo-args.json').write_text(json.dumps(sys.argv[1:]))
'''
        self.archive = self.root / "hugo.tar.gz"
        with tarfile.open(self.archive, "w:gz") as archive:
            entry = tarfile.TarInfo("hugo")
            entry.mode = 0o755
            entry.size = len(hugo)
            archive.addfile(entry, io.BytesIO(hugo))
        put(self.root, "bin/curl", '''#!/usr/bin/env python3
import os, pathlib, shutil, sys
destination=pathlib.Path(sys.argv[sys.argv.index('--output-dir')+1])
shutil.copyfile(os.environ['BUILD_FIXTURE_HUGO'],destination/'hugo_extended_0.165.0_linux-amd64.tar.gz')
''', executable=True)
        self.global_config = put(self.root, "global.gitconfig", "[core]\n    quotepath = true\n")

    def build(self, environment, **overrides):
        env = {**os.environ, "PATH": str(self.root / "bin") + os.pathsep + os.environ["PATH"],
               "BUILD_FIXTURE_HUGO": str(self.archive), "HUGO_BUILD_ENVIRONMENT": environment,
               "GIT_CONFIG_GLOBAL": str(self.global_config), "LASTFM_API_KEY": "fixture-key",
               "PERF_PAGES": "", "HUGO_REFRESH_SNAPSHOTS": "1", **overrides}
        return subprocess.run(["bash", str(SITE / "build.sh")], cwd=self.root, env=env,
                              capture_output=True, text=True)

    def test_production_uses_committed_snapshots_and_preserves_user_config(self):
        original = self.global_config.read_bytes()
        result = self.build("production")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / "fetched-lastfm").exists())
        self.assertFalse((self.root / "fetched-dev-activity").exists())
        args = json.loads((self.root / "hugo-args.json").read_text())
        self.assertEqual(args[args.index("--environment") + 1], "production")
        self.assertIn("--panicOnWarning", args)
        self.assertEqual(original, self.global_config.read_bytes())

    def test_preview_keeps_existing_refresh_behavior(self):
        result = self.build("preview")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.root / "fetched-lastfm").exists())
        self.assertTrue((self.root / "fetched-dev-activity").exists())
        args = json.loads((self.root / "hugo-args.json").read_text())
        self.assertEqual(args[args.index("--environment") + 1], "preview")

    def test_unknown_environment_and_production_measurement_pages_fail(self):
        self.assertNotEqual(self.build("typo").returncode, 0)
        self.assertNotEqual(self.build("production", PERF_PAGES="some-fonts").returncode, 0)
        self.assertFalse((self.root / "hugo-args.json").exists())

    def test_build_refuses_history_that_remains_shallow_after_successful_fetch(self):
        put(self.root, "later.txt", "unrelated second commit")
        git(self.root, "add", "later.txt")
        git(self.root, "commit", "-qm", "later commit")
        cache, isolated = self.root / "cache", self.root / "isolated"
        git(self.root, "clone", "--depth=1", self.root.as_uri(), str(cache))
        git(self.root, "clone", "--no-hardlinks", "--no-checkout", str(cache), str(isolated))
        git(isolated, "checkout", "--detach", "HEAD")
        self.root = isolated
        result = self.build("production")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Git history is incomplete after fetch", result.stderr)
        self.assertFalse((self.root / "hugo-args.json").exists())


if __name__ == "__main__":
    unittest.main()
