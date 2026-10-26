#!/usr/bin/env python3
"""Build a named commit in isolation, verify a rollback version, deploy and smoke.

Works from Workers Builds or a local checkout. DNS/routes and notifications
are separate operations. --dry-run never uploads or promotes a version.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent


def run(argv: list[str], cwd: Path, env: dict[str, str], *, capture: bool = False) -> str:
    result = subprocess.run(argv, cwd=cwd, env=env, text=True,
                            stdout=subprocess.PIPE if capture else None, check=True)
    return result.stdout.strip() if capture else ""


def write_record(path: Path, record: dict) -> None:
    """Replace only this run's reserved record, preserving progress on failure."""
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(record, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def file_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def asset_digest(directory: Path) -> str:
    entries = []
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Asset symlinks are not allowed: {path}")
        if path.is_file():
            entries.append([path.relative_to(directory).as_posix(), file_digest(path)])
    if not entries or not (directory / "index.html").is_file():
        raise ValueError("A fresh build with index.html is required")
    return hashlib.sha256(json.dumps(entries, separators=(",", ":")).encode()).hexdigest()


def read_config(path: Path) -> dict:
    # Remove comments while preserving quoted strings (including URL values).
    text = re.sub(r'("(?:\\.|[^"\\])*")|//[^\n]*|/\*.*?\*/',
                  lambda match: match[1] or "", path.read_text(), flags=re.S)
    return json.loads(text)


def complete_history(source: Path, checkout: Path, env: dict[str, str]) -> None:
    """Fetch history in scratch from the source's upstream, never a shallow cache.

    Fetching --unshallow from a local shallow checkout can return success while
    leaving the receiver shallow. Hugo's GitInfo needs the complete history.
    Keep remote URLs and Git's raw fetch diagnostics out of release logs: the
    source's URL may contain CI authentication information.
    """
    if run(["git", "rev-parse", "--is-shallow-repository"], checkout, env, capture=True) == "false":
        return
    upstream = run(["git", "remote", "get-url", "origin"], source, env, capture=True)
    if not upstream:
        raise ValueError("Complete Git history requires the original upstream remote")
    if ":" not in upstream and not Path(upstream).is_absolute():
        upstream = str((source / upstream).resolve())
    for arguments in (["git", "remote", "set-url", "origin", upstream],
                      ["git", "fetch", "--unshallow", "origin"]):
        result = subprocess.run(arguments, cwd=checkout, env=env, text=True, capture_output=True)
        if result.returncode:
            raise ValueError("Could not obtain complete Git history from the source upstream")
    if run(["git", "rev-parse", "--is-shallow-repository"], checkout, env, capture=True) != "false":
        raise ValueError("Git history is incomplete after fetching the source upstream")


def latest_deployment(deployments: list[dict]) -> dict:
    if not deployments:
        raise ValueError("No previous deployment: seed and verify a rollback target first")
    latest = max(deployments, key=lambda deployment: deployment["created_on"])
    uuid.UUID(latest["id"])
    versions = latest["versions"]
    if len(versions) != 1 or versions[0]["percentage"] != 100:
        raise ValueError("A single verified rollback version at 100% is required")
    uuid.UUID(versions[0]["version_id"])
    return latest


def validate_arguments(args: argparse.Namespace) -> None:
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit):
        raise ValueError("--commit must be a full, explicit Git commit SHA")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", args.worker):
        raise ValueError("Invalid Worker name")
    if not re.fullmatch(r"[0-9a-f]{32}", args.account_id):
        raise ValueError("--account-id must identify one Cloudflare account")
    origin = urllib.parse.urlsplit(args.origin)
    origin.port  # Validate a malformed/non-numeric port before any side effects.
    if (origin.scheme != "https" or not origin.hostname or origin.username or origin.password
            or origin.path not in ("", "/") or origin.query or origin.fragment):
        raise ValueError("--origin must be an HTTPS origin without credentials/path/query")


