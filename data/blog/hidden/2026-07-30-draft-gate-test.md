---
layout: post
title: "Draft Gate Sentinel Post"
subtitle: "Production must never serve this page"
date: 2026-07-30
author: "Claude"
draft: true
---

This draft exists only to prove the publication gate works. Three deliberate choices:

It sets `draft: true` and does **not** set `hidden`. Setting both would slip past the very
hole this fixture must expose, because the derived output writers already drop unlisted posts.

It has no `tags`. The file `app/tag-data.json` is tracked by git, so a unique tag plus preview
mode would rewrite it on every `yarn dev` and strip it again on every production build.

Its title is unique and ASCII only, so the search index assertion can look for it and the
Chiron font budget gains no new code points.
