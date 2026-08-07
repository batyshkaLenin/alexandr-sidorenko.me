---
title: "{{ replace .Name "-" " " | title }}"
description: ""
date: {{ .Date }}
created: {{ .Date }}
lastmod: {{ .Date }}
authors: ["batyshkaLenin"]
tags: []
# Optional; metadata only (og:image/JSON-LD), never a visible <img> on the
# page — the visible image is whatever you put in the Markdown body itself.
# Leave empty or delete the line if there is no cover.
cover: ""
uid: "{{ .Site.BaseURL }}posts/{{ .Name }}"
draft: true
---
