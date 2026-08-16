{{- /*
`hugo new` writes the file even when the archetype calls errorf, and it still
exits 0 (Hugo 0.162.1), so this cannot be the guarantee — it is the message.
The placeholders below are deliberately invalid so a material created the wrong
way is obvious on sight and fails the build; scripts/new-material.py is what
actually fills the fields.
*/ -}}
{{- $id := os.Getenv "HUGO_MATERIAL_ID" -}}
{{- $type := os.Getenv "HUGO_MATERIAL_TYPE" -}}
{{- if or (not $id) (not $type) -}}
  {{- errorf "library material needs an id and a type: create it with scripts/new-material.py <slug> --type <type>, not with `hugo new` directly" -}}
{{- end -}}
---
title: "{{ or (os.Getenv "HUGO_MATERIAL_TITLE") (replace .Name "-" " " | title) }}"
description: ""
date: {{ .Date }}
created: {{ .Date }}
lastmod: {{ .Date }}
# batyshkaLenin = personal authorship, ppn = music — see data/authors.yaml.
authors: ["batyshkaLenin"]
# Immutable, opaque, never edited and never reused. The route lives in the
# file name; this does not follow it.
id: "{{ or $id "MISSING-ID-run-scripts/new-material.py" }}"
type: "{{ or $type "MISSING-TYPE-run-scripts/new-material.py" }}"
# Topics only. A tag that repeats the type is not a topic.
tags: []
# Optional; metadata only (og:image/JSON-LD), never a visible <img> on the
# page — the visible image is whatever you put in the Markdown body itself.
# Leave empty or delete the line if there is no cover.
cover: ""
# List of {src, type}, not a bare string/path — leave empty if there's no
# audio. Example:
#   audio:
#     - src: "/assets/library/slug/track.mp3"
#       type: "audio/mpeg"
audio: []
draft: true
---
