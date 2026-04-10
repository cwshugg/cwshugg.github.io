---
layout: default
title: "Bitwise Calculator"
permalink: /tools/bitwise
extra_js:
  - /script/tools/bitwise.js
---

## Bitwise Calculator

Use this tool to evaluate bitwise expressions in real time.

<hr class="divider">

### Expression

<div class="box box-1">
    <label for="bitwise-input">Enter a bitwise expression:</label>
    <input type="text" id="bitwise-input" placeholder="e.g. 0xFF & (0b1010 | 0x0F)" autocomplete="off">
    <div style="margin-top: 0.75rem; display: flex; align-items: center; gap: 0.75rem;">
        <button id="bitwise-endian-toggle" class="button-nav" style="width: auto; display: inline-block; min-width: 3.5rem; text-align: center;">[BE]</button>
        <span id="bitwise-endian-label" style="color: var(--color-text-muted); font-size: 0.9em;">Big Endian</span>
    </div>
    <div id="bitwise-result" style="margin-top: 1rem;"></div>
</div>

### Supported Operations

<div class="box box-2">
<table>
<thead>
<tr><th>Operator</th><th>Description</th></tr>
</thead>
<tbody>
<tr><td><code>&amp;</code></td><td>AND</td></tr>
<tr><td><code>|</code></td><td>OR</td></tr>
<tr><td><code>^</code></td><td>XOR</td></tr>
<tr><td><code>~</code></td><td>NOT (unary)</td></tr>
<tr><td><code>&lt;&lt;</code></td><td>Left shift</td></tr>
<tr><td><code>&gt;&gt;</code></td><td>Right shift</td></tr>
<tr><td><code>( )</code></td><td>Grouping</td></tr>
</tbody>
</table>
</div>

### Supported Number Formats

<div class="box box-3">
<table>
<thead>
<tr><th>Format</th><th>Example</th></tr>
</thead>
<tbody>
<tr><td>Decimal</td><td><code>255</code></td></tr>
<tr><td>Hexadecimal</td><td><code>0xFF</code></td></tr>
<tr><td>Octal</td><td><code>0o377</code></td></tr>
<tr><td>Binary</td><td><code>0b11111111</code></td></tr>
</tbody>
</table>
</div>
