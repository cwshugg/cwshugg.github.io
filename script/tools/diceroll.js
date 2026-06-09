// Dice Roll — script/tools/diceroll.js
// Interactive dice pool roller with staggered animation and localStorage
// persistence for settings.
// ES5-compatible IIFE — no external dependencies.

(function () {
    "use strict";

    // ================================================================== //
    //  Constants                                                          //
    // ================================================================== //

    var DIE_TYPES = [4, 6, 8, 10, 12, 20];
    var LS_ANIMATION = "diceroll-animation";

    // ================================================================== //
    //  State                                                              //
    // ================================================================== //

    var pool = { 4: 0, 6: 1, 8: 0, 10: 0, 12: 0, 20: 0 };
    var animationEnabled = true;
    var rolling = false;

    // ================================================================== //
    //  DOM references (populated on DOMContentLoaded)                     //
    // ================================================================== //

    var rollBtn, clearBtn;
    var animToggle;
    var resultsEl, totalEl;

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

    /** Basic HTML escaping for dynamic text. */
    function escapeHtml(str) {
        var el = document.createElement("span");
        el.textContent = str;
        return el.innerHTML;
    }

    /** Generate a random integer from 1 to max (inclusive). */
    function rollDie(max) {
        return Math.floor(Math.random() * max) + 1;
    }

    // ================================================================== //
    //  Pool management                                                    //
    // ================================================================== //

    /** Update the displayed count for a given die type. */
    function updateCountDisplay(die) {
        var countEl = document.getElementById("dr-count-" + die);
        if (countEl) {
            countEl.textContent = pool[die];
        }
    }

    /** Increment the pool count for a die type. */
    function incrementDie(die) {
        pool[die] = pool[die] + 1;
        updateCountDisplay(die);
    }

    /** Decrement the pool count for a die type (min 0). */
    function decrementDie(die) {
        if (pool[die] > 0) {
            pool[die] = pool[die] - 1;
            updateCountDisplay(die);
        }
    }

    /** Clear all dice from the pool. */
    function clearPool() {
        var i;
        for (i = 0; i < DIE_TYPES.length; i++) {
            pool[DIE_TYPES[i]] = 0;
            updateCountDisplay(DIE_TYPES[i]);
        }
    }

    // ================================================================== //
    //  Core logic                                                         //
    // ================================================================== //

    /** Build a single die result element with the shape wrapper.
     *  Returns { wrapper, valueEl, die, finalValue } for animation use. */
    function buildDieElement(die, value) {
        // Outer wrapper carries the die-type class
        var wrapper = document.createElement("div");
        wrapper.className = "dr-die-d" + die;

        // Shape layer (provides the colored clip-path border)
        var shape = document.createElement("div");
        shape.className = "dr-die-shape";

        // Inner card (content, inset clip-path)
        var card = document.createElement("div");
        card.className = "dr-die-result";

        var label = document.createElement("span");
        label.className = "dr-die-label";
        label.textContent = "d" + die;

        var num = document.createElement("span");
        num.className = "dr-die-value";
        num.textContent = value;

        card.appendChild(label);
        card.appendChild(num);
        shape.appendChild(card);
        wrapper.appendChild(shape);
        return { wrapper: wrapper, valueEl: num, die: die, finalValue: value };
    }

    /** Start cycling random numbers on a die's value element.
     *  Returns the interval ID so it can be cleared later. */
    function startNumberCycle(valueEl, die) {
        return setInterval(function () {
            valueEl.textContent = rollDie(die);
        }, 35);
    }

    /** Perform a dice roll for all dice in the pool. */
    function doRoll() {
        if (rolling) return;

        // Check that pool has at least one die
        var hasDice = false;
        var i, j, die;
        for (i = 0; i < DIE_TYPES.length; i++) {
            if (pool[DIE_TYPES[i]] > 0) { hasDice = true; break; }
        }
        if (!hasDice) {
            totalEl.innerHTML = '<span class="dr-total-label">Add dice to the pool first.</span>';
            return;
        }

        rolling = true;
        rollBtn.disabled = true;

        // Clear previous results
        resultsEl.innerHTML = "";
        totalEl.innerHTML = "";

        // Roll dice grouped by type, building a row per type
        var total = 0;
        var allWrappers = [];  // flat list of all wrapper elements (for animation)

        for (i = 0; i < DIE_TYPES.length; i++) {
            die = DIE_TYPES[i];
            if (pool[die] === 0) continue;

            // Create a type-row container
            var typeRow = document.createElement("div");
            typeRow.className = "dr-type-row";

            var rowLabel = document.createElement("span");
            rowLabel.className = "dr-type-row-label";
            rowLabel.textContent = "d" + die;
            typeRow.appendChild(rowLabel);

            var rowDice = document.createElement("div");
            rowDice.className = "dr-type-row-dice";
            var rowInfos = [];

            for (j = 0; j < pool[die]; j++) {
                var value = rollDie(die);
                total += value;
                var info = buildDieElement(die, value);
                rowInfos.push(info);
            }

            // Sort ascending by final value
            rowInfos.sort(function (a, b) { return a.finalValue - b.finalValue; });

            for (j = 0; j < rowInfos.length; j++) {
                rowDice.appendChild(rowInfos[j].wrapper);
                allWrappers.push(rowInfos[j]);
            }

            typeRow.appendChild(rowDice);
            resultsEl.appendChild(typeRow);
        }

        if (animationEnabled && allWrappers.length > 0) {
            // Start number cycling on each die and apply staggered CSS animation
            var cycleIntervals = [];
            var typeRows = resultsEl.querySelectorAll(".dr-type-row-dice");
            var lastEl = null;
            var maxDelay = 0;

            for (i = 0; i < allWrappers.length; i++) {
                cycleIntervals.push(startNumberCycle(allWrappers[i].valueEl, allWrappers[i].die));
            }

            for (i = 0; i < typeRows.length; i++) {
                var rowChildren = typeRows[i].children;
                for (j = 0; j < rowChildren.length; j++) {
                    rowChildren[j].classList.add("dr-rolling");
                    var delay = j * 50;
                    rowChildren[j].style.animationDelay = delay + "ms";
                    if (delay >= maxDelay) {
                        maxDelay = delay;
                        lastEl = rowChildren[j];
                    }
                }
            }

            // When the last animation finishes, stop all cycling and show final values
            var onEnd = function () {
                lastEl.removeEventListener("animationend", onEnd);
                for (var k = 0; k < cycleIntervals.length; k++) {
                    clearInterval(cycleIntervals[k]);
                    allWrappers[k].valueEl.textContent = allWrappers[k].finalValue;
                    allWrappers[k].valueEl.classList.add("dr-settled");
                }
                showTotal(total, allWrappers.length);
                rolling = false;
                rollBtn.disabled = false;
            };
            lastEl.addEventListener("animationend", onEnd);
        } else {
            showTotal(total, allWrappers.length);
            rolling = false;
            rollBtn.disabled = false;
        }
    }

    /** Display the total sum in the total area. */
    function showTotal(total, count) {
        totalEl.innerHTML = '<span class="dr-total-label">Total: </span>' +
                            '<span class="dr-total-value">' +
                            escapeHtml(String(total)) + '</span>';
    }

    // ================================================================== //
    //  Settings handlers                                                  //
    // ================================================================== //

    function onAnimToggle() {
        animationEnabled = animToggle.checked;
        lsSet(LS_ANIMATION, animationEnabled ? "1" : "0");
    }

    // ================================================================== //
    //  Initialisation                                                     //
    // ================================================================== //

    function init() {
        // Grab DOM elements
        rollBtn    = document.getElementById("dr-roll-btn");
        clearBtn   = document.getElementById("dr-clear-btn");
        animToggle = document.getElementById("dr-anim-toggle");
        resultsEl  = document.getElementById("dr-results");
        totalEl    = document.getElementById("dr-total");

        // Load persisted settings
        var savedAnim = lsGet(LS_ANIMATION);
        if (savedAnim !== null) {
            animationEnabled = savedAnim === "1";
            animToggle.checked = animationEnabled;
        }

        // Bind pool buttons
        var rows = document.querySelectorAll(".dr-pool-row");
        var i;
        for (i = 0; i < rows.length; i++) {
            (function (row) {
                var die = parseInt(row.getAttribute("data-die"), 10);
                var minusBtn = row.querySelector(".dr-pool-minus");
                var plusBtn = row.querySelector(".dr-pool-plus");

                minusBtn.addEventListener("click", function () {
                    decrementDie(die);
                });
                plusBtn.addEventListener("click", function () {
                    incrementDie(die);
                });
            })(rows[i]);
        }

        // Bind action buttons
        rollBtn.addEventListener("click", doRoll);
        clearBtn.addEventListener("click", clearPool);
        animToggle.addEventListener("change", onAnimToggle);
    }

    // Kick off on DOM ready
    document.addEventListener("DOMContentLoaded", init);
})();
