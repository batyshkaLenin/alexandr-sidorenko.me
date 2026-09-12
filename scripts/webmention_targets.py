#!/usr/bin/env python3
"""Address registry and text-selector primitives for the Webmention pipeline."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, ClassVar

BASE_URL = "https://alexandr-sidorenko.me"
API = "https://webmention.io/api/mentions.jf2"
TIMEOUT = 30
PER_PAGE = 100
MAX_PAGES = 1000
CONTEXT_CHARS = 32
PERCENT_ESCAPE = re.compile(r"%(?![0-9A-Fa-f]{2})")
BLOCK_TAGS = {
    "address",
    "article",
    "aside",
    "blockquote",
    "div",
    "dl",
    "dt",
    "dd",
    "figcaption",
    "figure",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
}


class RegistryError(ValueError):
    pass


class TextFragmentError(ValueError):
    pass


@dataclass(frozen=True)
class Material:
    material_id: str
    canonical: str
    source_path: Path


@dataclass
class AddressRegistry:
    by_url: dict[str, Material]
    by_id: dict[str, Material]

    def add(self, address: str, material: Material) -> None:
        key = normalize_registry_key(address)
        previous = self.by_url.get(key)
        if previous and previous.material_id != material.material_id:
            raise RegistryError(
                f"registry collision: {key} means both "
                f"{previous.material_id} and {material.material_id}"
            )
        self.by_url[key] = material


@dataclass(frozen=True)
class TextDirective:
    start: str
    end: str | None
    prefix: str | None
    suffix: str | None


@dataclass(frozen=True)
class Resolution:
    status: str
    target: dict[str, Any] | None = None
    target_snapshot: dict[str, str] | None = None
    diagnostic: str | None = None


class ContentTextParser(HTMLParser):
    """Extract a deterministic plain-text stream from the first e-content."""

    VOID: ClassVar[set[str]] = {
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    }
    SKIPPED: ClassVar[set[str]] = {"script", "style"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.complete = False
        self.skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if not self.depth:
            if self.complete:
                return
            classes = (dict(attrs).get("class") or "").split()
            if "e-content" not in classes:
                return
            self.depth = 1
            return

        if tag in self.SKIPPED:
            self.skip_depth += 1
        if not self.skip_depth and (tag in BLOCK_TAGS or tag == "br"):
            self.parts.append(" ")
        if tag not in self.VOID:
            self.depth += 1

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.depth and not self.skip_depth and (tag in BLOCK_TAGS or tag == "br"):
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if not self.depth:
            return
        if tag in self.SKIPPED and self.skip_depth:
            self.skip_depth -= 1
        if not self.skip_depth and tag in BLOCK_TAGS:
            self.parts.append(" ")
        if tag not in self.VOID:
            self.depth -= 1
            if not self.depth:
                self.complete = True

    def handle_data(self, data: str) -> None:
        if self.depth and not self.skip_depth:
            self.parts.append(data)

    def text(self) -> str:
        return normalize_text("".join(self.parts))


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _front_matter(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        raise RegistryError(f"{path}: missing front matter")
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return lines[1:index]
    raise RegistryError(f"{path}: unclosed front matter")


def _unquote_yaml(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def _material_fields(path: Path) -> dict[str, Any]:
    lines = _front_matter(path)
    result: dict[str, Any] = {"historicalUrls": []}
    index = 0
    while index < len(lines):
        match = re.match(r"^([A-Za-z][A-Za-z0-9_]*):\s*(.*?)\s*$", lines[index])
        if not match:
            index += 1
            continue
        key, raw = match.groups()
        if key in {"id", "slug", "draft"}:
            result[key] = _unquote_yaml(raw)
        elif key == "historicalUrls":
            values: list[str] = []
            if raw.startswith("[") and raw.endswith("]"):
                values = [
                    _unquote_yaml(part) for part in raw[1:-1].split(",") if part.strip()
                ]
            elif raw:
                raise RegistryError(f"{path}: historicalUrls must be a list")
            else:
                cursor = index + 1
                while cursor < len(lines):
                    item = re.match(r"^\s+-\s+(.+?)\s*$", lines[cursor])
                    if not item:
                        break
                    values.append(_unquote_yaml(item.group(1)))
                    cursor += 1
                index = cursor - 1
            result[key] = values
        index += 1
    return result


def _origin_parts() -> tuple[str, str]:
    parsed = urllib.parse.urlsplit(BASE_URL)
    return parsed.scheme.lower(), parsed.netloc.lower()


def normalize_registry_key(address: str) -> str:
    parsed = urllib.parse.urlsplit(address)
    scheme, netloc = _origin_parts()
    if parsed.scheme.lower() != scheme or parsed.netloc.lower() != netloc:
        raise RegistryError(f"foreign registry address: {address}")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise RegistryError(f"registry address must be a plain absolute URL: {address}")
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")
    return urllib.parse.urlunsplit((scheme, netloc, path, "", ""))


def build_registry(root: Path) -> AddressRegistry:
    registry = AddressRegistry({}, {})
    library = root / "content" / "library"
    for path in sorted(library.glob("*.md")):
        if path.name == "_index.md":
            continue
        fields = _material_fields(path)
        if str(fields.get("draft", "false")).lower() == "true":
            continue
        material_id = str(fields.get("id") or "")
        if not material_id:
            raise RegistryError(f"{path}: published material has no id")
        slug = str(fields.get("slug") or path.stem)
        material = Material(material_id, f"{BASE_URL}/library/{slug}", path)
        previous = registry.by_id.get(material_id)
        if previous and previous.source_path != path:
            raise RegistryError(
                f"material id collision: {material_id} in {previous.source_path} and {path}"
            )
        registry.by_id[material_id] = material
        registry.add(material.canonical, material)
        registry.add(f"{BASE_URL}/id/{material_id}", material)
        for historical in fields["historicalUrls"]:
            registry.add(historical, material)
    return registry


def material_page(public_dir: Path, material: Material) -> Path:
    path = urllib.parse.urlsplit(material.canonical).path.strip("/")
    return public_dir / path / "index.html"


def material_text(public_dir: Path, material: Material) -> str:
    page = material_page(public_dir, material)
    if not page.is_file():
        raise FileNotFoundError(f"{material.canonical}: no built page at {page}")
    parser = ContentTextParser()
    parser.feed(page.read_text(encoding="utf-8"))
    text = parser.text()
    if not text:
        raise ValueError(f"{material.canonical}: built page has no e-content text")
    return text


def _decode_component(value: str, label: str) -> str:
    if "-" in value:
        raise TextFragmentError(f"unescaped hyphen in {label}")
    if PERCENT_ESCAPE.search(value):
        raise TextFragmentError(f"invalid percent escape in {label}")
    try:
        decoded = urllib.parse.unquote(value, encoding="utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise TextFragmentError(f"invalid UTF-8 in {label}") from error
    decoded = normalize_text(decoded)
    if not decoded:
        raise TextFragmentError(f"empty {label}")
    if not _primary_key(decoded):
        raise TextFragmentError(f"{label} has no searchable characters")
    return decoded


def text_directive(fragment: str) -> TextDirective | None:
    if ":~:" not in fragment:
        return None
    directives = fragment.split(":~:", 1)[1].split("&")
    values = [item[5:] for item in directives if item.startswith("text=")]
    if not values:
        return None
    if len(values) != 1:
        raise TextFragmentError("multiple text directives are unsupported")

    parts = values[0].split(",")
    prefix = None
    suffix = None
    if len(parts) > 1 and parts[0].endswith("-"):
        prefix = _decode_component(parts.pop(0)[:-1], "prefix")
    if len(parts) > 1 and parts[-1].startswith("-"):
        suffix = _decode_component(parts.pop()[1:], "suffix")
    if len(parts) not in {1, 2}:
        raise TextFragmentError("invalid text directive shape")
    start = _decode_component(parts[0], "start")
    end = _decode_component(parts[1], "end") if len(parts) == 2 else None
    return TextDirective(start, end, prefix, suffix)


def _primary_key(value: str) -> str:
    """Approximate the Text Fragments primary-level Unicode comparison."""
    return "".join(
        character
        for source in value
        for character in unicodedata.normalize("NFD", source.casefold())
        if not unicodedata.category(character).startswith("M")
    )


def _search_form(value: str) -> tuple[str, list[int]]:
    key: list[str] = []
    origins: list[int] = []
    for index, source in enumerate(value):
        primary = _primary_key(source)
        key.extend(primary)
        origins.extend([index] * len(primary))
    return "".join(key), origins


def _occurrences(text: str, needle: str, start_at: int = 0) -> list[tuple[int, int]]:
    search_text, origins = _search_form(text)
    search_needle = _primary_key(needle)
    found: list[tuple[int, int]] = []
    cursor = 0
    while True:
        index = search_text.find(search_needle, cursor)
        if index < 0:
            return found
        key_end = index + len(search_needle)
        starts_inside_expansion = index > 0 and origins[index - 1] == origins[index]
        ends_inside_expansion = (
            key_end < len(origins) and origins[key_end - 1] == origins[key_end]
        )
        original_start = origins[index]
        original_end = origins[key_end] if key_end < len(origins) else len(text)
        if (
            original_start >= start_at
            and not starts_inside_expansion
            and not ends_inside_expansion
        ):
            found.append((original_start, original_end))
        cursor = index + 1


def _context_matches(value: str, expected: str, *, suffix: bool) -> bool:
    actual = _primary_key(value.strip())
    context = _primary_key(expected.strip())
    return actual.endswith(context) if suffix else actual.startswith(context)


def quote_candidates(text: str, directive: TextDirective) -> list[tuple[int, int]]:
    candidates: list[tuple[int, int]] = []
    for start, start_end in _occurrences(text, directive.start):
        ranges = [(start, start_end)]
        if directive.end is not None:
            ranges = [
                (start, end)
                for _, end in _occurrences(text, directive.end, start_at=start_end)
            ]
        for range_start, range_end in ranges:
            if directive.prefix is not None and not _context_matches(
                text[:range_start], directive.prefix, suffix=True
            ):
                continue
            if directive.suffix is not None and not _context_matches(
                text[range_end:], directive.suffix, suffix=False
            ):
                continue
            candidates.append((range_start, range_end))
    return candidates


def _document_target(material: Material) -> dict[str, Any]:
    return {"materialId": material.material_id, "selector": {"type": "document"}}


def resolve_target(
    target_received: str,
    registry: AddressRegistry,
    public_dir: Path,
    captured_at: str | None = None,
) -> Resolution:
    parsed = urllib.parse.urlsplit(target_received)
    scheme, netloc = _origin_parts()
    if parsed.scheme.lower() != scheme or parsed.netloc.lower() != netloc:
        return Resolution("foreign", diagnostic="foreign-origin")
    base = urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, parsed.query, "")
    )
    try:
        key = normalize_registry_key(base)
    except RegistryError:
        return Resolution("unsupported", diagnostic="unsupported-target")
    material = registry.by_url.get(key)
    if material is None:
        return Resolution("unsupported", diagnostic="unsupported-target")

    try:
        directive = text_directive(parsed.fragment)
    except TextFragmentError as error:
        return Resolution("unresolved", diagnostic=f"malformed-text-fragment: {error}")
    if directive is None:
        return Resolution("resolved", target=_document_target(material))

    try:
        text = material_text(public_dir, material)
    except (FileNotFoundError, ValueError) as error:
        return Resolution("unresolved", diagnostic=str(error))
    candidates = quote_candidates(text, directive)
    if len(candidates) != 1:
        reason = (
            "text-fragment-not-found" if not candidates else "text-fragment-ambiguous"
        )
        return Resolution(
            "resolved",
            target=_document_target(material),
            diagnostic=reason,
        )

    start, end = candidates[0]
    exact = text[start:end]
    selector = {
        "type": "quote",
        "exact": exact,
        "prefix": text[max(0, start - CONTEXT_CHARS) : start],
        "suffix": text[end : end + CONTEXT_CHARS],
        "position": {"start": start, "end": end},
    }
    snapshot = {
        "text": exact,
        "materialVersion": "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest(),
    }
    if captured_at is not None:
        snapshot["capturedAt"] = captured_at
    return Resolution(
        "resolved",
        target={"materialId": material.material_id, "selector": selector},
        target_snapshot=snapshot,
    )


def normalize_source(source: str) -> str:
    parsed = urllib.parse.urlsplit(source)
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")
    return urllib.parse.urlunsplit((scheme, netloc, path, parsed.query, ""))


def interaction_key(entry: dict[str, Any]) -> tuple[str, str]:
    return entry["target"]["materialId"], normalize_source(str(entry["source"]))


PageLoader = Callable[[dict[str, Any]], list[dict[str, Any]]]


def _load_domain_page(params: dict[str, Any]) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{API}?{query}",
        headers={"User-Agent": "alexandr-sidorenko.me webmention import"},
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        payload = json.load(response)
    children = payload.get("children")
    return children if isinstance(children, list) else []


def fetch_domain_mentions(
    token: str,
    domain: str,
    since: str | None = None,
    *,
    per_page: int = PER_PAGE,
    page_loader: PageLoader | None = None,
) -> list[dict[str, Any]]:
    if not token:
        raise ValueError("WEBMENTION_IO_TOKEN is empty")
    loader = page_loader or _load_domain_page
    mentions: list[dict[str, Any]] = []
    for page in range(MAX_PAGES):
        params: dict[str, Any] = {
            "domain": domain,
            "token": token,
            "per-page": per_page,
            "page": page,
        }
        if since:
            params["since"] = since
        children = loader(params)
        mentions.extend(children)
        if len(children) < per_page:
            return mentions
    raise RuntimeError(f"webmention.io pagination exceeded {MAX_PAGES} pages")
