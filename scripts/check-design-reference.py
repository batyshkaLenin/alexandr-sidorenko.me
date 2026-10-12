#!/usr/bin/env python3
"""Primary 4A source-binding and output-isolation check.

YAML is parsed by the existing locked Playwright dependency's YAML parser;
Node and the installed project dependencies are required, with no new package.

Compare reference vs disabled builds in --build-root produced by
build-design-reference.py. Optional --control-root also proves byte parity with
pre-change builds. --self-test injects a leak in a disposable copy and requires
the ordinary CLI to reject it; it never mutates a repository or original output.
"""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
THEME = ROOT / 'themes/declassified'
MARKERS = (b'__design', b'__preview', b'data-design-example', b'data-design-reference')
TARGETS = {'site': '__design/site/index.html', 'theme': '__design/theme/index.html'}


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.nodes = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.nodes.append((tag, dict(attrs)))

    def has(self, tag, **attrs):
        return any(t == tag and all(a.get(k) == v for k, v in attrs.items()) for t, a in self.nodes)


def files(root):
    assert root.is_dir(), f'missing build: {root}'
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob('*') if p.is_file()}


def isolated(root, allowed=()):
    for name, body in files(root).items():
        if name in allowed:
            continue
        assert not any(m in name.encode() or m in body for m in MARKERS), f'REFERENCE_LEAK: {root.name}/{name}'


def parity(control, candidate, added=()):
    a, b = files(control), files(candidate)
    assert b.keys() - a.keys() == set(added), f'unexpected additions: {candidate}: {sorted(b.keys()-a.keys())}'
    assert not a.keys() - b.keys(), f'outputs removed: {candidate}'
    changed = [name for name in a if a[name] != b[name]]
    assert not changed, f'ordinary output changed: {candidate}: {changed}'


