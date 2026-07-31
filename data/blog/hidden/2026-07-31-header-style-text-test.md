---
layout: post
title: 'Header Style Text Test'
subtitle: 'A hero with no image, no gradient and no mask'
date: 2026-07-31
author: 'Claude'
tags: ['Test']
headerStyle: text
hidden: true
---

This fixture exists to exercise the text hero in a real production build.

Everything here is ASCII on purpose. `site-font-text.mjs` recurses into `hidden/`, so this
page counts against the Chiron font budget; printable ASCII already lives in the core subset,
so this page touches exactly one bucket and regenerates no font artifacts.

The link below is required, not decorative. The SPA navigation test needs an internal link
to click, and this fixture has no pager and no series because hidden posts are excluded from
both: [read the OpenWiki article](/2026/07/25/openwiki-tame-agents-md/).

The filler that follows is also required. The navbar has three scroll states, and reaching
the fixed one needs the document to be taller than the viewport by a wide margin. A short
fixture silently degrades those tests: the page cannot scroll past the threshold, the navbar
never gains `is-fixed`, and the assertions pass against the ordinary top-of-page rule instead
of the state they were written for.

Filler paragraph one. This text exists purely to give the document height, and every
character in it is printable ASCII so the font subset gains nothing. The quick brown fox
jumps over the lazy dog, and does so repeatedly, because repetition is what produces pixels.

Filler paragraph two. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph three. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph four. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph five. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph six. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph seven. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.

Filler paragraph eight. The quick brown fox jumps over the lazy dog. Pack my box with five
dozen liquor jugs. How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.