def release(args: argparse.Namespace, root: Path = ROOT) -> dict:
    validate_arguments(args)
    record_path = args.record.resolve()
    record_path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive reservation prevents accidentally reusing a previous release record.
    with record_path.open("x") as stream:
        stream.write("{}\n")
    record = {"schema": "production-deploy/v1", "status": "preparing",
              "commit": args.commit, "worker": args.worker, "account_id": args.account_id,
              "origin": args.origin.rstrip("/"), "dry_run": args.dry_run,
              "notifications": "separate", "phase": "checkout"}
    write_record(record_path, record)
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env.update({"WRANGLER_SEND_METRICS": "false", "CI": "true",
                "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_TERMINAL_PROMPT": "0"})
    try:
        if not args.dry_run:
            if "WORKERS_CI_BRANCH" in env:
                if env["WORKERS_CI_BRANCH"] != "main":
                    raise ValueError("Production releases must come from main; dev is preview")
                if env.get("WORKERS_CI_COMMIT_SHA") != args.commit:
                    raise ValueError("Release commit differs from the Workers Builds commit")
                # Workers Builds may provide a detached checkout without a local
                # main ref. Bind its branch/commit assertion to the actual HEAD.
                if run(["git", "rev-parse", "HEAD"], root, env, capture=True) != args.commit:
                    raise ValueError("Checkout differs from the Workers Builds commit")
            else:
                run(["git", "merge-base", "--is-ancestor", args.commit, "refs/heads/main"], root, env)
            record["source_branch"] = "main"
        with tempfile.TemporaryDirectory(prefix="production-release-") as temporary:
            scratch = Path(temporary)
            checkout = scratch / "source"
            run(["git", "cat-file", "-e", args.commit + "^{commit}"], root, env)
            run(["git", "clone", "--no-hardlinks", "--no-checkout", "--", str(root),
                 str(checkout)], root, env)
            run(["git", "checkout", "--detach", args.commit], checkout, env)
            # A checkout cannot silently reuse an uncommitted deployment wrapper.
            if (checkout / "scripts/deploy-production.py").read_bytes() != Path(__file__).read_bytes():
                raise ValueError("Commit the release tooling and use that commit's script")
            record["phase"] = "history"
            write_record(record_path, record)
            complete_history(root, checkout, env)
            theme = run(["git", "rev-parse", "HEAD:themes/declassified"], checkout, env, capture=True)
            theme_path = checkout / "themes/declassified"
            run(["git", "clone", "--no-hardlinks", "--no-checkout", "--",
                 str(root / "themes/declassified"), str(theme_path)], root, env)
            run(["git", "checkout", "--detach", theme], theme_path, env)
            pin = json.loads((checkout / "package.json").read_text())["devDependencies"]["wrangler"]
            installed = json.loads((root / "node_modules/wrangler/package.json").read_text())["version"]
            if pin != installed:
                raise ValueError("Installed Wrangler differs from the release commit; run npm ci")
            hugo = re.search(r"^(?:hugo|hugo-extended)\s+(\d+\.\d+\.\d+)\s*$",
                             (checkout / ".tool-versions").read_text(), re.M)
            if not hugo:
                raise ValueError("Missing Hugo pin")
            record.update(theme_commit=theme, hugo_version=hugo[1], wrangler_version=pin,
                          phase="build-and-checks")
            write_record(record_path, record)
            assets = checkout / "public"
            # Overwrite inherited local destinations, environment and measurement flags.
            build_env = {**{key: value for key, value in env.items() if not key.startswith("HUGO_")},
                         "HUGO_BUILD_ENVIRONMENT": "production",
                         "HUGO_REFRESH_SNAPSHOTS": "0", "HUGO_DESTINATION": str(assets),
                         "PUBLIC_DIR": str(assets), "PERF_PAGES": ""}
            run(["bash", "scripts/ci.sh"], checkout, build_env)
            run(["git", "-c", "core.fileMode=false", "diff", "--exit-code", "HEAD"], checkout, env)
            record["asset_digest"] = asset_digest(assets)
            record["home_digest"] = file_digest(assets / "index.html")
            source_config = read_config(checkout / "wrangler.jsonc")
            # Uploads must not invoke the custom preview build a second time or
            # copy any routes/custom domains/runtime bindings from the local config.
            config = {"name": args.worker, "account_id": args.account_id,
                      "compatibility_date": source_config["compatibility_date"],
                      "preview_urls": True,
                      "assets": {**source_config["assets"], "directory": str(assets)}}
            config_path = scratch / "wrangler.json"
            config_path.write_text(json.dumps(config))
            wrangler = str(root / "node_modules/.bin/wrangler")
            output = scratch / "wrangler-output.jsonl"
            cli_env = {**env, "WRANGLER_OUTPUT_FILE_PATH": str(output),
                       "WRANGLER_LOG_PATH": str(scratch / "wrangler.log")}

            def cf(*arguments: str, capture: bool = False) -> str:
                return run([wrangler, *arguments, "--config", str(config_path)],
                           scratch, cli_env, capture=capture)

            def current() -> dict:
                return latest_deployment(json.loads(cf("deployments", "list", "--json", capture=True)))

            if args.dry_run:
                record["phase"] = "dry-run"
                write_record(record_path, record)
                cf("versions", "upload", "--dry-run")
                record["status"] = "dry-run"
                write_record(record_path, record)
                return record

            record["phase"] = "rollback-preflight"
            write_record(record_path, record)
            previous = current()
            rollback = previous["versions"][0]["version_id"]
            detail = json.loads(cf("versions", "view", rollback, "--json", capture=True))
            if detail["id"] != rollback:
                raise ValueError("Rollback version could not be verified")
            record.update(previous_deployment_id=previous["id"], rollback_version_id=rollback,
                          phase="upload")
            write_record(record_path, record)
            cf("versions", "upload", "--tag", args.commit[:12], "--message", "Site " + args.commit)
            uploads = [json.loads(line) for line in output.read_text().splitlines()]
            versions = [entry["version_id"] for entry in uploads
                        if entry.get("type") == "version-upload" and entry.get("worker_name") == args.worker]
            if len(versions) != 1:
                raise ValueError("Upload did not produce exactly one version ID")
            version = versions[0]
            uuid.UUID(version)
            record.update(version_id=version, phase="promote")
            write_record(record_path, record)
            if asset_digest(assets) != record["asset_digest"]:
                raise ValueError("Assets changed during upload")
            if current()["id"] != previous["id"]:
                raise ValueError("Deployment changed concurrently; refusing promotion")
            cf("versions", "deploy", version + "@100%", "--yes",
               "--message", "Site " + args.commit)
            deployed = current()
            if deployed["versions"][0]["version_id"] != version:
                raise ValueError("Active deployment is not the uploaded version")
            record.update(deployment_id=deployed["id"], phase="smoke", status="deployed-unverified")
            write_record(record_path, record)
            request = urllib.request.Request(record["origin"] + "/?release=" + args.commit,
                                             headers={"Cache-Control": "no-cache"})
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.geturl().split("?", 1)[0] != record["origin"] + "/":
                    raise ValueError("Smoke origin redirected elsewhere")
                if hashlib.sha256(response.read()).hexdigest() != record["home_digest"]:
                    raise ValueError("Origin does not serve the exact release home page")
            run([sys.executable, "scripts/check-http-matrix.py", "--base-url", record["origin"],
                 "--public-dir", str(assets)], checkout, env)
            if current()["id"] != record["deployment_id"]:
                raise ValueError("Deployment changed during smoke")
            record.update(status="passed", phase="complete")
            write_record(record_path, record)
            return record
    except Exception as error:
        record.update(status="failed", error=str(error))
        write_record(record_path, record)
        raise


