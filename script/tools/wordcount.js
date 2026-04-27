// Word Counter — script/tools/wordcount.js
// Counts words, characters, sentences, paragraphs, and lines in real time.
// Updates on every input event from the textarea.

(function () {
    "use strict";

    // ------------------------------------------------------------------ //
    //  Counting Helpers                                                   //
    // ------------------------------------------------------------------ //

    /**
     * Counts words by splitting on whitespace and filtering out empty strings.
     * Only tokens containing at least one alphanumeric character (a-z, A-Z, 0-9)
     * are counted. Tokens composed entirely of special characters (e.g. ###, ---)
     * are excluded.
     * Returns 0 for empty or whitespace-only input.
     */
    function countWords(text) {
        var tokens = text.trim().split(/\s+/);
        if (tokens.length === 1 && tokens[0] === "") {
            return 0;
        }
        var count = 0;
        for (var i = 0; i < tokens.length; i++) {
            if (/[a-zA-Z0-9]/.test(tokens[i])) {
                count++;
            }
        }
        return count;
    }

    /**
     * Counts total characters, including spaces.
     */
    function countCharsWithSpaces(text) {
        return text.length;
    }

    /**
     * Counts characters excluding all whitespace.
     */
    function countCharsWithoutSpaces(text) {
        return text.replace(/\s/g, "").length;
    }

    /**
     * Counts sentences by counting sentence-terminating punctuation: . ! ?
     * Returns 0 for empty input.
     */
    function countSentences(text) {
        if (text.trim() === "") {
            return 0;
        }
        var terminators = text.match(/[.!?]/g);
        return terminators ? terminators.length : 0;
    }

    /**
     * Counts paragraphs — blocks of text separated by one or more blank lines.
     * A blank line is a line containing only whitespace.
     * Returns 0 for empty input.
     */
    function countParagraphs(text) {
        if (text.trim() === "") {
            return 0;
        }
        // Split on sequences of blank lines (two or more consecutive newlines
        // with optional whitespace between them)
        var paragraphs = text.trim().split(/\n\s*\n/);
        // Filter out any empty strings that may result from splitting
        var count = 0;
        for (var i = 0; i < paragraphs.length; i++) {
            if (paragraphs[i].trim() !== "") {
                count++;
            }
        }
        return count;
    }

    /**
     * Counts lines — number of newline characters + 1.
     * Returns 0 for empty input.
     */
    function countLines(text) {
        if (text === "") {
            return 0;
        }
        var newlines = text.match(/\n/g);
        return (newlines ? newlines.length : 0) + 1;
    }

    // ------------------------------------------------------------------ //
    //  Result Rendering                                                   //
    // ------------------------------------------------------------------ //

    /**
     * Builds and returns the HTML string for the results table.
     */
    function buildResultHTML(stats) {
        return (
            '<div class="box box-2">' +
            "<table>" +
            "<thead><tr>" +
            "<th>Metric</th><th>Count</th>" +
            "</tr></thead>" +
            "<tbody>" +
            "<tr><td>Words</td><td>" + stats.words + "</td></tr>" +
            "<tr><td>Characters (with spaces)</td><td>" + stats.charsWithSpaces + "</td></tr>" +
            "<tr><td>Characters (no spaces)</td><td>" + stats.charsNoSpaces + "</td></tr>" +
            "<tr><td>Sentences</td><td>" + stats.sentences + "</td></tr>" +
            "<tr><td>Paragraphs</td><td>" + stats.paragraphs + "</td></tr>" +
            "<tr><td>Lines</td><td>" + stats.lines + "</td></tr>" +
            "</tbody>" +
            "</table>" +
            "</div>"
        );
    }

    // ------------------------------------------------------------------ //
    //  UI Logic                                                           //
    // ------------------------------------------------------------------ //

    var inputEl  = document.getElementById("wordcount-input");
    var resultEl = document.getElementById("wordcount-result");

    /**
     * Reads the textarea value, computes all statistics, and renders results.
     */
    function update() {
        if (!inputEl || !resultEl) return;

        var text = inputEl.value;

        var stats = {
            words:          countWords(text),
            charsWithSpaces: countCharsWithSpaces(text),
            charsNoSpaces:  countCharsWithoutSpaces(text),
            sentences:      countSentences(text),
            paragraphs:     countParagraphs(text),
            lines:          countLines(text)
        };

        resultEl.innerHTML = buildResultHTML(stats);
    }

    // Wire up the input event for real-time updates
    if (inputEl) {
        inputEl.addEventListener("input", update);
    }

    // Run initial update so the results section shows zeros on page load
    update();
})();
