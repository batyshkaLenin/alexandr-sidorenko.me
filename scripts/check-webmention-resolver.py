#!/usr/bin/env python3
"""Exercise the address registry, Text Fragment resolver and API pagination."""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

from webmention_targets import (
    BASE_URL,
    RegistryError,
    build_registry,
    fetch_domain_mentions,
    material_page,
    resolve_target,
)

ID_ONE = "018f0000-0000-7000-8000-000000000001"
ID_TWO = "018f0000-0000-7000-8000-000000000002"


def write_material(root: Path, name: str, material_id: str, extra: str = "") -> None:
    path = root / "content" / "library" / f"{name}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "---\n"
        f'title: "{name}"\n'
        "date: 2026-09-12\n"
        'authors: ["batyshkaLenin"]\n'
        f'id: "{material_id}"\n'
        'type: "article"\n'
        "draft: false\n"
        f"{extra}"
        "---\nBody.\n",
        encoding="utf-8",
    )


def write_page(public: Path, name: str, body: str) -> None:
    path = public / "library" / name / "index.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f'<main><div class="e-content"><p>{body}</p></div></main>',
        encoding="utf-8",
    )


def text_target(name: str, directive: str) -> str:
    return f"{BASE_URL}/library/{name}#:~:text={directive}"


def self_test() -> None:
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        public = root / "public"
        write_material(
            root,
            "one",
            ID_ONE,
            f"historicalUrls:\n  - {BASE_URL}/library/old-one\n",
        )
        write_page(
            public,
            "one",
            "Café Start middle finish. Before same after. "
            "Other same tail.<br>Poem second line.",
        )
        registry = build_registry(root)

        assert registry.by_url[f"{BASE_URL}/library/one"].material_id == ID_ONE
        assert registry.by_url[f"{BASE_URL}/id/{ID_ONE}"].material_id == ID_ONE
        assert registry.by_url[f"{BASE_URL}/library/old-one"].material_id == ID_ONE

        document = resolve_target(f"{BASE_URL}/library/one#heading", registry, public)
        assert document.status == "resolved"
        assert document.target == {
            "materialId": ID_ONE,
            "selector": {"type": "document"},
        }

        unique = resolve_target(
            text_target("one", "Poem%20second%20line."), registry, public
        )
        assert unique.target and unique.target["selector"]["type"] == "quote"
        assert unique.target["selector"]["exact"] == "Poem second line."
        assert unique.target_snapshot and unique.target_snapshot[
            "materialVersion"
        ].startswith("sha256:")

        primary_match = resolve_target(
            text_target("one", "cafe%20start"), registry, public
        )
        assert (
            primary_match.target
            and primary_match.target["selector"]["exact"] == "Café Start"
        )

        range_match = resolve_target(
            text_target("one", "cafe%20start,FINISH"), registry, public
        )
        assert range_match.target
        assert range_match.target["selector"]["exact"] == "Café Start middle finish"

        ambiguous = resolve_target(text_target("one", "SAME"), registry, public)
        assert ambiguous.target and ambiguous.target["selector"]["type"] == "document"
        assert ambiguous.diagnostic == "text-fragment-ambiguous"

        contextual = resolve_target(
            text_target("one", "Before-,same,-%20after"), registry, public
        )
        assert contextual.target and contextual.target["selector"]["type"] == "quote"
        assert contextual.target["selector"]["position"]["start"] < 50

        missing = resolve_target(text_target("one", "absent"), registry, public)
        assert missing.target and missing.target["selector"]["type"] == "document"
        assert missing.diagnostic == "text-fragment-not-found"

        malformed = resolve_target(text_target("one", "%ZZ"), registry, public)
        assert malformed.status == "unresolved"
        assert malformed.diagnostic and malformed.diagnostic.startswith(
            "malformed-text-fragment"
        )

        unescaped = resolve_target(text_target("one", "Poem-second"), registry, public)
        assert unescaped.status == "unresolved"

        assert (
            resolve_target("https://foreign.example/post", registry, public).status
            == "foreign"
        )
        assert (
            resolve_target(f"{BASE_URL}/not-a-material", registry, public).status
            == "unsupported"
        )

        pages: list[int] = []

        def load_page(params: dict) -> list[dict]:
            pages.append(params["page"])
            assert params["domain"] == urllib.parse.urlsplit(BASE_URL).hostname
            assert params["token"] == "secret"
            return (
                [
                    {"wm-id": 1, "wm-target": text_target("one", "same")},
                    {"wm-id": 2, "wm-target": f"{BASE_URL}/id/{ID_ONE}"},
                ]
                if params["page"] == 0
                else [{"wm-id": 3, "wm-target": f"{BASE_URL}/library/old-one"}]
            )

        fetched = fetch_domain_mentions(
            "secret",
            urllib.parse.urlsplit(BASE_URL).hostname or "",
            per_page=2,
            page_loader=load_page,
        )
        assert [item["wm-id"] for item in fetched] == [1, 2, 3]
        assert fetched[0]["wm-target"].endswith("#:~:text=same")
        assert pages == [0, 1]

        fetch_path = Path(__file__).with_name("fetch-webmentions.py")
        spec = importlib.util.spec_from_file_location(
            "fetch_webmentions_check", fetch_path
        )
        assert spec and spec.loader
        fetch_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fetch_module)
        raw = [
            {
                "wm-id": 10,
                "wm-property": "in-reply-to",
                "wm-target": text_target("one", "Poem%20second%20line."),
                "wm-source": "https://source.example/reply",
                "published": "2026-09-12T10:00:00Z",
                "author": {"name": "Author", "url": "https://source.example/"},
                "content": {"text": "Initial reply"},
            },
            {
                "wm-id": 11,
                "wm-target": text_target("one", "%ZZ"),
                "wm-source": "https://source.example/broken",
            },
            {
                "wm-id": 12,
                "wm-target": "https://foreign.example/post",
                "wm-source": "https://source.example/foreign",
            },
            {
                "wm-id": 13,
                "wm-target": f"{BASE_URL}/id/{ID_ONE}",
                "wm-source": "https://source.example/id-target",
                "published": "2026-09-12T10:01:00Z",
            },
            {
                "wm-id": 14,
                "wm-target": f"{BASE_URL}/library/old-one#legacy",
                "wm-source": "https://source.example/historical-target",
                "published": "2026-09-12T10:02:00Z",
            },
        ]
        staged, staged_unresolved, staged_diagnostics = fetch_module.prepare_inbox(
            raw,
            registry,
            public,
            {"domains": set(), "authors": set()},
            {},
        )
        assert [entry["id"] for entry in staged] == ["wm-10", "wm-13", "wm-14"]
        assert staged[0]["target"]["selector"]["type"] == "quote"
        assert all(
            entry["target"]["selector"] == {"type": "document"} for entry in staged[1:]
        )
        assert [entry["id"] for entry in staged_unresolved] == ["wm-11"]
        assert staged_diagnostics == ["wm-12: foreign-origin"]

        data = root / "data"
        data.mkdir(parents=True, exist_ok=True)
        snapshot_path = data / "webmentions.json"
        snapshot_path.write_text(
            '{"contract": 2, "updated": "2026-09-12", "mentions": []}\n',
            encoding="utf-8",
        )
        inbox_path = root / "inbox.json"
        inbox_path.write_text(
            json.dumps({"mentions": staged, "unresolved": staged_unresolved}),
            encoding="utf-8",
        )
        moderate = Path(__file__).with_name("moderate-webmentions.py")
        subprocess.run(
            [
                sys.executable,
                str(moderate),
                "--root",
                str(root),
                "--public-dir",
                str(public),
                "--inbox",
                str(inbox_path),
                "--approve",
                "wm-10",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        first_snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
        first = first_snapshot["mentions"][0]
        assert first_snapshot["contract"] == 2
        assert first["targetSnapshot"]["capturedAt"].endswith("Z")
        immutable_target = (
            first["targetReceived"],
            first["target"],
            first["targetSnapshot"],
        )

        second = dict(staged[0])
        second.update(
            {
                "id": "wm-13",
                "targetReceived": f"{BASE_URL}/library/old-one#:~:text=Before",
                "content_text": "Updated reply",
            }
        )
        inbox_path.write_text(
            json.dumps({"mentions": [second], "unresolved": []}),
            encoding="utf-8",
        )
        subprocess.run(
            [
                sys.executable,
                str(moderate),
                "--root",
                str(root),
                "--public-dir",
                str(public),
                "--inbox",
                str(inbox_path),
                "--approve",
                "wm-13",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        updated_snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
        assert len(updated_snapshot["mentions"]) == 1
        updated = updated_snapshot["mentions"][0]
        assert updated["id"] == "wm-10"
        assert updated["content_text"] == "Updated reply"
        assert (
            updated["targetReceived"],
            updated["target"],
            updated["targetSnapshot"],
        ) == immutable_target

        published = {fetch_module.interaction_key(updated): updated}
        raw_updated = dict(raw[0])
        raw_updated["content"] = {"text": "Updated reply"}
        unchanged_staged, _, _ = fetch_module.prepare_inbox(
            [raw_updated],
            registry,
            public,
            {"domains": set(), "authors": set()},
            published,
        )
        assert unchanged_staged == []

        contract_path = Path(__file__).with_name("check-webmention-contract.py")
        contract_spec = importlib.util.spec_from_file_location(
            "webmention_contract_check", contract_path
        )
        assert contract_spec and contract_spec.loader
        contract_module = importlib.util.module_from_spec(contract_spec)
        contract_spec.loader.exec_module(contract_module)
        malformed_entry = {
            "id": ["not", "hashable"],
            "type": ["reply"],
            "targetReceived": ["not", "a", "url"],
            "target": {"materialId": [ID_ONE], "selector": {"type": "document"}},
            "source": 42,
            "author_name": None,
            "author_url": None,
            "published": None,
            "content_text": None,
        }
        contract_errors: list[str] = []
        contract_module.check_entry(contract_errors, malformed_entry, 0, registry)
        assert contract_errors

        write_material(
            root,
            "two",
            ID_TWO,
            f"historicalUrls:\n  - {BASE_URL}/library/one\n",
        )
        try:
            build_registry(root)
        except RegistryError as error:
            assert "registry collision" in str(error)
        else:
            raise AssertionError("registry collision was accepted")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public = (
        args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    )
    registry = build_registry(root)
    missing = [
        material.canonical
        for material in registry.by_id.values()
        if not material_page(public, material).is_file()
    ]
    if missing:
        raise SystemExit("built pages missing for registry: " + ", ".join(missing))
    self_test()
    print(
        f"OK: {len(registry.by_id)} material(s), {len(registry.by_url)} address(es); "
        "registry collision, selector ambiguity and paginated domain fetch verified"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
