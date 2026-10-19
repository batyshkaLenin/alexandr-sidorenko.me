"""Render the production types view with distinct editorial and machine values."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from html.parser import HTMLParser


SITE = Path(__file__).resolve().parents[1]
CASES = {
    "fixture-alpha": ("Редакционная коллекция Альфа", "YAML singular alpha", "YAML plural alpha", "knowledge"),
    "fixture-beta": ("Авторская подборка Бета", "YAML singular beta", "YAML plural beta", "literary"),
}


class Output(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.headings = []
        self.badges = []
        self.stack = []
        self.current = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        inherited = self.stack[-1][1] if self.stack else None
        language = attrs.get("lang", inherited)
        self.stack.append((tag, language))
        if tag == "h2" and "dc-library__group" in attrs.get("class", "").split():
            self.current = {"lang": language, "text": "", "href": None, "english_descendant": False}
        elif self.current is not None:
            if tag == "a":
                self.current["href"] = attrs.get("href")
            if language == "en":
                self.current["english_descendant"] = True
        if tag == "span" and "dc-list__type" in attrs.get("class", "").split():
            self.badges.append({"lang": language, "class": attrs["class"], "text": ""})

    def handle_data(self, data):
        # Heading ownership is the anchor text, excluding the existing count.
        if self.current is not None and self.stack[-1][0] == "a":
            self.current["text"] += data
        if self.badges and self.stack and self.stack[-1][0] == "span":
            self.badges[-1]["text"] += data

    def handle_endtag(self, tag):
        if tag == "h2" and self.current is not None:
            self.current["text"] = self.current["text"].strip()
            self.headings.append(self.current)
            self.current = None
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()


class LibraryTypeHeadingsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="library-type-headings-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root = root = Path(cls.temp.name)
        for folder in ("layouts/_default", "layouts/_partials/library", "layouts/_partials/publication", "layouts/_partials/declassified", "content/library", "content/types", "data"):
            (root / folder).mkdir(parents=True, exist_ok=True)
        for relative in ("layouts/library-view.html", "layouts/_partials/library/type-badge.html", "layouts/_partials/publication/type-label.html", "layouts/_partials/publication/type-family.html"):
            shutil.copyfile(SITE / relative, root / relative)
        (root / "hugo.toml").write_text('baseURL = "https://fixture.invalid/"\ndefaultContentLanguage = "ru"\ndisableKinds = ["home", "section", "taxonomy", "term", "rss", "sitemap"]\n')
        (root / "layouts/baseof.html").write_text('<html lang="ru"><body><main>{{ block "main" . }}{{ end }}</main></body></html>')
        (root / "layouts/_default/single.html").write_text('{{ define "main" }}<h1>{{ .Title }}</h1>{{ end }}')
        for partial in ("library/views-nav.html", "declassified/component.html"):
            (root / "layouts/_partials" / partial).write_text("")
        (root / "layouts/_partials/canonical-url.html").write_text("{{ . }}")
        (root / "layouts/_partials/library/material-row.html").write_text('<li><h3>{{ .page.Title }}</h3></li>')
        (root / "layouts/machine-labels.html").write_text('{{ define "main" }}{{ range where site.RegularPages "Section" "library" }}{{ partial "library/type-badge.html" (dict "page" . "plural" false) }}{{ partial "library/type-badge.html" (dict "page" . "plural" true) }}{{ end }}{{ end }}')
        (root / "content/types-view.md").write_text('---\ntitle: "Коллекции"\nlayout: "library-view"\nview: "types"\nurl: "/library/types/"\n---\n')
        (root / "content/machine.md").write_text('---\ntitle: "Machine surface"\nlayout: "machine-labels"\n---\n')
        for key in CASES:
            (root / f"content/library/{key}.md").write_text(f'---\ntitle: "Материал {key}"\ntype: "{key}"\ndate: 2026-01-01\n---\n')
        cls.write_registry()
        cls.write_titles()
        cls.original = cls.build()
        cls.write_titles(" — новая редакция")
        cls.retitle = cls.build()
        cls.write_registry(" changed")
        cls.relabel = cls.build()

    @classmethod
    def write_registry(cls, suffix=""):
        (cls.root / "data/creative_types.yaml").write_text("".join(f'{key}:\n  label: "{label}{suffix}"\n  label_plural: "{plural}{suffix}"\n  family: "{family}"\n' for key, (_, label, plural, family) in CASES.items()))

    @classmethod
    def write_titles(cls, suffix=""):
        for key, (title, _, _, _) in CASES.items():
            (cls.root / f"content/types/{key}.md").write_text(f'---\ntitle: "{title}{suffix}"\nurl: "/library/types/{key}/"\n---\n')

    @classmethod
    def build(cls):
        command = [os.environ.get("HUGO", "hugo"), "--source", str(cls.root), "--destination", str(cls.root / "public"), "--panicOnWarning"]
        run = subprocess.run(command, text=True, capture_output=True)
        if run.returncode or "WARN" in run.stdout + run.stderr or "ERROR" in run.stdout + run.stderr:
            raise AssertionError(f"{command}: {run.returncode}\n{run.stdout}\n{run.stderr}")
        return (Output((cls.root / "public/library/types/index.html").read_text()), Output((cls.root / "public/machine/index.html").read_text()))

    def test_two_groups_use_exact_ru_editorial_titles_and_existing_links(self):
        headings = self.original[0].headings
        self.assertEqual(len(headings), 2)
        self.assertEqual({h["href"]: h["text"] for h in headings}, {f"/library/types/{key}": values[0] for key, values in CASES.items()})
        self.assertTrue(all(h["lang"] == "ru" and not h["english_descendant"] for h in headings))
        for key, (title, label, plural, _) in CASES.items():
            self.assertEqual(len({title, label, plural, key, key.upper()}), 5)

    def test_retitle_changes_heading_but_preserves_en_machine_badges(self):
        self.assertEqual({h["text"] for h in self.retitle[0].headings}, {v[0] + " — новая редакция" for v in CASES.values()})
        badges = self.original[1].badges
        self.assertEqual(badges, self.retitle[1].badges)
        self.assertEqual(sorted(b["text"] for b in badges), sorted([key.upper() for key in CASES for _ in range(2)]))
        self.assertTrue(all(b["lang"] == "en" for b in badges))

    def test_yaml_label_changes_do_not_own_heading_or_machine_badges(self):
        self.assertEqual(self.retitle[0].headings, self.relabel[0].headings)
        self.assertEqual(self.retitle[1].badges, self.relabel[1].badges)


if __name__ == "__main__":
    unittest.main()
