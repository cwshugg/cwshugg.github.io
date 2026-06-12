---
layout: default
title: "Coin Flip"
permalink: /tools/coinflip
theme: tabletop
extra_css:
  - /css/tools/coinflip.css
extra_js:
  - /script/tools/coinflip.js
---

## Coin Flip

<div class="box box-1">
    <div class="cf-coin-stage">
        <div id="cf-coin" class="cf-coin">
            <div class="cf-coin-face cf-coin-heads" id="cf-face-heads">Heads</div>
            <div class="cf-coin-face cf-coin-tails" id="cf-face-tails">Tails</div>
        </div>
    </div>
    <div class="cf-actions">
        <button id="cf-flip-btn" class="button-nav" aria-label="Flip the coin">Flip</button>
    </div>
</div>

### Result

<div class="box box-2">
    <p id="cf-result" class="cf-result" aria-live="polite">Press <strong>Flip</strong> to start.</p>
</div>

<hr class="divider">

### Settings

<div class="box box-3">
    <div class="cf-settings">
        <div class="cf-setting-group">
            <label for="cf-side1-input">Side 1</label>
            <input type="text" id="cf-side1-input" value="Heads" maxlength="24" autocomplete="off" aria-label="Name for side 1">
        </div>
        <div class="cf-setting-group">
            <label for="cf-side2-input">Side 2</label>
            <input type="text" id="cf-side2-input" value="Tails" maxlength="24" autocomplete="off" aria-label="Name for side 2">
        </div>
        <div class="cf-setting-group">
            <button id="cf-reset-names-btn" class="button-nav" aria-label="Reset side names to defaults">Reset Names</button>
        </div>
        <div class="cf-setting-group cf-toggle-group">
            <label for="cf-anim-toggle">Animation</label>
            <input type="checkbox" id="cf-anim-toggle" checked aria-label="Enable flip animation">
        </div>
    </div>
</div>
