---
title: "{{ replace .Name "-" " " | title }}"
description: ""
date: {{ .Date }}
created: {{ .Date }}
lastmod: {{ .Date }}
# batyshkaLenin = personal authorship (poem/poetry/story). Switch to "ppn"
# for music (single/ep/album) — see data/authors.yaml.
authors: ["batyshkaLenin"]
# One of: poem, poetry, story, single, ep, album (data/creative_types.yaml).
# An unrecognized value fails the build with a clear error, not a silent
# fallback.
creative_type: ""
# Optional; metadata only (og:image/JSON-LD), never a visible <img> on the
# page — the visible image is whatever you put in the Markdown body itself.
# Leave empty or delete the line if there is no cover.
cover: ""
# List of {src, type}, not a bare string/path — leave empty if there's no
# audio. Example:
#   audio:
#     - src: "/assets/creativity/slug/track.mp3"
#       type: "audio/mpeg"
audio: []
# Zero or more of: 18, religion, addict, deepl (data/content_warnings.yaml).
content_warnings: []
uid: "{{ .Site.BaseURL }}creativity/{{ .Name }}"
draft: true
---
