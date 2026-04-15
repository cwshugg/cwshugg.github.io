---
layout: default
title: "Night Sky"
permalink: /tools/nightsky
theme: galactic
extra_css:
  - /css/tools/nightsky.css
extra_js:
  - /script/tools/nightsky.js
---

## Night Sky

A celestial navigation visualization of the night sky.
Use this tool to explore the positions of navigational stars, planets, the Sun, and the Moon
from any location on Earth at any date and time.

This tool uses the [US Naval Observatory's Astronomical Applications API](https://aa.usno.navy.mil/data/api).

<hr class="divider">

### Controls

<div class="box box-1">
    <div class="nightsky-controls">
        <div class="nightsky-datetime-group">
            <input type="date" id="nightsky-date-input" autocomplete="off"
                   aria-label="Select date">
            <div class="nightsky-time-group">
                <span id="nightsky-tz-label" class="nightsky-tz-label"></span>
                <input type="time" id="nightsky-time-input" autocomplete="off"
                       aria-label="Select time">
                <label class="nightsky-utc-toggle" for="nightsky-utc-checkbox">
                    <input type="checkbox" id="nightsky-utc-checkbox">
                    UTC
                </label>
            </div>
            <button id="nightsky-now-btn" class="button-nav"
                    aria-label="Set to current date and time">Now</button>
        </div>
        <div class="nightsky-location-group">
            <button id="nightsky-locate-btn" class="button-nav"
                    aria-label="Detect location">Locate</button>
            <div class="nightsky-coord-group">
                <label for="nightsky-lat-input">Lat:</label>
                <input type="number" id="nightsky-lat-input"
                       min="-90" max="90" step="0.01"
                       aria-label="Latitude in decimal degrees">
            </div>
            <div class="nightsky-coord-group">
                <label for="nightsky-lon-input">Lon:</label>
                <input type="number" id="nightsky-lon-input"
                       min="-180" max="180" step="0.01"
                       aria-label="Longitude in decimal degrees">
            </div>
        </div>
    </div>
</div>

### Sky Dome

<div class="box box-2">
    <div class="nightsky-canvas-wrap">
        <canvas id="nightsky-canvas" width="600" height="600"></canvas>
        <div id="nightsky-tooltip" class="nightsky-tooltip"
             style="display:none;"></div>
    </div>
    <p id="nightsky-status-label" class="nightsky-status-label"></p>
</div>

### Object Details

<div class="box box-3">
    <div id="nightsky-details"></div>
</div>
