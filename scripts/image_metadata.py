#!/usr/bin/env python3
"""The published-image metadata policy, shared by the stripper and the check.

What the site publishes about a photograph is the photograph. A camera writes
much more than that: `mattew-with-yamaha-46yo.jpg` arrived carrying `OPPO A54`,
`MediaTek Camera Application` and `2021:11:20 16:44:59` — the device its author
owned and the minute they pressed the button — in 41KB that rode along with
every request for a 2.9MB file.

So the policy is by segment, not by tag: a JPEG keeps only what a decoder needs
to render it correctly, and a PNG keeps only what describes its pixels.

JPEG — removed:
  APP1  Exif and XMP: camera, lens, software, timestamps, and GPS if present.
  APP13 Photoshop/IPTC: editing history and authorship blocks.
  COM   free-text comments, whatever a tool decided to leave behind.

JPEG — kept, because these change how the image decodes or displays:
  APP0  JFIF density/thumbnail header.
  APP2  ICC colour profile — dropping it shifts colour on wide-gamut screens.
  APP14 Adobe marker — carries the colour transform for CMYK/YCCK files.
  Everything else (DQT/DHT/SOF/DRI/SOS and the entropy-coded scan) is the image.

PNG — removed: tEXt, zTXt, iTXt, eXIf, tIME.
PNG — kept: everything else, including sRGB/gAMA/pHYs/cHRM/iCCP, which are
colour and scale rather than a statement about the author.

WebP — removed: EXIF and `XMP ` RIFF chunks, and the VP8X flag bits that
announce them, so the container does not keep claiming metadata it no longer
holds.
WebP — kept: VP8/VP8L/ALPH/ANIM/ANMF (the pixels) and ICCP (colour), matching
the JPEG and PNG rules above.

The site publishes WebP because responsive derivatives are encoded to it.
Hugo's encoder does not copy source metadata into a derivative, so in practice
these chunks are absent — but the check exists to verify that rather than to
assume it, and a source WebP added later goes through the same policy.

Both operations copy compressed data byte for byte and never re-encode, so the
visible pixels cannot change — which is what `check-content-parity.py` and the
task's own acceptance criterion demand.
"""

from __future__ import annotations

import struct
from pathlib import Path

JPEG_STRIP_MARKERS = {0xE1: "APP1 (Exif/XMP)", 0xED: "APP13 (Photoshop/IPTC)", 0xFE: "COM"}
PNG_STRIP_CHUNKS = {b"tEXt", b"zTXt", b"iTXt", b"eXIf", b"tIME"}
WEBP_STRIP_CHUNKS = {b"EXIF", b"XMP "}

# VP8X advertises what an extended-format file contains. Dropping a chunk
# without clearing its bit leaves a container that promises metadata no reader
# can find. Bit order is MSB-first: Rsv Rsv ICC Alpha EXIF XMP Anim Rsv.
VP8X_FLAG_BITS = {b"EXIF": 0x08, b"XMP ": 0x04}

JPEG_SUFFIXES = {".jpg", ".jpeg"}
WEBP_SUFFIXES = {".webp"}
IMAGE_SUFFIXES = JPEG_SUFFIXES | WEBP_SUFFIXES | {".png"}

# Formats this module cannot read. They are listed rather than ignored:
# metadata sits in container structures this parser knows nothing about, and
# silently passing such a file would be worse than failing — the check would
# claim a guarantee it never made.
UNSUPPORTED_SUFFIXES = {
    ".avif", ".heic", ".heif", ".jxl", ".gif",
    ".tif", ".tiff", ".bmp", ".svg",
}

# Markers that carry no length field, so the parser must not read one.
STANDALONE = {0xD8, 0xD9, 0x01} | set(range(0xD0, 0xD8))


