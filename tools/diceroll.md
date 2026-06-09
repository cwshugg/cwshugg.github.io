---
layout: default
title: "Dice Roll"
permalink: /tools/diceroll
theme: tabletop
extra_css:
  - /css/tools/diceroll.css
extra_js:
  - /script/tools/diceroll.js
---

<!-- SVG filter for rounding clip-path polygon edges -->
<svg width="0" height="0" style="position: absolute;">
    <defs>
        <filter id="dr-round" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feColorMatrix in="blur" type="matrix"
                values="1 0 0 0 0
                        0 1 0 0 0
                        0 0 1 0 0
                        0 0 0 19 -7"
                result="round" />
            <feComposite in="SourceGraphic" in2="round" operator="atop" />
        </filter>
    </defs>
</svg>

## Dice Roll

Build a pool of dice and roll them all at once.

<hr class="divider">

### Dice Pool

<div class="box box-1">
    <div class="dr-pool">
        <div class="dr-pool-row" data-die="4">
            <span class="dr-pool-label">d4</span>
            <button class="dr-pool-btn dr-pool-minus" aria-label="Remove a d4">−</button>
            <span class="dr-pool-count" id="dr-count-4">0</span>
            <button class="dr-pool-btn dr-pool-plus" aria-label="Add a d4">+</button>
        </div>
        <div class="dr-pool-row" data-die="6">
            <span class="dr-pool-label">d6</span>
            <button class="dr-pool-btn dr-pool-minus" aria-label="Remove a d6">−</button>
            <span class="dr-pool-count" id="dr-count-6">1</span>
            <button class="dr-pool-btn dr-pool-plus" aria-label="Add a d6">+</button>
        </div>
        <div class="dr-pool-row" data-die="8">
            <span class="dr-pool-label">d8</span>
            <button class="dr-pool-btn dr-pool-minus" aria-label="Remove a d8">−</button>
            <span class="dr-pool-count" id="dr-count-8">0</span>
            <button class="dr-pool-btn dr-pool-plus" aria-label="Add a d8">+</button>
        </div>
        <div class="dr-pool-row" data-die="10">
            <span class="dr-pool-label">d10</span>
            <button class="dr-pool-btn dr-pool-minus" aria-label="Remove a d10">−</button>
            <span class="dr-pool-count" id="dr-count-10">0</span>
            <button class="dr-pool-btn dr-pool-plus" aria-label="Add a d10">+</button>
        </div>
        <div class="dr-pool-row" data-die="12">
            <span class="dr-pool-label">d12</span>
            <button class="dr-pool-btn dr-pool-minus" aria-label="Remove a d12">−</button>
            <span class="dr-pool-count" id="dr-count-12">0</span>
            <button class="dr-pool-btn dr-pool-plus" aria-label="Add a d12">+</button>
        </div>
        <div class="dr-pool-row" data-die="20">
            <span class="dr-pool-label">d20</span>
            <button class="dr-pool-btn dr-pool-minus" aria-label="Remove a d20">−</button>
            <span class="dr-pool-count" id="dr-count-20">0</span>
            <button class="dr-pool-btn dr-pool-plus" aria-label="Add a d20">+</button>
        </div>
    </div>
    <div class="dr-actions">
        <button id="dr-clear-btn" class="button-nav" aria-label="Clear all dice from the pool">Clear All</button>
    </div>
</div>

### Roll

<div class="box box-2">
    <div class="dr-actions">
        <button id="dr-roll-btn" class="button-nav" aria-label="Roll the dice">Roll</button>
    </div>
</div>

<hr class="divider">

### Results

<div class="box box-3">
    <div id="dr-results" class="dr-results-grid"></div>
    <p id="dr-total" class="dr-total"></p>
</div>

### Settings

<div class="box">
    <div class="dr-settings">
        <div class="dr-setting-group dr-toggle-group">
            <label for="dr-anim-toggle">Animation</label>
            <input type="checkbox" id="dr-anim-toggle" checked aria-label="Enable roll animation">
        </div>
    </div>
</div>
