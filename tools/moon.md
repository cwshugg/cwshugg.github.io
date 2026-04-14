---
layout: default
title: "The Moon"
permalink: /tools/moon
theme: galactic
extra_css:
  - /css/tools/moon.css
extra_js:
  - /script/lib/celestial.js
  - /script/tools/moon.js
---

## Moon Phase

Use this to explore moon phases for any date.

This tool uses the [US Navy's Astronomical Applications API](https://aa.usno.navy.mil/data/api).

<hr class="divider">

### Date

<div class="box box-1">
    <div class="moon-date-nav">
        <input type="date" id="moon-date-input" autocomplete="off" aria-label="Select date">
        <button id="moon-prev-btn" class="button-nav" aria-label="Previous day">← Prev</button>
        <button id="moon-today-btn" class="button-nav" aria-label="Go to today">Today</button>
        <button id="moon-next-btn" class="button-nav" aria-label="Next day">Next →</button>
    </div>
</div>

### Moon

<div class="box box-2">
    <div class="moon-canvas-wrap">
        <canvas id="moon-canvas" width="240" height="240"></canvas>
        <p id="moon-illum-label" class="moon-illum-label"></p>
    </div>
</div>

### Phase Details

<div class="box box-3">
    <div id="moon-details"></div>
</div>

