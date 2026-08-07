---
title: "{{ replace .Name "-" " " | title }}"
description: ""
date: {{ .Date }}
lastmod: {{ .Date }}
authors: ["batyshkaLenin"]
tags: []
uid: "{{ .Site.BaseURL }}posts/{{ .Name }}"
draft: true
---
