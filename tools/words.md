---
layout: default
title: "Word Lookup"
permalink: /tools/words
theme: woodland
extra_css:
  - /css/tools/thesaurus.css
extra_js:
  - /script/tools/thesaurus.js
---

## Thesaurus & Dictionary

Look up any English word to see its definitions, synonyms, antonyms, and related words.
Powered by the [Datamuse API](https://www.datamuse.com/api/).

<hr class="divider">

### Search

<div class="box box-1">
    <div class="thesaurus-search">
        <div class="thesaurus-search-row">
            <input type="text" id="thesaurus-input"
                   placeholder="Enter a word..."
                   autocomplete="off" autocapitalize="off" spellcheck="false"
                   aria-label="Word to look up">
            <button id="thesaurus-search-btn" class="button-nav"
                    aria-label="Look up word">Search</button>
        </div>
        <div id="thesaurus-suggestions" class="thesaurus-suggestions" role="listbox"
             aria-label="Autocomplete suggestions"></div>
    </div>
</div>

### Results

<div id="thesaurus-results"></div>
