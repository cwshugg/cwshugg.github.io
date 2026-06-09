// Coin Flip — script/tools/coinflip.js
// Interactive coin flip tool with customizable side names, 3D animation,
// and localStorage persistence.
// ES5-compatible IIFE — no external dependencies.

(function () {
    "use strict";

    // ================================================================== //
    //  Constants                                                          //
    // ================================================================== //

    var DEFAULT_SIDE1 = "Heads";
    var DEFAULT_SIDE2 = "Tails";

    var LS_SIDE1 = "coinflip-side1";
    var LS_SIDE2 = "coinflip-side2";
    var LS_ANIMATION = "coinflip-animation";

    // ================================================================== //
    //  State                                                              //
    // ================================================================== //

    var side1 = DEFAULT_SIDE1;
    var side2 = DEFAULT_SIDE2;
    var animationEnabled = true;
    var flipping = false;

    // ================================================================== //
    //  DOM references (populated on DOMContentLoaded)                     //
    // ================================================================== //

    var coin, faceHeads, faceTails;
    var flipBtn, resetNamesBtn;
    var side1Input, side2Input;
    var animToggle;
    var resultEl;

    // ================================================================== //
    //  Helpers                                                            //
    // ================================================================== //

    /** Safe localStorage getter. */
    function lsGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    /** Safe localStorage setter. */
    function lsSet(key, val) {
        try { localStorage.setItem(key, val); } catch (e) { /* noop */ }
    }

    /** Safe localStorage remover. */
    function lsRemove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* noop */ }
    }

    /** Remove all animation classes from the coin. */
    function clearAnimClasses() {
        coin.classList.remove("cf-anim-heads", "cf-anim-tails",
                              "cf-show-heads", "cf-show-tails");
    }

    /** Update the text shown on each coin face. */
    function updateFaceLabels() {
        faceHeads.textContent = side1;
        faceTails.textContent = side2;
    }

    // ================================================================== //
    //  Core logic                                                         //
    // ================================================================== //

    /** Perform a coin flip. */
    function doFlip() {
        if (flipping) return;

        // Randomly choose side 1 or side 2
        var isHeads = Math.random() < 0.5;
        var winner = isHeads ? side1 : side2;

        if (animationEnabled) {
            flipping = true;
            flipBtn.disabled = true;

            // Reset animation by removing classes and forcing a reflow
            clearAnimClasses();
            // Force reflow so the browser sees the class removal before re-adding
            void coin.offsetWidth;

            // Add the appropriate animation class
            coin.classList.add(isHeads ? "cf-anim-heads" : "cf-anim-tails");

            // Wait for the animation to finish
            var onEnd = function () {
                coin.removeEventListener("animationend", onEnd);
                flipping = false;
                flipBtn.disabled = false;
                showResult(winner);
            };
            coin.addEventListener("animationend", onEnd);

            // Show result text partway through (slight delay for drama)
            resultEl.innerHTML = "Flipping&hellip;";
        } else {
            // Instant — no animation
            clearAnimClasses();
            coin.classList.add(isHeads ? "cf-show-heads" : "cf-show-tails");
            showResult(winner);
        }
    }

    /** Display the winning side in the result area. */
    function showResult(winner) {
        resultEl.innerHTML = 'It landed on <span class="cf-result-value">' +
                             escapeHtml(winner) + '</span>!';
    }

    /** Basic HTML escaping for user-provided text. */
    function escapeHtml(str) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ================================================================== //
    //  Settings handlers                                                  //
    // ================================================================== //

    function onSide1Change() {
        side1 = side1Input.value.trim() || DEFAULT_SIDE1;
        lsSet(LS_SIDE1, side1);
        updateFaceLabels();
    }

    function onSide2Change() {
        side2 = side2Input.value.trim() || DEFAULT_SIDE2;
        lsSet(LS_SIDE2, side2);
        updateFaceLabels();
    }

    function onResetNames() {
        side1 = DEFAULT_SIDE1;
        side2 = DEFAULT_SIDE2;
        side1Input.value = DEFAULT_SIDE1;
        side2Input.value = DEFAULT_SIDE2;
        lsRemove(LS_SIDE1);
        lsRemove(LS_SIDE2);
        updateFaceLabels();
    }

    function onAnimToggle() {
        animationEnabled = animToggle.checked;
        lsSet(LS_ANIMATION, animationEnabled ? "1" : "0");
    }

    // ================================================================== //
    //  Initialisation                                                     //
    // ================================================================== //

    function init() {
        // Grab DOM elements
        coin          = document.getElementById("cf-coin");
        faceHeads     = document.getElementById("cf-face-heads");
        faceTails     = document.getElementById("cf-face-tails");
        flipBtn       = document.getElementById("cf-flip-btn");
        resetNamesBtn = document.getElementById("cf-reset-names-btn");
        side1Input    = document.getElementById("cf-side1-input");
        side2Input    = document.getElementById("cf-side2-input");
        animToggle    = document.getElementById("cf-anim-toggle");
        resultEl      = document.getElementById("cf-result");

        // Load persisted settings
        var saved1 = lsGet(LS_SIDE1);
        var saved2 = lsGet(LS_SIDE2);
        var savedAnim = lsGet(LS_ANIMATION);

        if (saved1) { side1 = saved1; side1Input.value = saved1; }
        if (saved2) { side2 = saved2; side2Input.value = saved2; }
        if (savedAnim !== null) {
            animationEnabled = savedAnim === "1";
            animToggle.checked = animationEnabled;
        }

        updateFaceLabels();

        // Bind events
        flipBtn.addEventListener("click", doFlip);
        resetNamesBtn.addEventListener("click", onResetNames);
        side1Input.addEventListener("input", onSide1Change);
        side2Input.addEventListener("input", onSide2Change);
        animToggle.addEventListener("change", onAnimToggle);
    }

    // Kick off on DOM ready
    document.addEventListener("DOMContentLoaded", init);
})();
