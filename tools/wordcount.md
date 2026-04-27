---
layout: default
title: "Word Counter"
permalink: /tools/wordcount
theme: woodland
extra_js:
  - /script/tools/wordcount.js
---

## Word Counter

Paste or type text below to count the number of words, characters, sentences, etc., it contains.

Tokens made up entirely of special characters (e.g. `###`, `---`, `***`) are not counted as words.

<hr class="divider">

### Input

<div class="box box-1">
    <label for="wordcount-input">Enter or paste your text:</label>
    <textarea id="wordcount-input" rows="12" placeholder="Start typing or paste text here..." style="width: 100%; font-family: var(--font-code); resize: vertical;"></textarea>
</div>

### Results

<div id="wordcount-result"></div>
