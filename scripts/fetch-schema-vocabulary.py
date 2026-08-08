#!/usr/bin/env python3
"""Rebuild tests/fixtures/schema-org-vocabulary.json from schema.org.

Downloads the current schema.org vocabulary and stores the part
check-schema-contract.py needs: every class with its superclass chain, and
every property with its domain and range. Needs network access; the contract
check itself does not, which is why the vocabulary is committed.

    python3 scripts/fetch-schema-vocabulary.py
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

SOURCE = "https://schema.org/version/latest/schemaorg-current-https.jsonld"
OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "schema-org-vocabulary.json"
PREFIX = "schema:"


def names(node: dict, key: str) -> list[str]:
    value = node.get(key)
    if value is None:
        return []
    if isinstance(value, dict):
        value = [value]
    out = []
    for item in value:
        ident = item.get("@id", "")
        if ident.startswith(PREFIX):
            out.append(ident[len(PREFIX):])
    return sorted(out)


def main() -> int:
    with urllib.request.urlopen(SOURCE, timeout=120) as response:
        graph = json.loads(response.read().decode("utf-8"))["@graph"]

    classes: dict[str, list[str]] = {}
    properties: dict[str, dict[str, list[str]]] = {}
    for node in graph:
        node_type = node.get("@type")
        ident = node.get("@id", "")
        if not ident.startswith(PREFIX):
            continue
        name = ident[len(PREFIX):]
        if node_type == "rdfs:Class":
            classes[name] = names(node, "rdfs:subClassOf")
        elif node_type == "rdf:Property":
            properties[name] = {
                "domain": names(node, "schema:domainIncludes"),
                "range": names(node, "schema:rangeIncludes"),
            }

    if not classes or not properties:
        print("не удалось разобрать словарь: пустые classes/properties", file=sys.stderr)
        return 1

    OUT.write_text(
        json.dumps(
            {"source": SOURCE, "classes": classes, "properties": properties},
            ensure_ascii=False,
            indent=1,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{OUT}: классов {len(classes)}, свойств {len(properties)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
