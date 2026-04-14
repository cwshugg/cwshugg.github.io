// Moon Phase Tool — script/tools/moon.js
// Displays moon phase data for any date using the US Naval Observatory API.
// Uses the CelestialSphere library (script/lib/celestial.js) for rendering.
//
// Architecture:
//   - Fetches phase milestones from the USNO API (/api/moon/phases/date)
//   - Interpolates illumination via cosine curve between milestones
//   - Caches API responses in localStorage (7-day TTL, monthly key bucketing)
//   - Renders a visual moon sphere and phase details table

(function () {
    "use strict";

    // ================================================================== //
    //  Constants                                                          //
    // ================================================================== //

    var API_BASE = "https://aa.usno.navy.mil/api/moon/phases/date";
    var CACHE_PREFIX = "moon-";
    var CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    var API_ID = "shuggdev";        // Optional 8-char tracking ID for the API
    var FETCH_LOOKBACK_DAYS = 35;   // Days before target to start fetching
    var FETCH_NUMP = 10;            // Number of phases to request

    // Phase angles (radians) for each primary phase milestone.
    // Illumination is derived from the phase angle via (1 - cos(angle)) / 2,
    // so the phase angle is linearly interpolated between milestones and then
    // converted to illumination. This models the physical relationship more
    // accurately than interpolating illumination values directly.
    var PHASE_ANGLE = {
        "New Moon":      0,
        "First Quarter": Math.PI / 2,
        "Full Moon":     Math.PI,
        "Last Quarter":  3 * Math.PI / 2
    };

    // Valid API year range
    var MIN_YEAR = 1700;
    var MAX_YEAR = 2100;

    // ================================================================== //
    //  DOM References                                                     //
    // ================================================================== //

    var dateInput;      // <input type="date">
    var prevBtn;        // Previous day button
    var todayBtn;       // Today button
    var nextBtn;        // Next day button
    var canvasEl;       // <canvas> for moon rendering
    var illumLabel;     // Illumination percentage display
    var detailsEl;      // Phase details container

    // ================================================================== //
    //  State                                                              //
    // ================================================================== //

    var sphere = null;      // CelestialSphere instance
    var currentDate = null; // Currently displayed date string (YYYY-MM-DD)

    // ================================================================== //
    //  Date Utilities                                                     //
    // ================================================================== //

    /**
     * Returns today's date as a YYYY-MM-DD string.
     */
    function todayString() {
        var d = new Date();
        return toDateString(d);
    }

    /**
     * Formats a Date object as a YYYY-MM-DD string.
     *
     * @param {Date} date
     * @returns {string}
     */
    function toDateString(date) {
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, "0");
        var d = String(date.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + d;
    }

    /**
     * Shifts a date string by a given number of days.
     *
     * @param {string} dateStr - YYYY-MM-DD
     * @param {number} days    - Number of days to shift (positive or negative)
     * @returns {string} The new date as YYYY-MM-DD
     */
    function shiftDate(dateStr, days) {
        var parts = dateStr.split("-");
        var d = new Date(Date.UTC(
            parseInt(parts[0], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[2], 10)
        ));
        d.setUTCDate(d.getUTCDate() + days);
        return toUTCDateString(d);
    }

    /**
     * Formats a Date object as YYYY-MM-DD using UTC components.
     *
     * @param {Date} date
     * @returns {string}
     */
    function toUTCDateString(date) {
        var y = date.getUTCFullYear();
        var m = String(date.getUTCMonth() + 1).padStart(2, "0");
        var d = String(date.getUTCDate()).padStart(2, "0");
        return y + "-" + m + "-" + d;
    }

    /**
     * Parses a phase milestone object into a Date (UTC timestamp).
     * Phase objects have: { year, month, day, time: "HH:MM" }
     *
     * @param {Object} phase
     * @returns {Date}
     */
    function parsePhaseDatetime(phase) {
        var timeParts = phase.time.split(":");
        var hours = parseInt(timeParts[0], 10);
        var minutes = parseInt(timeParts[1], 10);
        return new Date(Date.UTC(phase.year, phase.month - 1, phase.day, hours, minutes, 0));
    }

    /**
     * Converts a date string (YYYY-MM-DD) to a UTC timestamp at noon.
     * Noon UTC is used as the representative daily value.
     *
     * @param {string} dateStr
     * @returns {number} UTC timestamp in milliseconds
     */
    function dateToNoonUTC(dateStr) {
        var parts = dateStr.split("-");
        return Date.UTC(
            parseInt(parts[0], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[2], 10),
            12, 0, 0
        );
    }

    /**
     * Converts a phase milestone object to a YYYY-MM-DD string.
     *
     * @param {Object} phase
     * @returns {string}
     */
    function phaseDateString(phase) {
        var y = phase.year;
        var m = String(phase.month).padStart(2, "0");
        var d = String(phase.day).padStart(2, "0");
        return y + "-" + m + "-" + d;
    }

    /**
     * Returns the year from a YYYY-MM-DD date string.
     *
     * @param {string} dateStr
     * @returns {number}
     */
    function getYear(dateStr) {
        return parseInt(dateStr.split("-")[0], 10);
    }

    // ================================================================== //
    //  Cache Layer                                                        //
    // ================================================================== //
    //  Uses localStorage to cache API responses. All access is wrapped in
    //  try/catch for resilience (private browsing, quota exceeded, etc.).

    /**
     * Retrieves a cached value by key, returning null if missing or expired.
     *
     * @param {string} key
     * @returns {Object|null}
     */
    function cacheGet(key) {
        try {
            var raw = localStorage.getItem(CACHE_PREFIX + key);
            if (!raw) return null;

            var entry = JSON.parse(raw);
            if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
                // Expired — remove stale entry
                localStorage.removeItem(CACHE_PREFIX + key);
                return null;
            }
            return entry.data;
        } catch (e) {
            return null;
        }
    }

    /**
     * Stores a value in the cache with a timestamp.
     * On quota exceeded, clears all moon cache entries and retries once.
     *
     * @param {string} key
     * @param {Object} data
     */
    function cacheSet(key, data) {
        var entry = JSON.stringify({
            timestamp: Date.now(),
            data: data
        });

        try {
            localStorage.setItem(CACHE_PREFIX + key, entry);
        } catch (e) {
            // Quota exceeded: clear all moon cache entries and retry
            if (e.name === "QuotaExceededError" || e.code === 22) {
                clearMoonCache();
                try {
                    localStorage.setItem(CACHE_PREFIX + key, entry);
                } catch (e2) {
                    // Silent degradation — caching unavailable
                }
            }
        }
    }

    /**
     * Removes all localStorage entries with the moon cache prefix.
     */
    function clearMoonCache() {
        try {
            var keysToRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.indexOf(CACHE_PREFIX) === 0) {
                    keysToRemove.push(k);
                }
            }
            for (var j = 0; j < keysToRemove.length; j++) {
                localStorage.removeItem(keysToRemove[j]);
            }
        } catch (e) {
            // Silent degradation
        }
    }

    // ================================================================== //
    //  API Layer                                                          //
    // ================================================================== //

    /**
     * Fetches phase milestone data from the US Navy API.
     *
     * @param {string} startDate - YYYY-MM-DD fetch start date
     * @param {number} nump      - Number of phases to request (1–99)
     * @returns {Promise<Object>} Resolves with API response JSON
     */
    function fetchPhaseData(startDate, nump) {
        var url = API_BASE
            + "?date=" + encodeURIComponent(startDate)
            + "&nump=" + nump
            + "&ID=" + API_ID;

        return fetch(url)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("API returned HTTP " + response.status);
                }
                return response.json();
            })
            .then(function (json) {
                if (json.error) {
                    throw new Error(json.error);
                }
                if (!json.phasedata || !Array.isArray(json.phasedata)) {
                    throw new Error("Received unexpected data from the API.");
                }
                return json;
            });
    }

    /**
     * Gets phase data covering the target date, using cache or API.
     *
     * Strategy:
     *   1. Compute fetch start: target - 35 days, rounded to 1st of month
     *   2. Check cache with key built from that date
     *   3. On miss, fetch from API and cache the result
     *
     * @param {string} targetDate - YYYY-MM-DD
     * @returns {Promise<Array>} Resolves with phasedata array
     */
    function getPhaseDataForDate(targetDate) {
        // Compute fetch start: target - FETCH_LOOKBACK_DAYS, snapped to 1st of month
        var lookbackDate = shiftDate(targetDate, -FETCH_LOOKBACK_DAYS);
        var parts = lookbackDate.split("-");
        var fetchStart = parts[0] + "-" + parts[1] + "-01";

        // Build cache key from the month-bucketed start date and nump
        var cacheKey = "phases-" + fetchStart + "-" + FETCH_NUMP;

        // Check cache
        var cached = cacheGet(cacheKey);
        if (cached) {
            return Promise.resolve(cached);
        }

        // Fetch from API
        return fetchPhaseData(fetchStart, FETCH_NUMP)
            .then(function (json) {
                cacheSet(cacheKey, json.phasedata);
                return json.phasedata;
            });
    }

    // ================================================================== //
    //  Interpolation                                                      //
    // ================================================================== //

    /**
     * Finds the two phase milestones that bracket the target date.
     *
     * @param {string} targetDate - YYYY-MM-DD
     * @param {Array}  phaseData  - Array of phase milestone objects
     * @returns {Object} { prev, next, currentMilestone }
     *   - prev: last milestone with date <= target (or null)
     *   - next: first milestone with date > target (or null)
     *   - currentMilestone: if target IS a milestone date, that milestone (or null)
     */
    function findBracketingPhases(targetDate, phaseData) {
        var targetNoon = dateToNoonUTC(targetDate);
        var prev = null;
        var next = null;
        var currentMilestone = null;

        for (var i = 0; i < phaseData.length; i++) {
            var milestone = phaseData[i];
            var milestoneTime = parsePhaseDatetime(milestone).getTime();

            if (milestoneTime <= targetNoon) {
                prev = milestone;
                // Check if target IS the milestone date
                if (phaseDateString(milestone) === targetDate) {
                    currentMilestone = milestone;
                }
            } else {
                if (!next) {
                    next = milestone;
                }
            }
        }

        return {
            prev: prev,
            next: next,
            currentMilestone: currentMilestone
        };
    }

    /**
     * Interpolates illumination between two bracketing phase milestones
     * using phase-angle interpolation.
     *
     * Strategy:
     *   1. Map each milestone to its phase angle (radians)
     *   2. Linearly interpolate the phase angle between milestones
     *   3. Convert interpolated angle to illumination via (1 - cos(angle)) / 2
     *
     * This models the physical relationship accurately: the moon's orbital
     * phase angle progresses roughly linearly, while illumination is the
     * cosine of that angle. Interpolating illumination directly with a
     * cosine curve produces significant error (up to ~11 percentage points).
     *
     * @param {string} targetDate - YYYY-MM-DD
     * @param {Object} prevPhase  - Previous milestone { phase, year, month, day, time }
     * @param {Object} nextPhase  - Next milestone
     * @returns {number} Illumination fraction in [0.0, 1.0]
     */
    function interpolateIllumination(targetDate, prevPhase, nextPhase) {
        var t  = dateToNoonUTC(targetDate);
        var t0 = parsePhaseDatetime(prevPhase).getTime();
        var t1 = parsePhaseDatetime(nextPhase).getTime();

        // Get phase angles for the bracketing milestones
        var a0 = PHASE_ANGLE[prevPhase.phase];
        var a1 = PHASE_ANGLE[nextPhase.phase];

        // Handle the Last Quarter → New Moon wrap-around:
        // Last Quarter is 3π/2 and the next New Moon should be treated as 2π
        // (continuing forward) rather than 0 (wrapping back).
        if (a1 <= a0) {
            a1 += 2 * Math.PI;
        }

        // Guard against zero interval (shouldn't happen in practice)
        if (t1 === t0) return (1 - Math.cos(a0)) / 2;

        // Progress ratio through the current segment
        var p = (t - t0) / (t1 - t0);
        p = Math.max(0, Math.min(1, p));

        // Linearly interpolate the phase angle
        var angle = a0 + (a1 - a0) * p;

        // Convert phase angle to illumination
        var f = (1 - Math.cos(angle)) / 2;

        // Clamp to valid range
        return Math.max(0, Math.min(1, f));
    }

    /**
     * Determines whether the moon is waxing based on the previous milestone.
     * Waxing: after New Moon or First Quarter (right side lit).
     * Waning: after Full Moon or Last Quarter (left side lit).
     *
     * @param {Object} prevPhase
     * @returns {boolean}
     */
    function isWaxing(prevPhase) {
        return prevPhase.phase === "New Moon" || prevPhase.phase === "First Quarter";
    }

    /**
     * Determines the descriptive 8-name phase name from the segment position
     * and interpolated illumination.
     *
     * The 8 phase names are:
     *   New Moon, Waxing Crescent, First Quarter, Waxing Gibbous,
     *   Full Moon, Waning Gibbous, Last Quarter, Waning Crescent
     *
     * @param {Object} prevPhase    - Previous milestone
     * @param {Object} nextPhase    - Next milestone
     * @param {number} illumination - Interpolated illumination [0, 1]
     * @returns {string}
     */
    function determinePhaseName(prevPhase, nextPhase, illumination) {
        // Check for milestone-level illumination
        if (illumination < 0.01) return "New Moon";
        if (illumination > 0.99) return "Full Moon";

        var waxing = isWaxing(prevPhase);

        if (waxing) {
            // Check for First Quarter (close to 0.5, coming from New Moon)
            if (Math.abs(illumination - 0.5) < 0.01 &&
                prevPhase.phase === "New Moon") {
                return "First Quarter";
            }
            return illumination < 0.5 ? "Waxing Crescent" : "Waxing Gibbous";
        } else {
            // Check for Last Quarter (close to 0.5, coming from Full Moon)
            if (Math.abs(illumination - 0.5) < 0.01 &&
                prevPhase.phase === "Full Moon") {
                return "Last Quarter";
            }
            return illumination > 0.5 ? "Waning Gibbous" : "Waning Crescent";
        }
    }

    // ================================================================== //
    //  UI Rendering                                                       //
    // ================================================================== //

    /**
     * Main display update function. Fetches data, computes illumination,
     * renders the moon sphere, and populates the phase details table.
     *
     * @param {string} targetDate - YYYY-MM-DD
     */
    function updateDisplay(targetDate) {
        // Validate date range
        var year = getYear(targetDate);
        if (year < MIN_YEAR || year > MAX_YEAR) {
            renderError("Moon phase data is available for dates between " + MIN_YEAR + " and " + MAX_YEAR + ".");
            return;
        }

        // Show loading state
        if (detailsEl) {
            detailsEl.innerHTML = '<p class="moon-loading">Loading moon phase data…</p>';
        }
        if (illumLabel) {
            illumLabel.textContent = "";
        }

        getPhaseDataForDate(targetDate)
            .then(function (phaseData) {
                var bracket = findBracketingPhases(targetDate, phaseData);

                // Validate that we have bracketing phases
                if (!bracket.prev || !bracket.next) {
                    renderError("Unable to determine moon phase for this date. Try a nearby date.");
                    return;
                }

                // Compute illumination
                var illumination = interpolateIllumination(targetDate, bracket.prev, bracket.next);
                var waxing = isWaxing(bracket.prev);
                var phaseName = determinePhaseName(bracket.prev, bracket.next, illumination);

                // Render moon sphere
                renderMoon(illumination, waxing);

                // Update illumination label
                var illumPercent = Math.round(illumination * 100);
                if (illumLabel) {
                    illumLabel.textContent = illumPercent + "% illuminated";
                }

                // Render phase details table
                renderDetails({
                    phaseName: phaseName,
                    illumination: illumPercent,
                    prev: bracket.prev,
                    next: bracket.next,
                    currentMilestone: bracket.currentMilestone
                });
            })
            .catch(function (err) {
                console.error("Moon phase error:", err);
                renderError("Unable to fetch moon phase data. Please check your connection and try again.");
            });
    }

    /**
     * Updates the CelestialSphere with new illumination and waxing values.
     *
     * @param {number}  illumination - 0.0 to 1.0
     * @param {boolean} waxing       - true = right side lit
     */
    function renderMoon(illumination, waxing) {
        if (!sphere) return;
        sphere.update({
            illumination: illumination,
            waxing: waxing
        });
    }

    /**
     * Renders the phase details table into the details container.
     *
     * @param {Object} data
     *   - phaseName:        string
     *   - illumination:     number (percent, 0–100)
     *   - prev:             phase milestone object
     *   - next:             phase milestone object
     *   - currentMilestone: phase milestone object or null
     */
    function renderDetails(data) {
        if (!detailsEl) return;

        var rows = [
            { label: "Phase Name",          value: data.phaseName },
            { label: "Illumination",        value: data.illumination + "%" },
            { label: "Previous Milestone",  value: formatMilestone(data.prev) },
            { label: "Next Milestone",      value: formatMilestone(data.next) }
        ];

        // Show current milestone only if the target date IS a milestone date
        if (data.currentMilestone) {
            rows.push({
                label: "Current Milestone",
                value: data.currentMilestone.phase + " — " + data.currentMilestone.time + " UTC"
            });
        }

        var html = "<table>" +
            "<thead><tr><th>Field</th><th>Value</th></tr></thead>" +
            "<tbody>";

        for (var i = 0; i < rows.length; i++) {
            html += "<tr><td>" + rows[i].label + "</td><td>" + rows[i].value + "</td></tr>";
        }

        html += "</tbody></table>";
        detailsEl.innerHTML = html;
    }

    /**
     * Formats a phase milestone object for display.
     * Output: "Phase Name — Mon DD, YYYY HH:MM UTC"
     *
     * @param {Object} phase - { phase, year, month, day, time }
     * @returns {string}
     */
    function formatMilestone(phase) {
        if (!phase) return "—";

        var months = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];

        var monthName = months[phase.month - 1] || "???";
        return phase.phase + " — "
            + monthName + " " + phase.day + ", " + phase.year
            + " " + phase.time + " UTC";
    }

    /**
     * Displays an error message in the details container.
     * Uses the site's accent3 (grapefruit) color for error styling,
     * consistent with the bitwise tool's error display pattern.
     *
     * @param {string} message
     */
    function renderError(message) {
        if (!detailsEl) return;
        var p = document.createElement("p");
        p.style.color = "var(--color-accent3)";
        p.textContent = message;
        detailsEl.innerHTML = "";
        detailsEl.appendChild(p);
    }

    // ================================================================== //
    //  Event Handlers                                                     //
    // ================================================================== //

    /**
     * Handles date input change events.
     */
    function onDateChange() {
        var val = dateInput.value;
        if (val) {
            currentDate = val;
            updateDisplay(currentDate);
        }
    }

    /**
     * Navigates to the previous day.
     */
    function onPrevDay() {
        if (!currentDate) return;
        currentDate = shiftDate(currentDate, -1);
        dateInput.value = currentDate;
        updateDisplay(currentDate);
    }

    /**
     * Navigates to today's date.
     */
    function onToday() {
        currentDate = todayString();
        dateInput.value = currentDate;
        updateDisplay(currentDate);
    }

    /**
     * Navigates to the next day.
     */
    function onNextDay() {
        if (!currentDate) return;
        currentDate = shiftDate(currentDate, 1);
        dateInput.value = currentDate;
        updateDisplay(currentDate);
    }

    // ================================================================== //
    //  Initialization                                                     //
    // ================================================================== //

    /**
     * Initializes the Moon Phase tool:
     *   1. Grabs DOM elements by ID
     *   2. Verifies CelestialSphere is loaded
     *   3. Verifies canvas support
     *   4. Sets responsive canvas size
     *   5. Loads the moon texture image
     *   6. Creates the CelestialSphere instance
     *   7. Sets up image onload re-render
     *   8. Sets date input to today
     *   9. Wires up event listeners
     *   10. Triggers the initial display update
     */
    function init() {
        // 1. Grab DOM elements
        dateInput  = document.getElementById("moon-date-input");
        prevBtn    = document.getElementById("moon-prev-btn");
        todayBtn   = document.getElementById("moon-today-btn");
        nextBtn    = document.getElementById("moon-next-btn");
        canvasEl   = document.getElementById("moon-canvas");
        illumLabel = document.getElementById("moon-illum-label");
        detailsEl  = document.getElementById("moon-details");

        // 2. Verify CelestialSphere is loaded
        if (typeof CelestialSphere === "undefined") {
            renderError("Failed to load rendering library.");
            return;
        }

        // 3. Verify canvas support
        if (!canvasEl || !canvasEl.getContext) {
            renderError("Your browser does not support the Canvas element.");
            return;
        }

        // 4. Set responsive canvas size
        var containerWidth = canvasEl.parentElement.clientWidth;
        var size = Math.min(240, containerWidth - 32);
        canvasEl.width = size;
        canvasEl.height = size;

        // 5. Load the moon texture image for realistic rendering
        var moonImage = new Image();
        moonImage.src = "/images/astro/moon.png";

        // 6. Create CelestialSphere instance with lunar appearance settings
        sphere = new CelestialSphere(canvasEl, {
            image:            moonImage,   // Moon texture overlay
            color:            "#C8C8C8",   // Neutral lunar grey (fallback while image loads)
            shadowColor:      "#1a1a2e",   // Deep dark blue-black
            illumination:     0.0,         // Start dark; will update immediately
            waxing:           true,
            shading:          true,
            shadingIntensity: 0.25,
            edgeColor:        "#6B717E",   // Slate gray border
            edgeWidth:        4,           // Thick border
            background:       null,        // Transparent
            shadowOpacity:    0.85         // Translucent shadow to show moon texture
        });

        // 7. Re-render when the moon texture finishes loading
        moonImage.onload = function () { sphere.render(); };

        // 8. Set date input to today
        currentDate = todayString();
        if (dateInput) {
            dateInput.value = currentDate;
        }

        // 9. Wire up event listeners
        if (dateInput) {
            dateInput.addEventListener("change", onDateChange);
        }
        if (prevBtn) {
            prevBtn.addEventListener("click", onPrevDay);
        }
        if (todayBtn) {
            todayBtn.addEventListener("click", onToday);
        }
        if (nextBtn) {
            nextBtn.addEventListener("click", onNextDay);
        }

        // 10. Trigger initial display update
        updateDisplay(currentDate);
    }

    // Run initialization
    init();
})();
