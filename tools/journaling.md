---
layout: default
title: "Journaling"
permalink: /tools/journaling
theme: woodland
extra_css:
  - /css/tools/journaling.css
extra_js:
  - /script/tools/journaling.js
tags: [writing]
---

# Journaling

Journaling has been known to help ease the mind, improve confidence, and make people happier.
Try following a few of these prompts daily!

<div id="jp-app" class="jp-app" data-catalog-url="/assets/data/journaling.json">
    <section class="jp-section jp-journal box box-1" aria-labelledby="jp-prompts-heading">
        <header class="jp-journal-header">
            <h2 id="jp-prompts-heading">Today’s inspiration</h2>
            <time id="jp-local-date" class="jp-local-date" datetime="">Loading local date…</time>
        </header>
        <div class="jp-journal-body">
            <p id="jp-reorder-instructions" class="jp-visually-hidden">Pinned prompt cards can be reordered. Drag a card with a mouse, touch, or pen. When a card is focused, press Arrow Up or Arrow Down to move it. Hold Alt while dragging across prompt text to select it.</p>
            <p id="jp-prompts-empty" class="jp-empty jp-hidden">No prompts are available. Add a custom prompt or reload to try again.</p>
            <ul id="jp-prompt-list" class="jp-prompt-list" aria-label="Pinned and current prompts"></ul>
        </div>
    </section>

    <section class="jp-section box box-2" aria-labelledby="jp-settings-heading">
        <h2 id="jp-settings-heading">Prompt settings</h2>
        <div class="jp-controls">
            <div class="jp-field jp-count-field">
                <label for="jp-random-count">Number of random prompts</label>
                <input id="jp-random-count" type="number" min="1" max="20" step="1" value="5" aria-describedby="jp-count-help" disabled>
                <small id="jp-count-help">Choose 1–20. Pinned prompts are additional.</small>
            </div>
            <div class="jp-actions">
                <button id="jp-generate-more" class="button-nav" type="button" disabled>Regenerate</button>
                <button id="jp-restore-today" class="button-nav jp-hidden" type="button">Restore Today's Prompts</button>
            </div>
        </div>
    </section>

    <section class="jp-section box box-3" aria-labelledby="jp-form-heading">
        <h2 id="jp-form-heading">Add a custom prompt</h2>
        <form id="jp-custom-form" novalidate>
            <div class="jp-field">
                <label for="jp-custom-text">Prompt</label>
                <textarea id="jp-custom-text" rows="4" maxlength="500" required aria-describedby="jp-text-help jp-text-error"></textarea>
                <small id="jp-text-help">Write a question or invitation, up to 500 characters.</small>
                <span id="jp-text-error" class="jp-field-error" aria-live="polite"></span>
            </div>
            <div class="jp-field">
                <label for="jp-custom-tags">Tags <span class="jp-optional">(optional)</span></label>
                <input id="jp-custom-tags" type="text" maxlength="271" aria-describedby="jp-tags-help jp-tags-error">
                <small id="jp-tags-help">Separate up to 8 tags with commas; each tag may be 32 characters.</small>
                <span id="jp-tags-error" class="jp-field-error" aria-live="polite"></span>
            </div>
            <div class="jp-form-actions">
                <button id="jp-save-custom" class="button-nav" type="submit">Add Prompt</button>
                <button id="jp-cancel-edit" class="button-nav jp-hidden" type="button">Cancel Edit</button>
            </div>
        </form>
    </section>

    <section class="jp-section box box-1" aria-labelledby="jp-custom-heading">
        <div class="jp-section-heading">
            <h2 id="jp-custom-heading" tabindex="-1">Your custom prompts</h2>
            <span id="jp-custom-count" class="jp-count" aria-hidden="true">0</span>
        </div>
        <p id="jp-custom-empty" class="jp-empty">You have not added any custom prompts yet.</p>
        <ul id="jp-custom-list" class="jp-custom-list" aria-label="Custom prompt management"></ul>
    </section>

    <div id="jp-announcer" class="jp-visually-hidden" role="status" aria-live="polite" aria-atomic="true">Loading prompt catalog…</div>
</div>
<br>

*Special thanks to the [**Kurzgesagt Gratitude Journal**](https://shop-us.kurzgesagt.org/products/gratitude-journal) for inspiring me to journal!*
