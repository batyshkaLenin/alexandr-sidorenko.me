#!/usr/bin/env python3
"""Primary reference source-binding and output-isolation check.

YAML is parsed by the existing locked Playwright dependency's YAML parser;
Node and the installed project dependencies are required, with no new package.
Rendered CSS-selector resolution is enforced by the reference.bindings browser
matrix; this static checker alone does not establish selector conformance.

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
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
THEME = ROOT / 'themes/declassified'
MARKERS = (b'__design', b'__preview', b'data-design-example', b'data-design-reference')
TARGETS = {'site': '__design/site/index.html', 'theme': '__design/theme/index.html'}
VIEWPORTS = [320, 390, 768, 1024, 1440]
MATERIAL_IDENTITY = re.compile(r'/id/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', re.I)
PUBLICATION_TYPES = {'Article', 'BlogPosting', 'CreativeWork'}


def reference_manifest(owner):
    return json.loads((owner / ('data/design-reference.json' if owner == ROOT else 'exampleSite/data/design-states.json')).read_text())


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
    catalog = (ROOT/'.ai/v2/docs/references/design-system-catalog.md').read_text()
    states = set(re.findall(r'`(STATE-[A-Z-]+)` · status: `implemented`', catalog))
    for owner, manifest in [(ROOT, ROOT/'data/design-reference.json'), (THEME, THEME/'exampleSite/data/design-states.json')]:
        data = json.loads(manifest.read_text())
        assert data['schema'] == 'design-reference/v1'
        assert data['viewports'] == VIEWPORTS, 'noncanonical viewport set'
        assert data['service_outputs'] and len(data['service_outputs']) == len(set(data['service_outputs']))
        assert all(name.startswith('__design/') and name.endswith('/index.html') for name in data['service_outputs']), 'non-service reference output'
        finding_ids = {finding['id'] for finding in data['findings']}
        assert len(finding_ids) == len(data['findings']), 'duplicate finding ID'
        for finding in data['findings']:
            assert finding['classification'] in {'implementation defect', 'reference defect', 'intentional deviation / decision required'}
            assert finding['severity'] in {'BLOCKER', 'MAJOR', 'MINOR'}
            assert isinstance(finding['blocks_4c'], bool)
            assert all(finding.get(key) for key in ('expected', 'observed', 'disposition'))
        assert len(data['scenarios']) == len(set(data['scenarios'])), 'duplicate scenario'
        assert set(data['scenarios']) <= data['scenario_matrix'].keys(), 'missing scenario coverage'
        for scenario in data['scenario_matrix'].values():
            assert scenario['viewports'] and set(scenario['viewports']) <= set(VIEWPORTS)
            assert scenario['js'] and set(scenario['js']) <= {'on', 'off'}
            assert scenario['media'] and set(scenario['media']) <= {'screen', 'print', 'reduced-motion', 'forced-colors'}
        for example in data['examples']:
            assert example['id'] not in seen, 'duplicate manifest example ID'
            seen.add(example['id'])
            for key in ('rule', 'source', 'invocation', 'state', 'coverage', 'conformance'):
                assert example.get(key), f'{example["id"]}: missing {key}'
            assert 'known_deviation' in example
            assert example['viewports'] and set(example['viewports']) <= set(VIEWPORTS), f'{example["id"]}: invalid viewport'
            assert example['states'] and set(example['states']) <= states, f'{example["id"]}: unknown/unimplemented state'
            assert example['js'] and set(example['js']) == {'on', 'off'}, f'{example["id"]}: missing JS/no-JS evidence'
            assert example['media'] and set(example['media']) <= {'screen','print','reduced-motion','forced-colors'}
            assert example['checks'] and set(example['checks']) <= set(data['scenarios']), f'{example["id"]}: unbound scenario'
            # DOM/CSS resolution is authoritative in reference.bindings, on
            # every declared URL. Optional selectorless entries are explicit.
            required = example.get('selector_required', True)
            assert isinstance(required, bool), f'{example["id"]}: invalid selector_required'
            selector = example.get('selector')
            assert (not required and selector is None) or (isinstance(selector, str) and selector.strip()), f'BINDING_RESOLUTION: {example["id"]}: missing selector'
            assert isinstance(example.get('selector_unique', False), bool), f'{example["id"]}: invalid selector_unique'
            assert example['url'].startswith('/') and '/id/' not in example['url']
            assert example['conformance'] in {'covered-conformant','covered-known-deviation'}
            assert set(example['finding_ids']) <= finding_ids, f'{example["id"]}: unknown finding'
            if example['conformance'] == 'covered-known-deviation':
                assert example['known_deviation'] and example['finding_ids'], 'unexplained conformance deviation'
            for key in ('source', 'invocation'):
                path = (owner/example[key]).resolve()
                assert path.is_relative_to(owner) and path.is_file(), f'broken {key}: {path}'
            rule, anchor = example['rule'].removeprefix('v2:').split('#')
            canonical = ROOT/'.ai/v2'/rule
            text = canonical.read_text()
            headings = re.findall(r'^#+\s+(.+)$', text, re.M)
            slugs = [re.sub(r'[^\w -]', '', h.lower()).replace(' ', '-') for h in headings]
            assert anchor in headings or anchor in slugs, f'broken canonical rule: {example["rule"]}'
        for exclusion in data['coverage_exclusions']:
            assert exclusion['classification'] in {'not-applicable','deferred'} and exclusion['reason']
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
        fixture_paths = list(base.rglob('*.md')) if base.name == '__preview' else list(base.glob('__design-*.md'))
        outputs = set()
        for path in fixture_paths:
            fields = fixture_frontmatter(path)
            if fields['build']['render'] != 'never':
                prefix = '/__design/site' if base.name == '__preview' else '/__design/theme'
                url = fields['url'].rstrip('/')
                assert url == prefix or url.startswith(prefix + '/'), 'fixture public URL escaped service namespace'
                outputs.add(fields['url'].strip('/') + '/index.html')
        owner = ROOT if base.name == '__preview' else THEME
        assert outputs == set(reference_manifest(owner)['service_outputs']), 'fixture/output manifest mismatch'
    return len(seen)


def service_page(path):
    text = path.read_text()
    doc = Document(text)
    ids = [a['id'] for _, a in doc.nodes if 'id' in a]
    assert len(ids) == len(set(ids)), f'duplicate IDs: {path}'
    assert sum(t == 'h1' for t, _ in doc.nodes) == 1
    assert doc.has('meta', name='robots', content='noindex,nofollow')
    for tag, attrs in doc.nodes:
        assert attrs.get('type', '').strip().lower() != 'application/ld+json', 'SERVICE_ISOLATION: publication schema on service page'
        assert not set(attrs.get('rel', '').lower().split()) & {'canonical','webmention','author','me','alternate','authorization_endpoint','token_endpoint'}, 'SERVICE_ISOLATION: discovery metadata on service page'
        assert not set(attrs.get('class', '').split()) & {'h-entry','h-card','u-uid','p-author'}, 'SERVICE_ISOLATION: editorial identity on service page'
        assert not attrs.get('property', '').lower().startswith('og:'), 'SERVICE_ISOLATION: publication OG metadata'
        assert not (tag == 'meta' and attrs.get('name', '').lower() == 'author'), 'SERVICE_ISOLATION: editorial author on service page'
        # HTMLParser decodes attribute entities before these structural checks.
        assert not any('/id/' in attrs.get(key, '') for key in ('href', 'src', 'itemid', 'value')), 'SERVICE_ISOLATION: material identity URI on service page'
        assert not any(MATERIAL_IDENTITY.search(value) for value in attrs.values() if value), 'SERVICE_ISOLATION: material identity URI on service page'
        for itemtype in attrs.get('itemtype', '').split():
            schema = urlsplit(itemtype)
            assert not (schema.hostname == 'schema.org' and schema.path.rstrip('/').removeprefix('/') in PUBLICATION_TYPES), 'SERVICE_ISOLATION: publication microdata on service page'
    return doc


def check(root, control=None):
    count = source_bindings()
    for disabled in ('preview','production','theme-disabled'):
        isolated(root/disabled)
    for enabled, disabled in [('site','preview'), ('theme','theme-disabled')]:
        target = TARGETS[enabled]
        assert (root/enabled/target).is_file(), f'missing opt-in target: {target}'
        owner = ROOT if enabled == 'site' else THEME
        outputs = reference_manifest(owner)['service_outputs']
        assert all((root/enabled/name).is_file() for name in outputs), 'declared service context missing'
        isolated(root/enabled, outputs)
        parity(root/disabled, root/enabled, outputs)
        for example in reference_manifest(owner)['examples']:
            assert (root/enabled/example['url'].strip('/')/'index.html').is_file(), f'{example["id"]}: example URL does not resolve'
    for composition in reference_manifest(ROOT)['composition']:
        assert (ROOT/composition['source']).is_file() and (root/'site'/composition['url'].strip('/')/'index.html').is_file(), 'stale production composition'
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
    for url in ('/', '/library', '/library/bluredu-new-teachers'):
        assert doc.has('a', href=url), f'composition link absent: {url}'
        assert (root/'site'/url.strip('/')/'index.html').is_file(), f'real composition page missing: {url}'
    subprocess.run([sys.executable, str(THEME/'tests/check-design-reference.py'), '--enabled', str(root/'theme'), '--disabled', str(root/'theme-disabled')], check=True)
    print(f'PASS: {count} manifest source bindings; production/preview artifacts, editorial counts/order, feeds/sitemap/search/taxonomies/relations/identity/redirects/llms/navigation unchanged')


def self_test(root):
    subprocess.run([sys.executable, str(THEME/'tests/check-design-reference.py'), '--enabled', str(root/'theme'), '--disabled', str(root/'theme-disabled'), '--self-test'], check=True)
    service = (root/'site'/TARGETS['site']).read_text()
    identity = '/id/019521e9-29d9-7420-917d-378626158bb8'
    metadata_cases = [
        ('clean', '', True),
        ('publication-json-ld', '<script type="application/ld+json">{"@type":"Article"}</script>', False),
        ('webmention', '<link rel="webmention" href="/mention">', False),
        ('material-uri', f'<meta name="DC.identifier" content="{identity}">', False),
        ('encoded-material-uri', f'<meta name="DC.identifier" content="{identity.replace("/", "&#47;")}">', False),
        ('article-microdata', '<article itemscope itemtype="https://schema.org/Article"></article>', False),
        ('blogposting-microdata', '<div itemscope itemtype="https://schema.org/BlogPosting"></div>', False),
        ('creativework-microdata', '<div itemscope itemtype="https://schema.org/CreativeWork"></div>', False),
        ('harmless-thing', '<div itemscope itemtype="https://schema.org/Thing"></div>', True),
        ('ordinary-json', '<script type="application/json">{"example":"native disclosure"}</script>', True),
        ('description', '<meta name="description" content="Design reference">', True),
        ('publication-type-list', '<div itemtype="https://schema.org/Thing http://schema.org/Article"></div>', False),
        ('unrelated-vocabulary', '<div itemtype="https://example.org/Article"></div>', True),
        ('harmless-webpage', '<div itemtype="https://schema.org/WebPage"></div>', True),
        ('harmless-id-label', '<meta name="description" content="The /id/ namespace">', True),
    ]
    with tempfile.TemporaryDirectory(prefix='site-reference-metadata-') as tmp:
        copy = Path(tmp)/'build'
        for name in ('preview','production','site','theme','theme-disabled'):
            shutil.copytree(root/name, copy/name)
        page = copy/'site'/TARGETS['site']
        for name, markup, passes in metadata_cases:
            page.write_text(service.replace('</body>', markup + '</body>', 1))
            result = subprocess.run([sys.executable, __file__, '--build-root', str(copy)], text=True, capture_output=True)
            assert (result.returncode == 0) == passes, f'{name}: unexpected service isolation result: {result.stderr}'
            if not passes:
                assert 'SERVICE_ISOLATION:' in result.stderr, f'{name}: unrelated failure: {result.stderr}'
            print(f'PASS: site metadata regression {name} ({"accepted" if passes else "rejected"})')
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
