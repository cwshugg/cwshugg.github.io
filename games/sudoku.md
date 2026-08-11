---
layout: default
title: "Sudoku"
permalink: /games/sudoku
theme: tabletop
referrer_policy: no-referrer
content_security_policy: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self'; child-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'"
extra_css:
  - /css/games/sudoku.css
extra_js:
  - /script/games/sudoku-engine.js
  - /script/games/sudoku-protocol.js
  - /script/games/sudoku.js
---

<section id="sdk-app"
    class="sdk-app"
    data-route="{{ '/games/sudoku' | relative_url }}"
    data-worker-url="{{ '/script/games/sudoku-worker.js' | relative_url }}">
    <h1 id="sdk-title">Sudoku puzzle</h1>
    <p id="sdk-instructions">
        Select a cell, then use the keypad or number keys. Arrow keys move;
        Home and End move within a row; N toggles candidates; U undoes.
    </p>

    <div class="box sdk-identity">
        <p><strong id="sdk-kind">Daily puzzle · UTC</strong> <span id="sdk-identity-value"></span></p>
        <div class="sdk-control-row">
            <button id="sdk-daily" type="button">Daily</button>
            <button id="sdk-random" type="button">Create a new random puzzle</button>
        </div>
        <form id="sdk-seed-form" class="sdk-seed-form">
            <label for="sdk-seed">Custom seed</label>
            <div class="sdk-control-row">
                <input id="sdk-seed" name="seed" type="text" maxlength="256" autocomplete="off">
                <button type="submit">Use seed</button>
            </div>
        </form>
        <p class="sdk-privacy">
            <strong>Seeds are public and included in shareable URLs and browser history.
            Do not enter personal or secret information.</strong>
            Base64url is reversible; prefer a random opaque seed.
        </p>
    </div>

    <div id="sdk-status" role="status" aria-live="polite" aria-atomic="true"></div>
    <div id="sdk-alert" role="alert" aria-live="assertive" aria-atomic="true"></div>
    <p id="sdk-progress" class="sdk-progress" aria-hidden="true"></p>
    <div id="sdk-loading" class="sdk-loading" tabindex="-1">Loading Sudoku puzzle.</div>
    <div id="sdk-recovery" class="sdk-recovery" hidden></div>

    <div id="sdk-grid"
        class="sdk-grid"
        role="grid"
        aria-labelledby="sdk-title"
        aria-describedby="sdk-instructions"
        aria-busy="true"></div>

    <div id="sdk-keypad" class="sdk-keypad" aria-label="Number keypad"></div>
    <div class="sdk-control-row sdk-game-controls">
        <button id="sdk-notes" type="button" disabled aria-pressed="false">Notes</button>
        <button id="sdk-check" type="button" disabled>Check</button>
        <button id="sdk-undo" type="button" disabled>Undo</button>
        <button id="sdk-reset" type="button" disabled>Reset</button>
    </div>

    <section id="sdk-completion" class="sdk-completion" hidden>
        <h2 id="sdk-completion-heading" tabindex="-1">Puzzle complete</h2>
        <p>Congratulations! This puzzle is solved.</p>
    </section>

    <p id="sdk-storage-warning" class="sdk-warning" hidden></p>
    <div class="box">
        <h2>Saved progress</h2>
        <p>Progress and last-updated time are stored only in this browser profile.
        Up to 30 puzzles and 64 KiB are retained; older progress may be removed.</p>
        <p>If this puzzle is open in multiple tabs, the last saved edit wins and other edits may be lost.</p>
        <button id="sdk-clear-all" type="button">Clear all saved Sudoku progress</button>
        <p>Browser site-data controls are the fallback if storage is blocked.</p>
    </div>
</section>
