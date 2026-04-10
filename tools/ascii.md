---
layout: default
title: "ASCII Table"
permalink: /tools/ascii
extra_js:
  - /script/tools/ascii.js
---

## ASCII Table

Use this tool to lookup ASCII characters and their decimal, hex, octal, and binary values.

<hr class="divider">

### Converter

<div class="box box-2-1">
    <label for="ascii-converter-input">Enter a value (decimal, <code>0x</code>hex, <code>0o</code>octal, <code>0b</code>binary, or a single character):</label>
    <input type="text" id="ascii-converter-input" placeholder="e.g. 65, 0x41, 0o101, 0b1000001, or A" autocomplete="off">
    <div id="ascii-converter-result"></div>
</div>

### Full Table

<div id="ascii-table-container"></div>
