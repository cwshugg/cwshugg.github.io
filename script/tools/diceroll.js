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
    var MAX_PER_TYPE = 20;
    var LS_ANIMATION = "diceroll-animation";

    // ================================================================== //
    //  State                                                              //
    // ================================================================== //

    var pool = { 4: 0, 6: 1, 8: 0, 10: 0, 12: 0, 20: 0 };
    var customTypes = [];  // list of custom side counts added by the user
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

    /** Disable or enable all pool control buttons. */
    function setPoolButtonsDisabled(disabled) {
        var btns = document.querySelectorAll(".dr-pool-btn");
        var i;
        for (i = 0; i < btns.length; i++) {
            btns[i].disabled = disabled;
        }
        if (clearBtn) { clearBtn.disabled = disabled; }
    }

    /** Generate a deterministic HSL color from a die side count. */
    function dieColor(sides) {
        // Simple hash: multiply by a large prime, mod 360 for hue
        var hash = ((sides * 2654435761) >>> 0) % 360;
        return "hsl(" + hash + ", 60%, 55%)";
    }

    /** Build a custom die pool row and insert it into the DOM. */
    function addCustomDieRow(sides) {
        var poolEl = document.querySelector(".dr-pool");
        var row = document.createElement("div");
        row.className = "dr-pool-row";
        row.setAttribute("data-die", String(sides));

        var label = document.createElement("span");
        label.className = "dr-pool-label";
        label.textContent = "d" + sides;
        label.style.color = dieColor(sides);

        var minusBtn = document.createElement("button");
        minusBtn.className = "dr-pool-btn dr-pool-minus";
        minusBtn.setAttribute("aria-label", "Remove a d" + sides);
        minusBtn.textContent = "\u2212";  // minus sign

        var countSpan = document.createElement("span");
        countSpan.className = "dr-pool-count";
        countSpan.id = "dr-count-" + sides;
        countSpan.textContent = "1";

        var plusBtn = document.createElement("button");
        plusBtn.className = "dr-pool-btn dr-pool-plus";
        plusBtn.setAttribute("aria-label", "Add a d" + sides);
        plusBtn.textContent = "+";

        var removeBtn = document.createElement("button");
        removeBtn.className = "dr-pool-btn dr-pool-remove";
        removeBtn.setAttribute("aria-label", "Remove d" + sides + " from pool");
        removeBtn.textContent = "\u2715";  // ✕

        row.appendChild(label);
        row.appendChild(minusBtn);
        row.appendChild(countSpan);
        row.appendChild(plusBtn);
        row.appendChild(removeBtn);
        poolEl.appendChild(row);

        // Bind +/- buttons
        minusBtn.addEventListener("click", function () { decrementDie(sides); });
        plusBtn.addEventListener("click", function () { incrementDie(sides); });
        removeBtn.addEventListener("click", function () { removeCustomDie(sides, row); });
    }

    /** Remove a custom die type entirely from the pool. */
    function removeCustomDie(sides, rowEl) {
        if (rolling) return;
        var idx = customTypes.indexOf(sides);
        if (idx !== -1) { customTypes.splice(idx, 1); }
        delete pool[sides];
        rowEl.parentNode.removeChild(rowEl);
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

    /** Increment the pool count for a die type (max MAX_PER_TYPE). */
    function incrementDie(die) {
        if (pool[die] < MAX_PER_TYPE) {
            pool[die] = pool[die] + 1;
            updateCountDisplay(die);
        }
    }

    /** Decrement the pool count for a die type (min 0). */
    function decrementDie(die) {
        if (pool[die] > 0) {
            pool[die] = pool[die] - 1;
            updateCountDisplay(die);
        }
    }

    /** Clear all dice from the pool (including custom types). */
    function clearPool() {
        var i;
        for (i = 0; i < DIE_TYPES.length; i++) {
            pool[DIE_TYPES[i]] = 0;
            updateCountDisplay(DIE_TYPES[i]);
        }
        for (i = 0; i < customTypes.length; i++) {
            pool[customTypes[i]] = 0;
            updateCountDisplay(customTypes[i]);
        }
    }

    // ================================================================== //
    //  Core logic                                                         //
    // ================================================================== //

    /** Build a single die result element with the shape wrapper.
     *  Returns { wrapper, valueEl, die, finalValue } for animation use. */
    function buildDieElement(die, value) {
        var isCustom = DIE_TYPES.indexOf(die) === -1;

        // Outer wrapper carries the die-type class
        var wrapper = document.createElement("div");
        wrapper.className = isCustom ? "dr-die-custom" : ("dr-die-d" + die);

        // Shape layer (provides the colored clip-path border)
        var shape = document.createElement("div");
        shape.className = "dr-die-shape";

        // For custom dice, set the background color from hash
        if (isCustom) {
            shape.style.background = dieColor(die);
        }

        // Inner card (content, inset clip-path)
        var card = document.createElement("div");
        card.className = "dr-die-result";

        var label = document.createElement("span");
        label.className = "dr-die-label";
        label.textContent = "d" + die;

        var num = document.createElement("span");
        num.className = "dr-die-value";
        num.textContent = value;

        // For custom dice, set the value text color from hash
        if (isCustom) {
            num.style.color = dieColor(die);
        }

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
        }, 17);
    }

    /** Perform a dice roll for all dice in the pool. */
    function doRoll() {
        if (rolling) return;

        // Check that pool has at least one die
        var hasDice = false;
        var i, j, die;
        var allTypes = DIE_TYPES.concat(customTypes);
        for (i = 0; i < allTypes.length; i++) {
            if (pool[allTypes[i]] > 0) { hasDice = true; break; }
        }
        if (!hasDice) {
            totalEl.innerHTML = '<span class="dr-total-label">Add dice to the pool first.</span>';
            return;
        }

        rolling = true;
        rollBtn.disabled = true;
        setPoolButtonsDisabled(true);

        // Clear previous results
        resultsEl.innerHTML = "";
        totalEl.innerHTML = "";

        // Roll dice grouped by type, building a row per type
        var total = 0;
        var allWrappers = [];  // flat list of all wrapper elements (for animation)

        for (i = 0; i < allTypes.length; i++) {
            die = allTypes[i];
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
            var animDone = false;
            var onEnd = function () {
                if (animDone) return;
                animDone = true;
                lastEl.removeEventListener("animationend", onEnd);
                for (var k = 0; k < cycleIntervals.length; k++) {
                    clearInterval(cycleIntervals[k]);
                    allWrappers[k].valueEl.textContent = allWrappers[k].finalValue;
                    allWrappers[k].valueEl.classList.add("dr-settled");
                }
                showTotal(total);
                rolling = false;
                rollBtn.disabled = false;
                setPoolButtonsDisabled(false);
            };
            lastEl.addEventListener("animationend", onEnd);

            // Safety timeout: force cleanup if animationend never fires
            // 0.6s animation + max stagger delay + 300ms buffer
            var safetyMs = 600 + maxDelay + 300;
            setTimeout(function () {
                if (!animDone) { onEnd(); }
            }, safetyMs);
        } else {
            showTotal(total);
            rolling = false;
            rollBtn.disabled = false;
            setPoolButtonsDisabled(false);
        }
    }

    /** Display the total sum in the total area. */
    function showTotal(total) {
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

        // Respect prefers-reduced-motion
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            animationEnabled = false;
            animToggle.checked = false;
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

        // Bind custom dice add button
        var customInput = document.getElementById("dr-custom-input");
        var customAddBtn = document.getElementById("dr-custom-add-btn");

        /** Add a custom die type from the input field. */
        function addCustomDie() {
            var sides = parseInt(customInput.value, 10);
            if (isNaN(sides) || sides < 2) return;

            // Skip if it's a built-in type or already added
            if (DIE_TYPES.indexOf(sides) !== -1) return;
            if (customTypes.indexOf(sides) !== -1) {
                // Already exists — just increment
                incrementDie(sides);
                customInput.value = "";
                return;
            }

            // Register the new custom type
            customTypes.push(sides);
            pool[sides] = 1;
            addCustomDieRow(sides);
            customInput.value = "";
        }

        customAddBtn.addEventListener("click", addCustomDie);
        customInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.keyCode === 13) {
                e.preventDefault();
                addCustomDie();
            }
        });
    }

    // Kick off on DOM ready
    document.addEventListener("DOMContentLoaded", init);
})();
