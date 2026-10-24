#!/usr/bin/env python3
"""Geometry-only redaction: real outputs plus disposable Hugo boundary fixtures."""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BUCKETS = {'2', '4', '6', '8', '12'}


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def has(self, cls):
        return cls in self.attrs.get('class', '').split()

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def text(self):
        return ''.join(c.text() if isinstance(c, Node) else c for c in self.children)


class Document(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.root = Node()
        self.stack = [self.root]
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def inspect(source):
    roots = [n for n in Document(source).root.walk() if n.has('as-redaction')]
    for root in roots:
        nodes = list(root.walk())
        assert all(not {'style', 'title', 'tabindex', 'aria-label'} & n.attrs.keys() for n in nodes), 'redaction must be CSP-safe and non-interactive'
        shape = [n for n in nodes if n.has('as-redaction__shape')]
        labels = [n for n in nodes if n.has('as-redaction__replacement')]
        assert len(shape) == len(labels) == 1, 'one shape and replacement per fragment'
        assert shape[0].attrs.get('aria-hidden') == 'true', 'visual geometry must be hidden from AT'
        assert labels[0].attrs.get('aria-hidden') != 'true' and labels[0].text() == '[вымарано]', 'replacement must be readable'
        assert not any(n is labels[0] for n in shape[0].walk()), 'replacement must not be inside hidden shape'
        assert not shape[0].text().strip(), 'shape must carry only open whitespace, never text or block characters'
        for word in [n for n in nodes if n.has('as-redaction__word')]:
            assert any(word.has('as-redaction-w'+bucket) for bucket in BUCKETS), 'unbounded word width'
        for row in [n for n in nodes if n.has('as-redaction__row')]:
            words = [n for n in row.children if isinstance(n, Node) and n.has('as-redaction__word')]
            assert words, 'empty redaction row'
            assert sum(c.count(' ') for c in row.children if isinstance(c, str)) >= len(words)-1, 'word spaces lost'
    return roots


def run_hugo(directory):
    result = subprocess.run(['hugo', '--source', str(directory), '--destination', str(directory/'public'), '--panicOnWarning', '--noBuildLock'], capture_output=True, text=True)
    return result.returncode


def fixtures(directory, public):
    (directory/'layouts/_shortcodes').mkdir(parents=True)
    (directory/'content').mkdir()
    shutil.copyfile(ROOT/'layouts/_shortcodes/redacted.html', directory/'layouts/_shortcodes/redacted.html')
    (directory/'hugo.toml').write_text('baseURL = "https://fixture.invalid/"\ndisableKinds = ["taxonomy", "term", "sitemap", "RSS"]\n[markup.goldmark.renderer]\nunsafe = true\n')
    home = Document((public/'index.html').read_text()).root
    links = [n.attrs['href'] for n in home.walk() if n.tag == 'link' and n.attrs.get('rel') == 'stylesheet']
    assert links, 'built stylesheet links missing'
    head = ''.join('<link rel="stylesheet" href="'+href+'">' for href in links)
    (directory/'layouts/home.html').write_text('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+head+'<title>Redaction fixture</title><main class="dc-main"><div class="dc-prose e-content">{{ .Content }}</div></main></html>')
    source = directory/'content/_index.md'
    def short(ident, params):
        return '{{< redacted id="'+ident+'" rule="П1" '+params+' >}}'
    positive = '\n\n'.join([
        '<p id="baseline">До обычного фрагмента, после.</p>',
        '<p id="inline">До '+short('test-inline', 'words="2 4 6 8 12"')+', после.</p>',
        '<p id="long">До '+short('test-long', 'words="'+' '.join(['12']*25)+'"')+', после.</p>',
        short('test-line', 'geometry="line" words="4 8 6"'),
        short('test-block', 'geometry="block" words="4 8;2 6|12 4" lines="100,80,60"'),
        short('test-narrow', 'geometry="block" words="'+' '.join(['12']*25)+'" lines="10"'),
    ])
    source.write_text('---\ntitle: Synthetic geometry\n---\n'+positive)
    assert run_hugo(directory) == 0, 'positive shortcode fixtures failed'
    html = (directory/'public/index.html').read_text()
    roots = inspect(html)
    assert len(roots) == 5, 'positive fixtures missing'
    block = next(n for n in roots if n.attrs.get('data-redaction') == 'test-block')
    assert len([n for n in block.walk() if n.has('as-redaction__paragraph')]) == 2, 'paragraph structure lost'
    assert len([n for n in block.walk() if n.has('as-redaction__row')]) == 3, 'row structure lost'
    output = directory/'fixture.html'
    output.write_text(html)
    invalid = [
        'words="5"', 'words="2 4" len="45"', 'words="2" mode="preserve"',
        'words="PRIVATE_CANARY"', 'words="2;4"', 'words="2" original="PRIVATE_CANARY"',
        'geometry="block" words="2;4" lines="100"',
        'geometry="block" words="2" lines="75"',
        'geometry="unknown" words="2"', 'words="2||4"', 'words=""',
    ]
    for params in invalid:
        source.write_text('---\ntitle: Invalid geometry\n---\n'+short('invalid', params))
        shutil.rmtree(directory/'public')
        assert run_hugo(directory) != 0, 'invalid shortcode input accepted'
        for file in (directory/'public').rglob('*'):
            if file.is_file():
                assert b'PRIVATE_CANARY' not in file.read_bytes(), 'rejected private payload leaked'
    source.write_text('---\ntitle: Invalid body\n---\n'+short('invalid', 'words="2"')+'PRIVATE_CANARY{{< /redacted >}}')
    assert run_hugo(directory) != 0, 'paired shortcode must reject an original body'
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public-dir', type=Path, default=Path('public'))
    parser.add_argument('--browser', choices=['tests/browser/redaction.spec.ts'])
    parser.add_argument('--fixture-output', type=Path, help='copy the disposable geometry fixture for the browser spec')
    args = parser.parse_args()
    public = args.public_dir.resolve()
    assert (public/'library/skver/index.html').is_file(), 'fresh site build required'
    count = sum(len(inspect(file.read_text())) for file in public.rglob('*.html'))
    assert count, 'real production redaction missing'
    for feed in public.rglob('feed.json'):
        for item in json.loads(feed.read_text()).get('items', []):
            inspect(item.get('content_html', ''))
    with tempfile.TemporaryDirectory(prefix='redaction-contract-') as tmp:
        directory = Path(tmp)
        fixture = fixtures(directory, public)
        if args.fixture_output:
            args.fixture_output.write_text(fixture.read_text())
        if args.browser:
            env = dict(os.environ, PUBLIC_DIR=str(public), REDACTION_FIXTURE_HTML=str(fixture))
            subprocess.run([str(ROOT/'node_modules/.bin/playwright'), 'test', args.browser,
                '--project=chromium-desktop', '--workers=1', '--output', str(directory/'browser')], cwd=ROOT, env=env, check=True)
    print(f'OK: redaction contract — {count} real fragments, geometry/AT/CSP markup, positive and 12 negative Hugo fixtures')


if __name__ == '__main__':
    main()