def jpeg_findings(data: bytes) -> list[tuple[int, str, int]]:
    """Returns (marker, description, segment length) for each disallowed segment."""
    found: list[tuple[int, str, int]] = []
    if not data.startswith(b"\xff\xd8"):
        return found
    offset = 2
    while offset < len(data) - 1:
        if data[offset] != 0xFF:
            break
        marker = data[offset + 1]
        if marker == 0xFF:  # fill byte
            offset += 1
            continue
        if marker in STANDALONE:
            offset += 2
            continue
        if marker == 0xDA:  # start of scan — the rest is image data
            break
        if offset + 4 > len(data):
            break
        length = struct.unpack(">H", data[offset + 2 : offset + 4])[0]
        if marker in JPEG_STRIP_MARKERS:
            found.append((marker, JPEG_STRIP_MARKERS[marker], length + 2))
        offset += 2 + length
    return found


def jpeg_stripped(data: bytes) -> bytes:
    if not data.startswith(b"\xff\xd8"):
        return data
    out = bytearray(data[:2])
    offset = 2
    while offset < len(data) - 1:
        if data[offset] != 0xFF:
            break
        marker = data[offset + 1]
        if marker == 0xFF:
            out.append(0xFF)
            offset += 1
            continue
        if marker in STANDALONE:
            out += data[offset : offset + 2]
            offset += 2
            continue
        if marker == 0xDA:
            out += data[offset:]
            return bytes(out)
        if offset + 4 > len(data):
            break
        length = struct.unpack(">H", data[offset + 2 : offset + 4])[0]
        end = offset + 2 + length
        if marker not in JPEG_STRIP_MARKERS:
            out += data[offset:end]
        offset = end
    out += data[offset:]
    return bytes(out)


def png_chunks(data: bytes):
    offset = 8
    while offset + 8 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        end = offset + 12 + length
        yield kind, offset, end
        if kind == b"IEND":
            return
        offset = end


def png_findings(data: bytes) -> list[tuple[bytes, int]]:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return []
    return [
        (kind, end - start)
        for kind, start, end in png_chunks(data)
        if kind in PNG_STRIP_CHUNKS
    ]


def png_stripped(data: bytes) -> bytes:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return data
    out = bytearray(data[:8])
    for kind, start, end in png_chunks(data):
        if kind not in PNG_STRIP_CHUNKS:
            out += data[start:end]
    return bytes(out)


def webp_chunks(data: bytes):
    """(fourcc, start, end) for every RIFF chunk, with the odd-size pad byte
    counted in `end` — a chunk always begins on an even offset."""
    offset = 12
    while offset + 8 <= len(data):
        kind = data[offset : offset + 4]
        length = struct.unpack("<I", data[offset + 4 : offset + 8])[0]
        end = offset + 8 + length + (length & 1)
        yield kind, offset, end
        offset = end


def is_webp(data: bytes) -> bool:
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def webp_findings(data: bytes) -> list[tuple[bytes, int]]:
    if not is_webp(data):
        return []
    return [
        (kind, end - start)
        for kind, start, end in webp_chunks(data)
        if kind in WEBP_STRIP_CHUNKS
    ]


def webp_stripped(data: bytes) -> bytes:
    if not is_webp(data):
        return data
    body = bytearray()
    cleared = 0
    for kind, start, end in webp_chunks(data):
        if kind in WEBP_STRIP_CHUNKS:
            cleared |= VP8X_FLAG_BITS[kind]
            continue
        body += data[start:end]
    if cleared and body[:4] == b"VP8X":
        body[8] &= ~cleared & 0xFF
    return b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + bytes(body)


def findings(path: Path) -> list[tuple[str, int]]:
    """Disallowed metadata in one file, as (description, bytes) pairs."""
    data = path.read_bytes()
    suffix = path.suffix.lower()
    if suffix in JPEG_SUFFIXES:
        return [(name, size) for _, name, size in jpeg_findings(data)]
    if suffix in WEBP_SUFFIXES:
        return [(kind.decode("ascii").strip(), size) for kind, size in webp_findings(data)]
    return [(kind.decode("ascii"), size) for kind, size in png_findings(data)]


def stripped(path: Path, data: bytes) -> bytes:
    suffix = path.suffix.lower()
    if suffix in JPEG_SUFFIXES:
        return jpeg_stripped(data)
    if suffix in WEBP_SUFFIXES:
        return webp_stripped(data)
    return png_stripped(data)


def images(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
            yield path


def unsupported(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in UNSUPPORTED_SUFFIXES:
            yield path
