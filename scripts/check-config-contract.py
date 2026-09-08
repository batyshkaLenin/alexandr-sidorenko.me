#!/usr/bin/env python3
"""Verify site config invariants that the Workers Builds pipeline depends on.

Hugo can build with a surprising amount of config drift. This check pins the
values that define the public site identity and the pinned toolchain, so a
mistyped `baseURL` or a theme rename fails before `hugo build` and before any
deploy. It reads only files in the repository — never dashboard settings.

    python3 scripts/check-config-contract.py
    python3 scripts/check-config-contract.py --self-test

The review gate passes `--public-dir`; the flag is accepted and ignored, the
same way other source-level checks do.
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_BASE_URL = "https://alexandr-sidorenko.me/"
EXPECTED_THEME = "declassified"
EXPECTED_LANGUAGE = "ru"
EXPECTED_LOCALE = "ru-RU"
GITHUB_REPO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
HUGO_TOOL = re.compile(r"^(?:hugo-extended|hugo)\s+(\d+\.\d+\.\d+)\s*$", re.MULTILINE)


def load_toml(path: Path) -> dict:
    return tomllib.loads(path.read_text(encoding="utf-8"))


def tool_versions(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    match = HUGO_TOOL.search(text)
    if not match:
        raise ValueError(f"{path}: нет закреплённой версии hugo")
    return match.group(1)


def build_sh_hugo_version(path: Path) -> str | None:
    """Return the Hugo version string build.sh installs, if still hard-coded."""
    text = path.read_text(encoding="utf-8")
    # Prefer the value read from .tool-versions; fall back to a literal pin.
    if "tool-versions" in text and "HUGO_VERSION" in text:
        return None
    match = re.search(r'^HUGO_VERSION=([0-9.]+)\s*$', text, re.MULTILINE)
    return match.group(1) if match else None


def config_errors(root: Path, config_path: Path | None = None) -> list[str]:
    errors: list[str] = []
    hugo_toml = config_path or (root / "hugo.toml")
    tools = root / ".tool-versions"
    build_sh = root / "build.sh"

    if not hugo_toml.is_file():
        return [f"{hugo_toml}: файл конфигурации отсутствует"]
    if not tools.is_file():
        return [f"{tools}: нет pin toolchain"]

    try:
        config = load_toml(hugo_toml)
        pinned = tool_versions(tools)
    except Exception as error:  # noqa: BLE001 — surface parse failures as contract errors
        return [str(error)]

    if config.get("baseURL") != EXPECTED_BASE_URL:
        errors.append(
            f"hugo.toml: baseURL {config.get('baseURL')!r} вместо {EXPECTED_BASE_URL!r}"
        )
    if config.get("theme") != EXPECTED_THEME:
        errors.append(f"hugo.toml: theme {config.get('theme')!r} вместо {EXPECTED_THEME!r}")
    if config.get("defaultContentLanguage") != EXPECTED_LANGUAGE:
        errors.append(
            "hugo.toml: defaultContentLanguage "
            f"{config.get('defaultContentLanguage')!r} вместо {EXPECTED_LANGUAGE!r}"
        )
    if config.get("locale") != EXPECTED_LOCALE:
        errors.append(f"hugo.toml: locale {config.get('locale')!r} вместо {EXPECTED_LOCALE!r}")

    params = config.get("params") or {}
    repo = params.get("github_repo")
    if not isinstance(repo, str) or not GITHUB_REPO.match(repo):
        errors.append(
            f"hugo.toml: params.github_repo {repo!r} должен быть вида owner/name"
        )

    if "uglyURLs" in config and config["uglyURLs"] is True:
        errors.append("hugo.toml: uglyURLs=true ломает directory-style URLs Workers Static Assets")

    literal = build_sh_hugo_version(build_sh) if build_sh.is_file() else None
    if literal is not None and literal != pinned:
        errors.append(
            f"build.sh: HUGO_VERSION={literal} расходится с .tool-versions ({pinned})"
        )

    # build.sh must install the extended edition of the pinned version.
    if build_sh.is_file():
        text = build_sh.read_text(encoding="utf-8")
        if "hugo_extended_" not in text:
            errors.append("build.sh: должен скачивать hugo_extended_*, не community edition")
        if "--panicOnWarning" not in text:
            errors.append("build.sh: hugo build должен запускаться с --panicOnWarning")

    return errors


def self_test(root: Path) -> None:
    """A broken config fixture must fail; the real tree must pass."""
    real = config_errors(root)
    assert not real, f"self-test: рабочий hugo.toml красный: {real}"

    broken = """
baseURL = 'https://example.com/'
locale = 'en-US'
defaultContentLanguage = 'en'
theme = 'wrong-theme'

[params]
  github_repo = 'not-a-repo-path'
""".strip()
    with tempfile.TemporaryDirectory(prefix="config-schema-") as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "hugo.toml").write_text(broken + "\n", encoding="utf-8")
        (tmp_path / ".tool-versions").write_text("hugo-extended 0.165.0\n", encoding="utf-8")
        (tmp_path / "build.sh").write_text(
            "HUGO_VERSION=0.165.0\nhugo build --minify\n", encoding="utf-8"
        )
        errors = config_errors(tmp_path)
    assert any("baseURL" in error for error in errors), errors
    assert any("theme" in error for error in errors), errors
    assert any("github_repo" in error for error in errors), errors
    assert any("panicOnWarning" in error for error in errors), errors
    print("config-contract self-test: broken fixture отклонён, рабочий конфиг зелёный")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--public-dir", default="public", help="игнорируется; для гейта review")
    parser.add_argument("--config", type=Path, help="проверить указанный hugo.toml")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    if args.self_test:
        self_test(root)
        return 0

    errors = config_errors(root, args.config.resolve() if args.config else None)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        print(f"\nconfig-контракт: {len(errors)} ошибок", file=sys.stderr)
        return 1

    pinned = tool_versions(root / ".tool-versions")
    print(
        f"config-контракт: baseURL/theme/locale ок, Hugo {pinned} закреплён в .tool-versions"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
