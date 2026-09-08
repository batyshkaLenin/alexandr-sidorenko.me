{{- /*
`hugo new` writes the file even when the archetype calls errorf, and it still
exits 0 (Hugo Extended), so this cannot be the guarantee — it is the message.
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
# Optional and never complete: declare a relation when it is true, not to fill
# the field. Keys and their allowed targets are in data/relation_types.yaml;
# an internal relation names another material by its id, never by its route.
#   relations:
#     - rel: part-of
#       id: "019c2f8e-85d2-7ba1-9b8a-e45c65536e91"
#     - rel: external-source
#       url: "https://example.org/article"
#       title: "Где это вышло впервые"
relations: []
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
