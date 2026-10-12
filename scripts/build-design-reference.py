#!/usr/bin/env python3
"""Build local-only executable references and disabled controls with pinned Hugo.

No installs, snapshot refresh, deployment, or global environment changes.
The destination must not exist: never reuse a production output directory.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
THEME = ROOT / 'themes/declassified'
CLOCK = '2026-10-12T00:00:00Z'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path)
    p.add_argument('--browser', choices=['tests/browser/design-reference.spec.ts'], help='run the bounded Chromium matrix after building')
    p.add_argument('--project', action='append', choices=['chromium-desktop','chromium-mobile'])
    p.add_argument('--hugo', default=str(Path.home() / '.local/hugo/hugo'))
    a = p.parse_args()
    temporary = tempfile.TemporaryDirectory(prefix='design-reference-browser-') if a.output is None and a.browser else None
    if a.output is None and temporary is None:
        p.error('--output is required unless --browser requests a disposable run')
    output = a.output.resolve() if a.output else Path(temporary.name)/'build'
    if output.is_relative_to(ROOT):
        p.error('use a disposable directory outside the repository, e.g. /tmp/design-reference')
    if output.exists():
        p.error('output already exists; choose a fresh directory')
    version = subprocess.check_output([a.hugo, 'version'], text=True).strip()
    pinned = (ROOT / '.tool-versions').read_text().split('hugo ')[1].split()[0]
    if f'v{pinned}-' not in version or '+extended' not in version:
        p.error(f'expected Hugo Extended {pinned}, got {version}')
    output.mkdir(parents=True)
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    env = dict(os.environ, HUGO_RESOURCEDIR=str(output / 'resources'), HUGO_BUILD_COMMIT=commit)
    targets = [
        ('preview', ROOT, 'preview', False),
        ('production', ROOT, 'production', False),
        ('site', ROOT, 'design-reference', True),
        ('theme-disabled', THEME / 'exampleSite', 'production', False),
        ('theme', THEME / 'exampleSite', 'design-reference', True),
    ]
    for name, cwd, environment, reference in targets:
        command = [a.hugo, '--environment', environment, '--clock', CLOCK,
                   '--destination', str(output / name), '--cacheDir', str(output / 'cache'),
                   '--noBuildLock', '--minify', '--panicOnWarning']
        if reference:
            command += ['--config', 'hugo.toml,config/design-reference.toml']
        subprocess.run(command, cwd=cwd, env=env, check=True)
    (output / 'build.json').write_text(json.dumps(dict(hugo=version, clock=CLOCK, site=commit,
        theme=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=THEME, text=True).strip()), indent=2)+'\n')
    subprocess.run(['python3', str(ROOT / 'scripts/check-design-reference.py'), '--build-root', str(output), '--self-test'], check=True)
    if a.browser:
        browser_env = dict(os.environ, PUBLIC_DIR=str(output/'site'), DESIGN_REFERENCE_ROOT=str(output))
        subprocess.run([str(ROOT/'node_modules/.bin/playwright'), 'test', a.browser, *['--project='+project for project in (a.project or ['chromium-desktop'])], '--workers=2', '--output', str(output/'browser-results')], cwd=ROOT, env=browser_env, check=True)
    print(f'Local outputs: {output}/site, {output}/theme; serve on loopback only. Do not deploy.')


if __name__ == '__main__':
    main()
