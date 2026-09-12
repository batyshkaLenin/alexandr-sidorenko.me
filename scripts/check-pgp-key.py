#!/usr/bin/env python3
"""Verify the published OpenPGP key and its HTML discovery link."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path

EXPECTED_FINGERPRINT = "742587A7940BC99F2F5AC7CD0D7EC386CBEF33F6"
EXPECTED_UID = "Aleksandr Sidorenko (batyshkaLenin) <mail@alexandr-sidorenko.me>"
EXPECTED_EXPIRY = 1848833153  # 2028-08-02T12:45:53Z
EXPECTED_ENCRYPTION_SUBKEY = "521A7E1C325D41CB"
EXPECTED_EXPIRY_DATE = "2028-08-02"
EXPECTED_HREF = "/key.pub"
UNUSABLE_VALIDITY = {"d", "e", "i", "r"}


class PgpKeyLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_head = False
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "head":
            self.in_head = True
            return
        if tag != "link" or not self.in_head:
            return
        values = dict(attrs)
        relations = (values.get("rel") or "").split()
        if "pgpkey" in relations:
            self.hrefs.append(values.get("href") or "")

    def handle_endtag(self, tag: str) -> None:
        if tag == "head":
            self.in_head = False


def run_gpg(home: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["gpg", "--batch", "--no-options", "--homedir", str(home), *args],
        check=False,
        capture_output=True,
        text=True,
    )


def primary_fingerprints(colons: str) -> list[str]:
    fingerprints: list[str] = []
    awaiting_primary = False
    for line in colons.splitlines():
        fields = line.split(":")
        record = fields[0]
        if record == "pub":
            awaiting_primary = True
        elif record in ("sub", "ssb"):
            awaiting_primary = False
        elif record == "fpr" and awaiting_primary:
            fingerprints.append(fields[9])
            awaiting_primary = False
    return fingerprints


def timestamp_date(value: str) -> str | None:
    try:
        return datetime.fromtimestamp(int(value), UTC).date().isoformat()
    except (OverflowError, ValueError):
        return None


def metadata_errors(colons: str, now: int | None = None) -> list[str]:
    """Compare GnuPG's machine-readable listing with T11's locked key data."""
    errors: list[str] = []
    records = [line.split(":") for line in colons.splitlines() if line]
    primary = [record for record in records if record[0] == "pub"]
    if len(primary) != 1:
        return [f"expected exactly one primary public key, found {len(primary)}"]

    pub = primary[0]
    if pub[1] in UNUSABLE_VALIDITY:
        errors.append(f"primary key is unusable (validity={pub[1]!r})")
    if pub[2:4] != ["4096", "1"]:
        errors.append(
            f"primary key is not RSA 4096 (bits={pub[2]!r}, algorithm={pub[3]!r})"
        )

    actual_fingerprints = primary_fingerprints(colons)
    if actual_fingerprints != [EXPECTED_FINGERPRINT]:
        errors.append(
            f"primary fingerprints are {actual_fingerprints!r}, "
            f"expected [{EXPECTED_FINGERPRINT!r}]"
        )

    expiry_raw = pub[6] if len(pub) > 6 else ""
    try:
        expiry = int(expiry_raw)
    except ValueError:
        expiry = 0
    if expiry != EXPECTED_EXPIRY:
        errors.append(
            f"primary expiry is {timestamp_date(expiry_raw)!r}, expected {EXPECTED_EXPIRY_DATE}"
        )
    if expiry <= (int(time.time()) if now is None else now):
        errors.append("primary key is expired")

    uids = [record[9] for record in records if record[0] == "uid" and len(record) > 9]
    if uids != [EXPECTED_UID]:
        errors.append(f"UIDs are {uids!r}, expected [{EXPECTED_UID!r}]")

    subkeys = [record for record in records if record[0] == "sub"]
    encryption_subkeys = [
        record
        for record in subkeys
        if len(record) > 11
        and record[4] == EXPECTED_ENCRYPTION_SUBKEY
        and "e" in record[11].lower()
    ]
    if len(encryption_subkeys) != 1:
        errors.append(
            f"expected encryption subkey {EXPECTED_ENCRYPTION_SUBKEY}, "
            f"found {len(encryption_subkeys)}"
        )
    else:
        subkey = encryption_subkeys[0]
        if subkey[1] in UNUSABLE_VALIDITY:
            errors.append(f"encryption subkey is unusable (validity={subkey[1]!r})")
        try:
            subkey_expiry = int(subkey[6])
        except (IndexError, ValueError):
            subkey_expiry = 0
        if timestamp_date(str(subkey_expiry)) != EXPECTED_EXPIRY_DATE:
            errors.append(
                f"encryption subkey expiry is {timestamp_date(str(subkey_expiry))!r}, "
                f"expected {EXPECTED_EXPIRY_DATE}"
            )
        if subkey_expiry <= (int(time.time()) if now is None else now):
            errors.append("encryption subkey is expired")

    return errors


def self_test() -> int:
    """Prove that mutable metadata cannot drift behind a stable fingerprint."""
    valid = (
        "pub:-:4096:1:0D7EC386CBEF33F6:1754044336:1848833153::-:::scESC::::::23::0:\n"
        f"fpr:::::::::{EXPECTED_FINGERPRINT}:\n"
        f"uid:-::::1785761153::hash::{EXPECTED_UID}::::::::::0:\n"
        "sub:-:4096:1:521A7E1C325D41CB:1754044336:1848833237:::::e::::::23:\n"
        "fpr:::::::::3E47F5A868E904D2163C843E521A7E1C325D41CB:"
    )
    now = 1789158907  # 2026-09-11, before the locked expiry
    if errors := metadata_errors(valid, now=now):
        raise AssertionError(f"self-test: valid fixture rejected: {errors}")

    cases = {
        "revoked primary": valid.replace("pub:-:", "pub:r:", 1),
        "expired primary": valid.replace(":1848833153:", ":1:", 1),
        "wrong UID": valid.replace(EXPECTED_UID, "Wrong identity <wrong@example.test>"),
        "missing encryption subkey": "\n".join(valid.splitlines()[:3]),
        "revoked encryption subkey": valid.replace("sub:-:", "sub:r:", 1),
    }
    for name, fixture in cases.items():
        if not metadata_errors(fixture, now=now):
            raise AssertionError(f"self-test: {name} fixture was accepted")
    return len(cases)


def check_key(errors: list[str], key_file: Path) -> None:
    if not key_file.is_file():
        errors.append(f"{key_file}: missing")
        return

    armor = key_file.read_text(encoding="ascii", errors="replace")
    if "-----BEGIN PGP PUBLIC KEY BLOCK-----" not in armor:
        errors.append(f"{key_file}: not an armored public key")
    if "PRIVATE KEY BLOCK" in armor:
        errors.append(f"{key_file}: contains private-key armor")

    try:
        with tempfile.TemporaryDirectory(prefix="pgp-key-check-") as directory:
            home = Path(directory)
            os.chmod(home, 0o700)

            imported = run_gpg(home, "--import", str(key_file))
            if imported.returncode != 0:
                errors.append(
                    f"{key_file}: gpg import failed: {imported.stderr.strip()}"
                )
                return

            listed = run_gpg(home, "--with-colons", "--fingerprint", "--list-keys")
            if listed.returncode != 0:
                errors.append(
                    f"{key_file}: gpg could not list imported keys: {listed.stderr.strip()}"
                )
                return
            errors.extend(
                f"{key_file}: {error}" for error in metadata_errors(listed.stdout)
            )

            secrets = run_gpg(home, "--with-colons", "--list-secret-keys")
            if secrets.returncode != 0:
                errors.append(
                    f"{key_file}: gpg could not list secret keys: {secrets.stderr.strip()}"
                )
            else:
                secret_records = [
                    line
                    for line in secrets.stdout.splitlines()
                    if line.startswith(("sec:", "ssb:"))
                ]
                if secret_records:
                    errors.append(f"{key_file}: import produced secret-key records")

            packets = run_gpg(home, "--list-packets", str(key_file))
            if packets.returncode != 0:
                errors.append(
                    f"{key_file}: gpg could not inspect packets: {packets.stderr.strip()}"
                )
            elif any(
                marker in packets.stdout.lower()
                for marker in (":secret key packet:", ":secret sub key packet:")
            ):
                errors.append(f"{key_file}: contains secret-key packets")
    except FileNotFoundError:
        errors.append("gpg is required to verify the published OpenPGP key")


def check_html(errors: list[str], public_dir: Path) -> int:
    pages = sorted(public_dir.rglob("*.html"))
    if not pages:
        errors.append(f"{public_dir}: no built HTML files")
        return 0

    for page in pages:
        parser = PgpKeyLinkParser()
        parser.feed(page.read_text(encoding="utf-8"))
        if parser.hrefs != [EXPECTED_HREF]:
            errors.append(
                f"{page}: rel=pgpkey hrefs are {parser.hrefs!r}, expected [{EXPECTED_HREF!r}]"
            )
    return len(pages)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--public-dir", type=Path, default=Path("public"))
    args = parser.parse_args()

    root = args.root.resolve()
    public_dir = (
        args.public_dir if args.public_dir.is_absolute() else root / args.public_dir
    )
    errors: list[str] = []
    negative_cases = self_test()

    check_key(errors, public_dir / "key.pub")
    page_count = check_html(errors, public_dir)

    if errors:
        print("OpenPGP key contract check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"OK: key.pub imports as {EXPECTED_FINGERPRINT}, contains no secret key, "
        f"{page_count} HTML head(s) link {EXPECTED_HREF}, and {negative_cases} "
        "controlled metadata failures are rejected"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
