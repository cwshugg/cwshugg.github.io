---
layout: default
title: "Time Zones"
permalink: /tools/timezones
extra_css:
  - /css/tools/timezones.css
extra_js:
  - /script/tools/timezones.js
---

## Time Zones

Use this to compare times across multiple time zones.

* Add time zones to the display below.
    * Your local time zone is added automatically.
    * (Your selections will be retained upon refreshing)
* Click on each time zone's name to give it a nickname.
* Click and drag each box to reorder.

<hr class="divider">

### Clocks

<div id="tz-clocks" class="tz-clocks" aria-label="Time zone clocks">
    <!-- Zone cards rendered dynamically -->
</div>
<!-- Separate live region for announcements (only populated on user actions) -->
<div id="tz-live-announce" class="sr-only" aria-live="polite" aria-atomic="true"></div>

### Settings

<div class="box box-3">
    <div class="tz-settings">
        <!-- Format toggle -->
        <div class="tz-format-toggle">
            <button id="tz-fmt-12" class="button-nav tz-fmt-btn active" aria-pressed="true">12h</button>
            <button id="tz-fmt-24" class="button-nav tz-fmt-btn" aria-pressed="false">24h</button>
        </div>
        <!-- Reference time controls -->
        <div class="tz-time-input">
            <label for="tz-time-manual">Reference time:</label>
            <input type="time" id="tz-time-manual" aria-label="Set reference time">
            <input type="date" id="tz-date-manual" aria-label="Set reference date">
            <button id="tz-now-btn" class="button-nav" aria-label="Reset to current time">Now</button>
        </div>
        <div class="tz-slider-wrap">
            <input type="range" id="tz-slider" min="0" max="23" step="1" value="0"
                   aria-label="Hour slider">
            <div class="tz-slider-ticks" id="tz-slider-ticks"></div>
            <div class="tz-slider-labels" id="tz-slider-labels"></div>
        </div>
    </div>
</div>

### Add Time Zone

<div class="box box-3">
    <div class="tz-add-zone">
        <input type="text" id="tz-search" placeholder="Search time zones..."
               autocomplete="off" role="combobox"
               aria-label="Search time zones"
               aria-controls="tz-dropdown" aria-expanded="false"
               aria-activedescendant="">
        <ul id="tz-dropdown" class="tz-dropdown" role="listbox" aria-label="Time zone options"></ul>
    </div>
</div>