def fixture_frontmatter(path):
    lines = path.read_text().splitlines(keepends=True)
    assert lines and lines[0].strip() == '---', f'frontmatter required: {path}'
    end = next((i for i, line in enumerate(lines[1:], 1) if line.strip() == '---'), None)
    assert end is not None, f'unclosed frontmatter: {path}'
    parser = '''
const { yaml } = require('playwright-core/lib/utilsBundle');
const fs = require('node:fs');
process.stdout.write(JSON.stringify(yaml.parse(fs.readFileSync(0, 'utf8'), { uniqueKeys: true, merge: true })));
'''
    result = subprocess.run(['node', '-e', parser], input=''.join(lines[1:end]), cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 0, f'FIXTURE_YAML: {path}: {result.stderr.strip()}'
    data = json.loads(result.stdout)
    # These are the existing reference fixture fields, not a general Hugo policy.
    allowed = {
        '': {'title', 'type', 'url', 'outputs', 'params', 'build', 'sitemap'},
        'params': {'design_reference'},
        'build': {'render', 'list', 'publishresources'},
        'sitemap': {'disable'},
    }

    def mapping(value, context):
        assert isinstance(value, dict), f'FIXTURE_FIELDS: {path}: {context or "frontmatter"} must be a mapping'
        assert all(isinstance(key, str) for key in value), f'FIXTURE_FIELDS: {path}: non-string key'
        normalized = {key.lower(): item for key, item in value.items()}
        assert len(normalized) == len(value), f'FIXTURE_FIELDS: {path}: duplicate normalized key'
        unknown = normalized.keys() - allowed[context]
        assert not unknown, f'FIXTURE_FIELDS: {path}: {context or "frontmatter"}: editorial/unknown fields: {sorted(unknown)}'
        return normalized

    data = mapping(data, '')
    for context in ('params', 'build', 'sitemap'):
        if context in data:
            data[context] = mapping(data[context], context)
    build = data.get('build', {})
    assert build.get('list') == 'never' and build.get('publishresources') is False, f'FIXTURE_FIELDS: {path}: list/resource isolation missing'
    assert not re.search(r'<(?:script|style|figure|table|pre|img)\b', ''.join(lines[end+1:])), 'fixture copied renderer markup'
    return data


def source_bindings():
    seen = set()
    for owner, manifest in [(ROOT, ROOT/'data/design-reference.json'), (THEME, THEME/'exampleSite/data/design-states.json')]:
        data = json.loads(manifest.read_text())
        assert data['schema'] == 'design-reference/v1'
        for example in data['examples']:
            assert example['id'] not in seen, 'duplicate manifest example ID'
            seen.add(example['id'])
            for key in ('rule', 'source', 'invocation', 'state', 'coverage', 'conformance'):
                assert example.get(key), f'{example["id"]}: missing {key}'
            assert 'known_deviation' in example
            for key in ('source', 'invocation'):
                path = (owner/example[key]).resolve()
                assert path.is_relative_to(owner) and path.is_file(), f'broken {key}: {path}'
            rule, anchor = example['rule'].removeprefix('v2:').split('#')
            canonical = ROOT/'.ai/v2'/rule
            text = canonical.read_text()
            headings = re.findall(r'^#+\s+(.+)$', text, re.M)
            slugs = [re.sub(r'[^\w -]', '', h.lower()).replace(' ', '-') for h in headings]
            assert anchor in headings or anchor in slugs, f'broken canonical rule: {example["rule"]}'
    wrapper = (ROOT/'layouts/design-reference/page.html').read_text()
    assert 'partial "library/type-badge.html" (dict "page" $material "linked" true)' in wrapper
    assert 'site.GetPage "/library/bluredu-new-teachers"' in wrapper
    assert '{{ .Content }}' in wrapper
    assert 'partial "publication/figure.html"' in (ROOT/'layouts/_markup/render-image.html').read_text()
    fixture = (ROOT/'content/__preview/design/index.md').read_text()
    assert '![' in fixture and '```python' in fixture and '| Состояние | Проверка |' in fixture
    assert not (ROOT/'layouts/design-reference/_markup').exists(), 'reference must not override production hooks'
    assert not (THEME/'exampleSite/layouts/page.html').exists(), 'reference must use theme generic page'
    shortcode = (THEME/'exampleSite/layouts/_shortcodes/design-examples.html').read_text()
    for name in ('dc-copy', 'dc-listnav'):
        assert f'partial "declassified/component.html" "{name}"' in shortcode
        assert f'<{name}' in shortcode
    # Reference wrappers supply native inputs, never renderer output or definitions.
    for directory in (ROOT/'layouts/design-reference', ROOT/'layouts/_partials/design-reference'):
        for path in directory.rglob('*'):
            if path.is_file():
                text = path.read_text()
                assert not re.search(r'<(?:figure|table|pre|code|img|picture|script|style)\b', text), f'copied renderer/implementation: {path}'
                assert 'customElements.define' not in text
                assert not re.search(r'\.dc-[\w-]+\s*[{,:]', text), f'site-owned dc definition: {path}'
    assert '<script' not in shortcode and '<style' not in shortcode and 'class=' not in shortcode
    # No separate primitive CSS/JS; normal component assets remain production-owned.
    for base in (ROOT/'assets', THEME/'exampleSite/assets'):
        assert not [p for p in base.rglob('*') if p.is_file() and ('reference' in p.name or '__design' in str(p))], 'reference primitive asset introduced'
    for base in (ROOT/'content/__preview', THEME/'exampleSite/content'):
        fixture_paths = list(base.rglob('*.md')) if base.name == '__preview' else [base/'__design-theme.md']
        for path in fixture_paths:
            fixture_frontmatter(path)
    return len(seen)


def service_page(path):
    text = path.read_text()
    doc = Document(text)
    ids = [a['id'] for _, a in doc.nodes if 'id' in a]
    assert len(ids) == len(set(ids)), f'duplicate IDs: {path}'
    assert sum(t == 'h1' for t, _ in doc.nodes) == 1
    assert doc.has('meta', name='robots', content='noindex,nofollow')
    for tag, attrs in doc.nodes:
        assert attrs.get('type') != 'application/ld+json', 'publication schema on service page'
        assert not set(attrs.get('rel', '').split()) & {'canonical','webmention','author','me','alternate','authorization_endpoint','token_endpoint'}, 'discovery metadata on service page'
        assert not set(attrs.get('class', '').split()) & {'h-entry','h-card','u-uid','p-author'}, 'editorial identity on service page'
        assert not attrs.get('property', '').startswith('og:'), 'publication OG metadata'
    assert '/id/' not in text
    return doc


def check(root, control=None):
    count = source_bindings()
    for disabled in ('preview','production','theme-disabled'):
        isolated(root/disabled)
    for enabled, disabled in [('site','preview'), ('theme','theme-disabled')]:
        target = TARGETS[enabled]
        assert (root/enabled/target).is_file(), f'missing opt-in target: {target}'
        isolated(root/enabled, [target])
        parity(root/disabled, root/enabled, [target])
    if control:
        for before, after in [('control-preview','preview'),('control-production','production'),('theme-control','theme-disabled')]:
            parity(control/before, root/after)
    doc = service_page(root/'site'/TARGETS['site'])
    assert doc.has('a', href='/library/types/article', lang='en', **{'class':'dc-list__type dc-type--knowledge'}), 'real badge output missing'
    for cls in ('dc-figure', 'dc-code', 'dc-prose-table'):
        assert any(cls in a.get('class','').split() for _,a in doc.nodes), f'production renderer missing: {cls}'
    assert doc.has('th', scope='col', **{'class':'dc-prose-table__cell dc-prose-table__cell--left'})
    assert any(t=='div' and a.get('role')=='region' and a.get('tabindex')=='0' for t,a in doc.nodes)
    assert any(t=='img' and a.get('alt') and a.get('srcset') for t,a in doc.nodes), 'responsive image pipeline missing'
    for url in ('/', '/library/all', '/library/bluredu-new-teachers'):
        assert doc.has('a', href=url), f'composition link absent: {url}'
        assert (root/'site'/url.strip('/')/'index.html').is_file(), f'real composition page missing: {url}'
    subprocess.run([sys.executable, str(THEME/'tests/check-design-reference.py'), '--enabled', str(root/'theme'), '--disabled', str(root/'theme-disabled')], check=True)
    print(f'PASS: {count} manifest bindings; production/preview artifacts, editorial counts/order, feeds/sitemap/search/taxonomies/relations/identity/redirects/llms/navigation unchanged')


def self_test(root):
    subprocess.run([sys.executable, str(THEME/'tests/check-design-reference.py'), '--enabled', str(root/'theme'), '--disabled', str(root/'theme-disabled'), '--self-test'], check=True)
    original = (ROOT/'content/__preview/design/index.md').read_text()
    uuid = '019521e9-29d9-7420-917d-378626158bb8'
    cases = [('clean', original, True),
             ('quoted-title', original.replace('title:', '"title":', 1), True)]
    for key in ('id', '"id"', "'id'"):
        cases.append((key, original.replace('title:', f'{key}: {uuid}\ntitle:', 1), False))
    for key in ('aliases', 'tags', 'topics', 'relations', 'authors', 'guid'):
        cases.append((key, original.replace('title:', f'"{key}": [fixture]\ntitle:', 1), False))
    cases.append(('params.id', original.replace('params:\n', f'params:\n  "id": {uuid}\n', 1), False))
    with tempfile.TemporaryDirectory(prefix='reference-frontmatter-') as tmp:
        path = Path(tmp)/'fixture.md'
        for name, text, passes in cases:
            path.write_text(text)
            try:
                fixture_frontmatter(path)
            except AssertionError as error:
                assert not passes and 'FIXTURE_FIELDS:' in str(error), f'{name}: unrelated failure: {error}'
                print(f'PASS: fixture regression {name} (rejected)')
            else:
                assert passes, f'{name}: forbidden fixture accepted'
                print(f'PASS: fixture regression {name} (accepted)')
    with tempfile.TemporaryDirectory(prefix='design-reference-leak-') as tmp:
        copy = Path(tmp)/'build'
        # Copy the checked outputs, not caches or repository source.
        for name in ('preview','production','site','theme','theme-disabled'):
            shutil.copytree(root/name, copy/name)
        leak = copy/'production/__design/leaked.html'
        leak.parent.mkdir(parents=True)
        leak.write_text('<p>deliberate reference leak</p>')
        result = subprocess.run([sys.executable, __file__, '--build-root', str(copy)], text=True, capture_output=True)
        assert result.returncode != 0 and 'REFERENCE_LEAK' in result.stderr, 'negative case did not fail for the injected leak'
        print('PASS: deliberate leak rejected by ordinary checker CLI; disposable copy removed')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--build-root', type=Path)
    p.add_argument('--public-dir', type=Path, help='also check an existing disabled site output, then self-build')
    p.add_argument('--self-build', action='store_true', help='build and check in a disposable directory')
    p.add_argument('--control-root', type=Path)
    p.add_argument('--self-test', action='store_true')
    a = p.parse_args()
    try:
        if a.public_dir:
            isolated(a.public_dir.resolve())
        if a.self_build or a.public_dir:
            if a.build_root:
                p.error('choose --self-build or --build-root')
            with tempfile.TemporaryDirectory(prefix='design-reference-check-') as tmp:
                subprocess.run([sys.executable, str(ROOT/'scripts/build-design-reference.py'), '--output', str(Path(tmp)/'build')], check=True)
            return
        if not a.build_root:
            p.error('--build-root or --self-build is required')
        check(a.build_root.resolve(), a.control_root)
        if a.self_test:
            self_test(a.build_root.resolve())
    except (AssertionError, OSError, ValueError, subprocess.CalledProcessError) as e:
        p.exit(1, f'FAIL: {e}\n')


if __name__ == '__main__':
    main()
