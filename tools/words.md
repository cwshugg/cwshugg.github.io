---
layout: default
title: "Word Lookup"
permalink: /tools/words
theme: woodland
extra_css:
  - /css/tools/words.css
extra_js:
  - /script/tools/words.js
---

## Word Lookup

Look up any English word to see its definitions, synonyms, antonyms, and related words.
Powered by the [Datamuse API](https://www.datamuse.com/api/).

<hr class="divider">

### Search

<div class="box box-1">
    <div class="words-search">
        <div class="words-search-row">
            <input type="text" id="words-input"
                   placeholder="Enter a word..."
                   autocomplete="off" autocapitalize="off" spellcheck="false"
                   aria-label="Word to look up">
            <button id="words-search-btn" class="button-nav"
                    aria-label="Look up word">Search</button>
        </div>
        <div id="words-suggestions" class="words-suggestions" role="listbox"
             aria-label="Autocomplete suggestions"></div>
    </div>
</div>

### Results

<div id="words-results"></div>
