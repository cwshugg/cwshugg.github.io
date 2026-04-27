// Word Lookup — script/tools/words.js
// Looks up word definitions, synonyms, antonyms, and related words using
// the Datamuse API. Provides autocomplete suggestions as the user types.
//
// Architecture:
//   - Fetches word data from Datamuse API (/words and /sug endpoints)
//   - Fires 4 parallel API requests per lookup via Promise.all
//   - Caches responses in localStorage with 7-day TTL
//   - Supports URL hash for shareable/bookmarkable lookups
//   - Clickable word chips for navigable exploration

(function () {
    "use strict";

    // ================================================================== //
    //  Constants                                                          //
    // ================================================================== //

    var API_BASE       = "https://api.datamuse.com";
    var WORDS_URL      = API_BASE + "/words";
    var SUG_URL        = API_BASE + "/sug";
    var CACHE_PREFIX   = "words-";
    var CACHE_TTL      = 7 * 24 * 60 * 60 * 1000;  // 7 days in milliseconds
    var DEBOUNCE_MS    = 300;                        // Autocomplete debounce delay
    var MAX_SYNONYMS   = 30;
    var MAX_ANTONYMS   = 20;
    var MAX_RELATED    = 30;
    var MAX_SUGGEST    = 10;
    var MIN_SUGGEST_LEN = 2;                         // Minimum chars before autocomplete fires

    /** Map of POS abbreviations to full names */
    var POS_MAP = {
        "n":    "noun",
        "v":    "verb",
        "adj":  "adjective",
        "adv":  "adverb",
        "u":    "unknown"
    };

    // ================================================================== //
    //  DOM References                                                     //
    // ================================================================== //

    var inputEl;         // <input> — search text field
    var searchBtnEl;     // <button> — search button
    var suggestionsEl;   // <div> — autocomplete dropdown container
    var resultsEl;       // <div> — results container

    // ================================================================== //
    //  State                                                              //
    // ================================================================== //

    var debounceTimer  = null;   // setTimeout ID for autocomplete debounce
    var activeWord     = "";     // Currently displayed word (race condition guard)
    var suggestIndex   = -1;    // Keyboard-navigation index in suggestions list
    var suggestItems   = [];    // Current suggestion DOM elements (for keyboard nav)
    var blurHideTimer  = null;   // setTimeout ID for blur-triggered suggestion hide

    // ================================================================== //
    //  Helpers                                                            //
    // ================================================================== //

    /**
     * Escapes HTML special characters to prevent XSS in rendered output.
     * @param {string} str - The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Escapes a string for safe use inside an HTML attribute value.
     * @param {string} str - The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeAttr(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    /**
     * Expands a POS abbreviation to its full name.
     * @param {string} abbr - The abbreviation (e.g., "adj", "n", "v").
     * @returns {string} The full POS name (e.g., "adjective").
     */
    function expandPos(abbr) {
        return POS_MAP[abbr] || abbr;
    }

    // ================================================================== //
    //  API Layer                                                          //
    // ================================================================== //

    /**
     * Fetches the exact word data (definitions, POS, pronunciation, etc.).
     * @param {string} word - The word to look up.
     * @returns {Promise<Object|null>} The first result object or null.
     */
    function fetchWordData(word) {
        var url = WORDS_URL
            + "?sp=" + encodeURIComponent(word)
            + "&qe=sp&md=dpsrf&ipa=1&max=1";

        return fetch(url)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("API returned HTTP " + response.status);
                }
                return response.json();
            })
            .then(function (results) {
                return results.length > 0 ? results[0] : null;
            });
    }

    /**
     * Fetches synonyms for a word.
     * @param {string} word - The word to find synonyms for.
     * @returns {Promise<Array>} Array of word objects with synonyms.
     */
    function fetchSynonyms(word) {
        var url = WORDS_URL
            + "?rel_syn=" + encodeURIComponent(word)
            + "&md=p&max=" + MAX_SYNONYMS;

        return fetch(url)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("API returned HTTP " + response.status);
                }
                return response.json();
            });
    }

    /**
     * Fetches antonyms for a word.
     * @param {string} word - The word to find antonyms for.
     * @returns {Promise<Array>} Array of word objects with antonyms.
     */
    function fetchAntonyms(word) {
        var url = WORDS_URL
            + "?rel_ant=" + encodeURIComponent(word)
            + "&md=p&max=" + MAX_ANTONYMS;

        return fetch(url)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("API returned HTTP " + response.status);
                }
                return response.json();
            });
    }

    /**
     * Fetches semantically related words ("means like").
     * @param {string} word - The word to find related words for.
     * @returns {Promise<Array>} Array of word objects.
     */
    function fetchRelated(word) {
        var url = WORDS_URL
            + "?ml=" + encodeURIComponent(word)
            + "&md=p&max=" + MAX_RELATED;

        return fetch(url)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("API returned HTTP " + response.status);
                }
                return response.json();
            });
    }

    /**
     * Fetches autocomplete suggestions for a prefix.
     * @param {string} prefix - The prefix string to get suggestions for.
     * @returns {Promise<Array>} Array of suggestion objects.
     */
    function fetchSuggestions(prefix) {
        var url = SUG_URL
            + "?s=" + encodeURIComponent(prefix)
            + "&max=" + MAX_SUGGEST;

        return fetch(url)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("API returned HTTP " + response.status);
                }
                return response.json();
            });
    }

    // ================================================================== //
    //  Cache Layer                                                        //
    // ================================================================== //

    /**
     * Retrieves cached data for a word from localStorage.
     * Returns null if entry is missing, expired (>7 days), or unreadable.
     * @param {string} word - The word to look up in the cache.
     * @returns {Object|null} The cached data object or null.
     */
    function cacheGet(word) {
        try {
            var raw = localStorage.getItem(CACHE_PREFIX + word);
            if (!raw) return null;
            var entry = JSON.parse(raw);
            if (Date.now() - entry.timestamp > CACHE_TTL) {
                localStorage.removeItem(CACHE_PREFIX + word);
                return null;
            }
            return entry.data || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Stores data for a word in localStorage with a timestamp.
     * On QuotaExceededError, clears all words cache entries and retries once.
     * @param {string} word - The word key.
     * @param {Object} data - The data to cache.
     */
    function cacheSet(word, data) {
        var entry = JSON.stringify({
            timestamp: Date.now(),
            data: data
        });

        try {
            localStorage.setItem(CACHE_PREFIX + word, entry);
        } catch (e) {
            if (e.name === "QuotaExceededError") {
                clearWordsCache();
                try {
                    localStorage.setItem(CACHE_PREFIX + word, entry);
                } catch (e2) {
                    // Give up silently — the tool still works without caching
                }
            }
        }
    }

    /**
     * Removes all localStorage keys starting with the words cache prefix.
     */
    function clearWordsCache() {
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf(CACHE_PREFIX) === 0) {
                keysToRemove.push(key);
            }
        }
        for (var j = 0; j < keysToRemove.length; j++) {
            localStorage.removeItem(keysToRemove[j]);
        }
    }

    // ================================================================== //
    //  Parsing & Data Transform                                           //
    // ================================================================== //

    /**
     * Parses the Datamuse `defs` array into a grouped structure by POS.
     * Each definition string has the format "POS\tDefinition text".
     * @param {Array<string>} defs - The raw definitions array from Datamuse.
     * @returns {Object} Definitions grouped by POS, e.g. { "adjective": ["def1", "def2"] }
     */
    function parseDefinitions(defs) {
        var grouped = {};
        if (!defs || !Array.isArray(defs)) return grouped;

        for (var i = 0; i < defs.length; i++) {
            var parts = defs[i].split("\t");
            if (parts.length < 2) continue;
            var pos = expandPos(parts[0]);
            var def = parts.slice(1).join("\t"); // Rejoin in case definition contains tabs
            if (!grouped[pos]) grouped[pos] = [];
            grouped[pos].push(def);
        }
        return grouped;
    }

    /**
     * Extracts structured data from the Datamuse `tags` array.
     * Tags can include POS abbreviations, pronunciation, and frequency data.
     * @param {Array<string>} tags - The raw tags array from Datamuse.
     * @returns {Object} Parsed data: { pos: [], ipa: string, frequency: number }
     */
    function parseTags(tags) {
        var result = { pos: [], ipa: "", frequency: 0 };
        if (!tags || !Array.isArray(tags)) return result;

        for (var i = 0; i < tags.length; i++) {
            var tag = tags[i];
            if (tag.indexOf("ipa_pron:") === 0) {
                result.ipa = tag.substring(9);
            } else if (tag.indexOf("f:") === 0) {
                result.frequency = parseFloat(tag.substring(2)) || 0;
            } else if (POS_MAP[tag]) {
                result.pos.push(tag);
            }
        }
        return result;
    }

    /**
     * Filters the related words list to remove any words already in the synonyms list.
     * @param {Array} related - Array of related word objects.
     * @param {Array} synonyms - Array of synonym word objects.
     * @returns {Array} Deduplicated related words.
     */
    function dedupeRelated(related, synonyms) {
        var synSet = {};
        for (var i = 0; i < synonyms.length; i++) {
            synSet[synonyms[i].word] = true;
        }

        var result = [];
        for (var j = 0; j < related.length; j++) {
            if (!synSet[related[j].word]) {
                result.push(related[j]);
            }
        }
        return result;
    }

    // ================================================================== //
    //  Rendering                                                          //
    // ================================================================== //

    /**
     * Builds the HTML for the word header (word name, IPA, syllables, POS badges).
     * @param {Object|null} wordData - The word data from Datamuse.
     * @param {string} word - The looked-up word (fallback if wordData is null).
     * @returns {string} HTML string.
     */
    function renderWordHeader(wordData, word) {
        var html = '<div class="words-word-header">';
        html += '<span class="words-word-name">' + escapeHtml(word) + "</span>";

        if (wordData) {
            var tagData = parseTags(wordData.tags);

            // IPA pronunciation
            var metaParts = [];
            if (tagData.ipa) {
                metaParts.push("/" + escapeHtml(tagData.ipa) + "/");
            }

            // Syllable count
            if (wordData.numSyllables) {
                metaParts.push(wordData.numSyllables + " syllable" +
                    (wordData.numSyllables !== 1 ? "s" : ""));
            }

            if (metaParts.length > 0) {
                html += '<span class="words-word-meta">'
                    + metaParts.join(" &bull; ") + "</span>";
            }

            // POS badges
            for (var i = 0; i < tagData.pos.length; i++) {
                html += '<span class="words-pos-badge">'
                    + escapeHtml(expandPos(tagData.pos[i])) + "</span>";
            }
        }

        html += "</div>";
        return html;
    }

    /**
     * Builds the HTML for definitions grouped by POS as ordered lists.
     * @param {Object} groupedDefs - Definitions grouped by POS.
     * @returns {string} HTML string.
     */
    function renderDefinitions(groupedDefs) {
        var html = '<div class="words-defs">';
        var posKeys = Object.keys(groupedDefs);

        if (posKeys.length === 0) {
            html += "<p>No definitions available.</p>";
            html += "</div>";
            return html;
        }

        for (var i = 0; i < posKeys.length; i++) {
            var pos = posKeys[i];
            var defs = groupedDefs[pos];
            html += '<div class="words-defs-group">';
            html += "<h5>" + escapeHtml(pos) + "</h5>";
            html += "<ol>";
            for (var j = 0; j < defs.length; j++) {
                html += "<li>" + escapeHtml(defs[j]) + "</li>";
            }
            html += "</ol>";
            html += "</div>";
        }

        html += "</div>";
        return html;
    }

    /**
     * Builds the HTML for a list of clickable word chips.
     * @param {Array} words - Array of word objects with a `word` property.
     * @param {string} cssClass - Additional CSS class for color variant.
     * @returns {string} HTML string.
     */
    function renderWordChips(words, cssClass) {
        var html = '<div class="words-chips">';
        for (var i = 0; i < words.length; i++) {
            html += '<button class="words-chip ' + cssClass + '" '
                + 'data-word="' + escapeAttr(words[i].word) + '">'
                + escapeHtml(words[i].word)
                + "</button>";
        }
        html += "</div>";
        return html;
    }

    /**
     * Main render function. Builds the full results HTML for a lookup.
     * @param {Object} data - The merged lookup data.
     */
    function renderResults(data) {
        // If nothing came back at all, show "no results"
        if (!data.wordData && data.synonyms.length === 0
            && data.antonyms.length === 0 && data.related.length === 0) {
            renderNoResults(data.word);
            return;
        }

        var html = "";

        // Section 1: Word header + definitions (box-1)
        html += '<div class="box box-1">';
        html += renderWordHeader(data.wordData, data.word);
        if (data.wordData && data.wordData.defs) {
            html += renderDefinitions(parseDefinitions(data.wordData.defs));
        } else {
            html += "<p>No definitions available.</p>";
        }
        html += "</div>";

        // Section 2: Synonyms (box-2) — only if non-empty
        if (data.synonyms.length > 0) {
            html += '<div class="box box-2">';
            html += "<h4>Synonyms</h4>";
            html += renderWordChips(data.synonyms, "words-chip-syn");
            html += "</div>";
        }

        // Section 3: Antonyms (box-3) — only if non-empty
        if (data.antonyms.length > 0) {
            html += '<div class="box box-3">';
            html += "<h4>Antonyms</h4>";
            html += renderWordChips(data.antonyms, "words-chip-ant");
            html += "</div>";
        }

        // Section 4: Related words (box-1) — only if non-empty, deduped
        var related = dedupeRelated(data.related, data.synonyms);
        if (related.length > 0) {
            html += '<div class="box box-1">';
            html += "<h4>Related Words</h4>";
            html += renderWordChips(related, "words-chip-rel");
            html += "</div>";
        }

        resultsEl.innerHTML = html;
    }

    /**
     * Renders a loading state in the results area.
     * @param {string} word - The word being looked up.
     */
    function renderLoading(word) {
        resultsEl.innerHTML = '<div class="box box-1">'
            + '<div class="words-loading">Looking up '
            + escapeHtml(word) + '...</div></div>';
    }

    /**
     * Renders an error message in the results area.
     * @param {string} word - The word that failed.
     * @param {string} message - The error message.
     */
    function renderError(word, message) {
        resultsEl.innerHTML = '<div class="box box-1">'
            + '<div class="words-error">Could not look up &ldquo;'
            + escapeHtml(word)
            + '&rdquo;. Please check your connection and try again.</div></div>';
    }

    /**
     * Renders a "no results" message in the results area.
     * @param {string} word - The word with no results.
     */
    function renderNoResults(word) {
        resultsEl.innerHTML = '<div class="box box-1">'
            + '<div class="words-empty">No results found for &ldquo;'
            + escapeHtml(word)
            + '&rdquo;. Try a different spelling.</div></div>';
    }

    // ================================================================== //
    //  Autocomplete                                                       //
    // ================================================================== //

    /**
     * Input event handler. Starts the debounce timer for autocomplete.
     */
    function onInput() {
        clearTimeout(debounceTimer);
        var val = inputEl.value.trim();

        if (val.length < MIN_SUGGEST_LEN) {
            hideSuggestions();
            return;
        }

        debounceTimer = setTimeout(function () {
            fetchAndShowSuggestions(val);
        }, DEBOUNCE_MS);
    }

    /**
     * Fetches suggestions from the API and renders them in the dropdown.
     * @param {string} prefix - The current input prefix.
     */
    function fetchAndShowSuggestions(prefix) {
        fetchSuggestions(prefix)
            .then(function (suggestions) {
                if (inputEl.value.trim() === prefix) {
                    renderSuggestions(suggestions);
                }
            })
            .catch(function () {
                hideSuggestions();
            });
    }

    /**
     * Populates the suggestions dropdown with clickable items.
     * @param {Array} suggestions - Array of suggestion objects with `word` property.
     */
    function renderSuggestions(suggestions) {
        if (!suggestions || suggestions.length === 0) {
            hideSuggestions();
            return;
        }

        var html = "";
        for (var i = 0; i < suggestions.length; i++) {
            html += '<div class="words-suggestion" role="option" '
                + 'data-word="' + escapeAttr(suggestions[i].word) + '">'
                + escapeHtml(suggestions[i].word)
                + "</div>";
        }

        suggestionsEl.innerHTML = html;
        suggestionsEl.classList.add("visible");
        suggestIndex = -1;
        suggestItems = suggestionsEl.querySelectorAll(".words-suggestion");

        // Click handler for suggestions
        for (var j = 0; j < suggestItems.length; j++) {
            suggestItems[j].addEventListener("click", function () {
                var word = this.getAttribute("data-word");
                inputEl.value = word;
                hideSuggestions();
                lookupWord(word);
            });
        }
    }

    /**
     * Hides and clears the suggestions dropdown.
     */
    function hideSuggestions() {
        suggestionsEl.classList.remove("visible");
        suggestionsEl.innerHTML = "";
        suggestIndex = -1;
        suggestItems = [];
    }

    /**
     * Handles keyboard navigation within the autocomplete suggestions.
     * @param {KeyboardEvent} event - The keydown event.
     */
    function handleSuggestionKeydown(event) {
        if (!suggestionsEl.classList.contains("visible")) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            suggestIndex = Math.min(suggestIndex + 1, suggestItems.length - 1);
            updateSuggestHighlight();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            suggestIndex = Math.max(suggestIndex - 1, -1);
            updateSuggestHighlight();
        } else if (event.key === "Enter" && suggestIndex >= 0) {
            event.preventDefault();
            var word = suggestItems[suggestIndex].getAttribute("data-word");
            inputEl.value = word;
            hideSuggestions();
            lookupWord(word);
        } else if (event.key === "Escape") {
            hideSuggestions();
        }
    }

    /**
     * Updates the visual highlight for keyboard-navigated suggestions.
     */
    function updateSuggestHighlight() {
        for (var i = 0; i < suggestItems.length; i++) {
            if (i === suggestIndex) {
                suggestItems[i].classList.add("active");
            } else {
                suggestItems[i].classList.remove("active");
            }
        }
    }

    // ================================================================== //
    //  Event Handlers & Init                                              //
    // ================================================================== //

    /**
     * Main orchestrator. Normalizes the word, checks cache, fires parallel
     * API requests, and renders results.
     * @param {string} word - The word to look up.
     */
    function lookupWord(word) {
        word = word.trim().toLowerCase();
        if (!word || word === activeWord) return;
        activeWord = word;

        // Update input field to show the normalized word
        inputEl.value = word;
        hideSuggestions();
        renderLoading(word);

        // Update URL hash for shareability
        history.replaceState(null, "", "#" + encodeURIComponent(word));

        // Check cache first
        var cached = cacheGet(word);
        if (cached) {
            renderResults(cached);
            return;
        }

        Promise.all([
            fetchWordData(word),
            fetchSynonyms(word),
            fetchAntonyms(word),
            fetchRelated(word)
        ]).then(function (responses) {
            var data = {
                word:     word,
                wordData: responses[0],
                synonyms: responses[1],
                antonyms: responses[2],
                related:  responses[3]
            };
            cacheSet(word, data);
            // Only render if this is still the active word (race condition guard)
            if (word === activeWord) {
                renderResults(data);
            }
        }).catch(function (err) {
            if (word === activeWord) {
                renderError(word, err.message);
            }
        });
    }

    /**
     * Initializes the tool. Assigns DOM refs, wires up event listeners,
     * and checks the URL hash for a pre-loaded word.
     */
    function init() {
        inputEl       = document.getElementById("words-input");
        searchBtnEl   = document.getElementById("words-search-btn");
        suggestionsEl = document.getElementById("words-suggestions");
        resultsEl     = document.getElementById("words-results");

        if (!inputEl || !resultsEl) return;

        // Event listeners
        inputEl.addEventListener("input", onInput);
        inputEl.addEventListener("keydown", handleSuggestionKeydown);
        inputEl.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && suggestIndex < 0) {
                lookupWord(inputEl.value);
            }
        });
        searchBtnEl.addEventListener("click", function () {
            lookupWord(inputEl.value);
        });

        // Event delegation for word chips
        resultsEl.addEventListener("click", function (e) {
            var chip = e.target.closest(".words-chip");
            if (chip && chip.dataset.word) {
                lookupWord(chip.dataset.word);
            }
        });

        // Hide suggestions on blur with a small delay to allow suggestion clicks
        inputEl.addEventListener("blur", function () {
            blurHideTimer = setTimeout(function () {
                hideSuggestions();
            }, 150);
        });
        inputEl.addEventListener("focus", function () {
            clearTimeout(blurHideTimer);
        });

        // Dismiss suggestions on outside click
        document.addEventListener("click", function (e) {
            if (!e.target.closest(".words-search")) {
                hideSuggestions();
            }
        });

        // Check URL hash for pre-loaded word
        if (window.location.hash) {
            var hashWord = decodeURIComponent(window.location.hash.slice(1));
            if (hashWord) {
                inputEl.value = hashWord;
                lookupWord(hashWord);
            }
        }
    }

    document.addEventListener("DOMContentLoaded", init);
})();
