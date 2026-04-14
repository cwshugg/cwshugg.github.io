---
layout: default
title: "The Seasons"
permalink: /tools/seasons
theme: galactic
extra_css:
  - /css/tools/seasons.css
extra_js:
  - /script/lib/celestial.js
  - /script/tools/seasons.js
---

## Earth's Seasons

The Earth's axial tilt of 23.44° gives us four seasons as our planet orbits the sun.
Summer occurs when one hemisphere is leaning closer to the sun.
Winter occurs when one hemisphere is leaning farther away from the sun.
Use this tool to explore the seasons for any date.

This tool uses the [US Navy's Astronomical Applications API](https://aa.usno.navy.mil/data/api).

<hr class="divider">

### Date & Timezone

<div class="box box-1">
    <div class="seasons-controls">
        <input type="date" id="seasons-date-input" autocomplete="off"
               aria-label="Select date">
        <div class="seasons-tz-group">
            <label for="seasons-tz-input">UTC offset:</label>
            <input type="number" id="seasons-tz-input"
                   min="-12" max="14" step="0.5" aria-label="UTC timezone offset">
        </div>
        <div class="seasons-dst-group">
            <label for="seasons-dst-checkbox">DST</label>
            <input type="checkbox" id="seasons-dst-checkbox"
                   aria-label="Daylight saving time">
        </div>
    </div>
</div>

### Earth

<div class="box box-2">
    <div class="seasons-canvas-wrap">
        <canvas id="seasons-canvas" width="600" height="300"></canvas>
        <div id="seasons-label" class="seasons-label"></div>
    </div>
</div>

### Season Details

<div class="box box-3">
    <div id="seasons-details"></div>
</div>