def notify(record_path: Path, command: list[str]) -> int:
    """Retry an external notification without building, deploying or rolling back."""
    record = json.loads(record_path.read_text())
    if record.get("status") != "passed":
        raise ValueError("Only a smoke-verified successful deployment can be announced")
    if not command:
        raise ValueError("A notification command is required")
    error = None
    try:
        result = subprocess.run(command, env={**os.environ, "DEPLOY_RECORD": str(record_path.resolve())})
        exit_code = result.returncode
    except OSError as failure:
        error, exit_code = str(failure), 127
    # Notification outcome is a separate retryable record; deploy success is immutable.
    status_path = record_path.with_suffix(record_path.suffix + ".notification.json")
    write_record(status_path, {"deployment_id": record["deployment_id"], "exit_code": exit_code,
                               "error": error})
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="operation", required=True)
    deploy = subparsers.add_parser("deploy")
    deploy.add_argument("--commit", required=True)
    deploy.add_argument("--worker", required=True)
    deploy.add_argument("--account-id", required=True)
    deploy.add_argument("--origin", required=True)
    deploy.add_argument("--record", required=True, type=Path)
    deploy.add_argument("--dry-run", action="store_true")
    notification = subparsers.add_parser("notify")
    notification.add_argument("--record", required=True, type=Path)
    notification.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        if args.operation == "notify":
            command = args.command[1:] if args.command[:1] == ["--"] else args.command
            return notify(args.record, command)
        record = release(args)
        print(json.dumps(record, ensure_ascii=False, sort_keys=True))
        print(f"Release {record['status']}; record: {args.record}")
        return 0
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(f"Release failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
