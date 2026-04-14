// Earth Seasons Tool — script/tools/seasons.js
// Displays current astronomical season, progress, and a tilted Earth globe
// using the US Naval Observatory API for equinox/solstice data.
// Uses the CelestialSphere library (script/lib/celestial.js) for rendering.
//
// Architecture:
//   - Fetches equinox/solstice dates from the USNO API (/api/seasons)
//   - Always fetches UTC data (tz=0, dst=false) for internal computation
//   - Fetches 3 years in parallel (previous + current + next) for boundary coverage
//   - Caches API responses in localStorage (keyed by year, no expiration)
//   - Derives season from event month, computes progress and tilt angle
//   - Renders a tilted Earth globe and season details table

(function () {
    "use strict";

    // ================================================================== //
    //  Constants                                                          //
    // ================================================================== //

    var API_BASE     = "https://aa.usno.navy.mil/api/seasons";
    var CACHE_PREFIX = "seasons-";
    var API_ID       = "shuggdev";       // Optional tracking ID for the API
    var AXIAL_TILT   = 23.44;            // Earth's axial tilt in degrees
    var MIN_YEAR     = 1700;
    var MAX_YEAR     = 2100;

    // Season emoji prefixes for the label below the globe
    var SEASON_EMOJI = {
        "Spring": "\uD83C\uDF38",   // 🌸
        "Summer": "\u2600\uFE0F",   // ☀️
        "Fall":   "\uD83C\uDF42",   // 🍂
        "Winter": "\u2744\uFE0F"    // ❄️
    };

    // Northern ↔ Southern hemisphere season mapping
    var OPPOSITE_SEASON = {
        "Spring": "Fall",
        "Summer": "Winter",
        "Fall":   "Spring",
        "Winter": "Summer"
    };

    // Axis line extension factor (1.0 = sphere boundary, 1.3 = 30% beyond)
    var AXIS_EXTEND = 1.3;

    // Scene rendering constants
    var CANVAS_ASPECT = 2;          // Canvas width:height ratio (2:1)
    var CANVAS_MAX_W  = 600;        // Maximum canvas width in pixels
    var EARTH_X_FRAC  = 0.5;        // Earth center X as fraction of width
    var SUN_SCALE     = 109;        // Sun radius / Earth radius
    var SUN_COLOR     = "#E7E247";  // Sun surface color (warm yellow)

    // Full month names for date formatting
    var MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    // ================================================================== //
    //  DOM References                                                     //
    // ================================================================== //

    var dateInput;      // <input type="date">
    var tzInput;        // <input type="number"> for UTC offset
    var dstCheckbox;    // <input type="checkbox"> for DST toggle
    var canvasEl;       // <canvas> for Earth rendering
    var labelEl;        // Season name label below the globe
    var detailsEl;      // Season details container

    // ================================================================== //
    //  State                                                              //
    // ================================================================== //

    var sphere      = null;   // CelestialSphere instance
    var currentDate = null;   // Currently displayed date string (YYYY-MM-DD)
    var currentTz   = 0;      // Current timezone offset (hours from UTC)
    var currentDst  = false;  // Current DST toggle state

    // Scene rendering state
    var mainCtx     = null;   // 2D context for the main visible canvas
    var earthCanvas = null;   // Offscreen canvas for CelestialSphere rendering
    var earthRadius = 0;      // Computed Earth sphere radius in pixels
    var earthCX     = 0;      // Earth center X on main canvas
    var earthCY     = 0;      // Earth center Y on main canvas
    var currentTilt = 0;      // Last computed tilt angle (for re-render on image load)

    // ================================================================== //
    //  Date Utilities                                                     //
    // ================================================================== //

    /**
     * Returns today's date as a YYYY-MM-DD string (local time).
     */
    function todayString() {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, "0");
        var day = String(d.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
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
     * Parses an API event object into a UTC timestamp (milliseconds).
     * Events have: { year, month, day, time: "HH:MM" }
     * The time is always UTC when fetched with tz=0, dst=false.
     *
     * @param {Object} event
     * @returns {number} UTC timestamp in milliseconds
     */
    function parseEventTimestamp(event) {
        var match = event.time.match(/^(\d{2}):(\d{2})/);
        var hours = match ? parseInt(match[1], 10) : 0;
        var minutes = match ? parseInt(match[2], 10) : 0;
        return Date.UTC(event.year, event.month - 1, event.day, hours, minutes, 0);
    }

    /**
     * Formats an event date/time for human display, applying timezone offset
     * and optional DST adjustment. Uses 12-hour AM/PM format.
     *
     * @param {Object} event  - { year, month, day, time }
     * @param {number} tzOffset - Hours from UTC (e.g. -5 for EST)
     * @param {boolean} dst - Whether to add 1 hour for DST
     * @returns {string} e.g. "March 20, 2026 at 4:46 AM (UTC-5)"
     */
    function formatEventDate(event, tzOffset, dst) {
        // Parse the UTC time
        var match = event.time.match(/^(\d{2}):(\d{2})/);
        var utcHours = match ? parseInt(match[1], 10) : 0;
        var utcMinutes = match ? parseInt(match[2], 10) : 0;

        // Create a UTC Date object for this event
        var d = new Date(Date.UTC(event.year, event.month - 1, event.day, utcHours, utcMinutes, 0));

        // Apply timezone offset (convert to total minutes, then add)
        var offsetMinutes = tzOffset * 60;
        if (dst) {
            offsetMinutes += 60; // DST adds 1 hour
        }
        d = new Date(d.getTime() + offsetMinutes * 60 * 1000);

        // Format in 12-hour AM/PM using UTC values (since we already shifted)
        var displayHours = d.getUTCHours();
        var displayMinutes = d.getUTCMinutes();
        var ampm = displayHours >= 12 ? "PM" : "AM";
        var hour12 = displayHours % 12;
        if (hour12 === 0) hour12 = 12;
        var minuteStr = String(displayMinutes).padStart(2, "0");

        var monthName = MONTH_NAMES[d.getUTCMonth()] || "???";
        var dayNum = d.getUTCDate();
        var yearNum = d.getUTCFullYear();

        // Build timezone label
        var tzLabel = "UTC";
        var totalOffset = tzOffset + (dst ? 1 : 0);
        if (totalOffset !== 0) {
            tzLabel += (totalOffset >= 0 ? "+" : "") + totalOffset;
        }

        return monthName + " " + dayNum + ", " + yearNum
             + " at " + hour12 + ":" + minuteStr + " " + ampm
             + " (" + tzLabel + ")";
    }

    // ================================================================== //
    //  Season Derivation                                                  //
    // ================================================================== //

    /**
     * Maps an API event to a season name based on phenomenon and month.
     * Only Equinox and Solstice events are season boundaries.
     *
     * @param {Object} event - { phenom, month, ... }
     * @returns {string|null} Season name or null for non-season events
     */
    function mapEventToSeason(event) {
        if (event.phenom === "Equinox"  && event.month <= 6)  return "Spring";
        if (event.phenom === "Solstice" && event.month <= 6)  return "Summer";
        if (event.phenom === "Equinox"  && event.month > 6)   return "Fall";
        if (event.phenom === "Solstice" && event.month > 6)   return "Winter";
        return null; // Perihelion/Aphelion — not a season boundary
    }

    /**
     * Filters an array of API events to keep only season boundary events
     * (Equinox and Solstice). Discards Perihelion and Aphelion.
     *
     * @param {Array} events - Raw API event array
     * @returns {Array} Filtered events with added `season` property
     */
    function filterSeasonEvents(events) {
        var result = [];
        for (var i = 0; i < events.length; i++) {
            var season = mapEventToSeason(events[i]);
            if (season !== null) {
                var ev = {};
                for (var key in events[i]) {
                    if (events[i].hasOwnProperty(key)) {
                        ev[key] = events[i][key];
                    }
                }
                ev.season = season;
                ev.timestamp = parseEventTimestamp(events[i]);
                result.push(ev);
            }
        }
        return result;
    }

    /**
     * Finds the current season by bracketing the selected date between
     * two consecutive season boundary events.
     *
     * @param {number} targetTimestamp - Noon UTC timestamp for the selected date
     * @param {Array} events - Sorted array of season boundary events with timestamps
     * @returns {Object|null} { current, next } event pair, or null
     */
    function findCurrentSeason(targetTimestamp, events) {
        // Find the last event that starts on or before the target date
        var currentIdx = -1;
        for (var i = 0; i < events.length; i++) {
            if (events[i].timestamp <= targetTimestamp) {
                currentIdx = i;
            }
        }

        if (currentIdx === -1) {
            // Target is before the earliest event — assume Winter
            // (the only season that can precede a year's March equinox)
            return null;
        }

        var nextIdx = currentIdx + 1;
        if (nextIdx >= events.length) {
            // No next event available — shouldn't happen with 3-year data
            return null;
        }

        return {
            current: events[currentIdx],
            next: events[nextIdx]
        };
    }

    /**
     * Computes progress through the current season.
     *
     * @param {number} targetTimestamp - Noon UTC for the selected date
     * @param {number} startTimestamp - Start of current season
     * @param {number} endTimestamp - Start of next season
     * @returns {Object} { elapsedDays, totalDays, percentage }
     */
    function computeProgress(targetTimestamp, startTimestamp, endTimestamp) {
        var msPerDay = 24 * 60 * 60 * 1000;
        var totalMs   = endTimestamp - startTimestamp;
        var elapsedMs = targetTimestamp - startTimestamp;

        var totalDays   = Math.round(totalMs / msPerDay);
        var elapsedDays = Math.floor(elapsedMs / msPerDay);
        var percentage  = Math.round((elapsedMs / totalMs) * 100);

        // Clamp to valid range
        elapsedDays = Math.max(0, Math.min(elapsedDays, totalDays));
        percentage  = Math.max(0, Math.min(percentage, 100));

        return {
            elapsedDays: elapsedDays,
            totalDays:   totalDays,
            percentage:  percentage
        };
    }

    /**
     * Computes the Earth's visible tilt angle for the globe rendering.
     * Uses a sinusoidal model relative to the vernal equinox.
     *
     * The tilt varies as: AXIAL_TILT * sin(2*PI*t)
     * where t is the fractional progress from one vernal equinox to the next.
     * Positive tilt = clockwise = north pole leans right (toward sun).
     *
     * @param {number} targetTimestamp - Noon UTC for the selected date
     * @param {Array} events - Sorted season boundary events
     * @returns {number} Tilt angle in degrees
     */
    function computeTiltAngle(targetTimestamp, events) {
        // Find the vernal equinoxes (Spring events)
        var vernalEquinoxes = [];
        for (var i = 0; i < events.length; i++) {
            if (events[i].season === "Spring") {
                vernalEquinoxes.push(events[i]);
            }
        }

        if (vernalEquinoxes.length === 0) {
            return 0; // No data — default to no tilt
        }

        // Find the bounding vernal equinoxes for the target date
        var prevVernal = null;
        var nextVernal = null;

        for (var j = 0; j < vernalEquinoxes.length; j++) {
            if (vernalEquinoxes[j].timestamp <= targetTimestamp) {
                prevVernal = vernalEquinoxes[j];
            } else if (nextVernal === null) {
                nextVernal = vernalEquinoxes[j];
            }
        }

        // If no previous vernal equinox, estimate one ~365.25 days before the next
        if (!prevVernal && nextVernal) {
            prevVernal = {
                timestamp: nextVernal.timestamp - (365.25 * 24 * 60 * 60 * 1000)
            };
        }

        // If no next vernal equinox, estimate one ~365.25 days after the previous
        if (prevVernal && !nextVernal) {
            nextVernal = {
                timestamp: prevVernal.timestamp + (365.25 * 24 * 60 * 60 * 1000)
            };
        }

        if (!prevVernal || !nextVernal) {
            return 0; // Should not happen
        }

        // Compute fractional progress through the seasonal cycle [0, 1)
        var totalMs = nextVernal.timestamp - prevVernal.timestamp;
        var elapsedMs = targetTimestamp - prevVernal.timestamp;
        var t = totalMs > 0 ? (elapsedMs / totalMs) : 0;

        // Sinusoidal tilt: 0 at equinoxes, +23.44 at summer solstice
        // (clockwise / north pole leans right toward sun),
        // -23.44 at winter solstice (counterclockwise / north pole leans left).
        return AXIAL_TILT * Math.sin(2 * Math.PI * t);
    }

    // ================================================================== //
    //  Cache Layer                                                        //
    // ================================================================== //
    //  Uses localStorage to cache API responses. All access is wrapped in
    //  try/catch for resilience (private browsing, quota exceeded, etc.).
    //  Season data is deterministic — no expiration needed.

    /**
     * Retrieves cached season data for a given year.
     *
     * @param {number} year
     * @returns {Array|null} Cached event data array, or null if not cached
     */
    function cacheGet(year) {
        try {
            var raw = localStorage.getItem(CACHE_PREFIX + year);
            if (!raw) return null;
            var entry = JSON.parse(raw);
            return entry.data || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Stores season data for a given year in the cache.
     * On quota exceeded, clears all seasons cache entries and retries once.
     *
     * @param {number} year
     * @param {Array} data - Event data array from API
     */
    function cacheSet(year, data) {
        var entry = JSON.stringify({
            timestamp: Date.now(),
            data: data
        });

        try {
            localStorage.setItem(CACHE_PREFIX + year, entry);
        } catch (e) {
            // Quota exceeded: clear all seasons cache entries and retry
            if (e.name === "QuotaExceededError" || e.code === 22) {
                clearSeasonsCache();
                try {
                    localStorage.setItem(CACHE_PREFIX + year, entry);
                } catch (e2) {
                    // Silent degradation — caching unavailable
                }
            }
        }
    }

    /**
     * Removes all localStorage entries with the seasons cache prefix.
     */
    function clearSeasonsCache() {
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
     * Fetches season data from the US Navy API for a given year.
     * Always uses tz=0 and dst=false for UTC data.
     *
     * @param {number} year - Year to fetch (1700-2100)
     * @returns {Promise<Array>} Resolves with the data array from the API
     */
    function fetchSeasonData(year) {
        var url = API_BASE
            + "?year=" + year
            + "&tz=0&dst=false"
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
                if (!json.data || !Array.isArray(json.data)) {
                    throw new Error("Unexpected data received from the API.");
                }
                return json.data;
            });
    }

    /**
     * Gets season data for a given year, using cache or API.
     *
     * @param {number} year
     * @returns {Promise<Array>} Resolves with event data array
     */
    function getSeasonDataForYear(year) {
        var cached = cacheGet(year);
        if (cached) {
            return Promise.resolve(cached);
        }

        return fetchSeasonData(year)
            .then(function (data) {
                cacheSet(year, data);
                return data;
            });
    }

    /**
     * Loads season data for the selected date. Fetches the previous year,
     * current year, and next year in parallel, merges and filters to season
     * events, then sorts chronologically.
     *
     * Three years are needed because:
     *   - The previous year provides winter solstice data for dates in
     *     early January (winter started the prior December).
     *   - The next year provides the vernal equinox for dates in late
     *     December (winter's next boundary is in the following March).
     *
     * @param {string} dateStr - YYYY-MM-DD
     * @returns {Promise<Array>} Sorted season boundary events
     */
    function loadSeasonData(dateStr) {
        var year = getYear(dateStr);
        var prevYear = year - 1;
        var nextYear = year + 1;

        return Promise.all([
            getSeasonDataForYear(prevYear),
            getSeasonDataForYear(year),
            getSeasonDataForYear(nextYear)
        ]).then(function (results) {
            // Merge all three years' event arrays
            var allEvents = results[0].concat(results[1]).concat(results[2]);

            // Filter to Equinox/Solstice only, add season and timestamp
            var seasonEvents = filterSeasonEvents(allEvents);

            // Sort chronologically by timestamp
            seasonEvents.sort(function (a, b) {
                return a.timestamp - b.timestamp;
            });

            return seasonEvents;
        });
    }

    // ================================================================== //
    //  Timezone Detection                                                 //
    // ================================================================== //

    /**
     * Auto-detects the user's local timezone offset in hours from UTC.
     * getTimezoneOffset() returns UTC-minus-local in minutes; we negate
     * and convert to hours to get the standard offset format.
     *
     * @returns {number} Hours from UTC (e.g. -5 for US Eastern)
     */
    function detectTimezoneOffset() {
        var offsetMinutes = new Date().getTimezoneOffset();
        return -(offsetMinutes / 60);
    }

    // ================================================================== //
    //  UI Rendering                                                       //
    // ================================================================== //

    /**
     * Main display update function. Validates date, loads data,
     * computes season/progress/tilt, and renders the globe and details.
     */
    function updateDisplay() {
        if (!currentDate) return;

        // Validate year range
        var year = getYear(currentDate);
        if (year < MIN_YEAR || year > MAX_YEAR) {
            renderError("Season data is available for dates between " + MIN_YEAR + " and " + MAX_YEAR + ".");
            if (labelEl) labelEl.textContent = "";
            return;
        }

        // Show loading state
        if (detailsEl) {
            detailsEl.innerHTML = '<p class="seasons-loading">Loading season data\u2026</p>';
        }
        if (labelEl) {
            labelEl.textContent = "";
        }

        loadSeasonData(currentDate)
            .then(function (seasonEvents) {
                if (!seasonEvents || seasonEvents.length < 4) {
                    renderError("Unexpected data received from the API.");
                    return;
                }

                var targetTimestamp = dateToNoonUTC(currentDate);

                // Find the current season bracket
                var bracket = findCurrentSeason(targetTimestamp, seasonEvents);

                if (!bracket) {
                    renderError("Unable to determine season for this date.");
                    return;
                }

                // Compute progress through current season
                var progress = computeProgress(
                    targetTimestamp,
                    bracket.current.timestamp,
                    bracket.next.timestamp
                );

                // Compute tilt angle for the globe
                var tiltAngle = computeTiltAngle(targetTimestamp, seasonEvents);

                // Render the Earth globe with computed tilt
                renderEarth(tiltAngle);

                // Compute hemisphere data
                var seasonName = bracket.current.season;
                var nextSeasonName = bracket.next.season;
                var southSeason = OPPOSITE_SEASON[seasonName];
                var southNextSeason = OPPOSITE_SEASON[nextSeasonName];
                var daysUntilNext = progress.totalDays - progress.elapsedDays;
                var daysStr = daysUntilNext === 1 ? "1 day" : daysUntilNext + " days";

                // Update season label below the globe (dual hemisphere)
                if (labelEl) {
                    var northEmoji = SEASON_EMOJI[seasonName] || "";
                    var southEmoji = SEASON_EMOJI[southSeason] || "";
                    labelEl.innerHTML =
                        '<div class="seasons-label-line">'
                      + '<span class="seasons-label-hemisphere">Northern Hemisphere: </span>'
                      + '<span class="seasons-label-season">' + northEmoji + " " + seasonName + '</span>'
                      + ' <span class="seasons-label-countdown">\u2014 ' + daysStr + " until " + nextSeasonName + '</span>'
                      + '</div>'
                      + '<div class="seasons-label-line">'
                      + '<span class="seasons-label-hemisphere">Southern Hemisphere: </span>'
                      + '<span class="seasons-label-season">' + southEmoji + " " + southSeason + '</span>'
                      + ' <span class="seasons-label-countdown">\u2014 ' + daysStr + " until " + southNextSeason + '</span>'
                      + '</div>';
                }

                // Render the details table
                renderDetails(seasonName, southSeason, nextSeasonName, southNextSeason, progress, bracket.current, bracket.next);
            })
            .catch(function (err) {
                console.error("Seasons error:", err);
                renderError("Unable to fetch season data. Please check your connection and try again.");
            });
    }

    /**
     * Renders the full scene onto the main canvas:
     * sunlight wash, Earth globe, shadow cone, sun sliver, and sun glow.
     *
     * The CelestialSphere renders onto an offscreen canvas (since its
     * render() clears the canvas). The offscreen result is then composited
     * onto the main visible canvas alongside the sun and lighting effects.
     *
     * @param {number} tiltDegrees - Tilt angle in degrees
     */
    function renderEarth(tiltDegrees) {
        currentTilt = tiltDegrees;
        if (!sphere || !mainCtx || !earthCanvas) return;

        // Render Earth sphere onto offscreen canvas
        sphere.setTilt(tiltDegrees);
        sphere.render();

        var ctx = mainCtx;
        var w   = canvasEl.width;
        var h   = canvasEl.height;

        // Sun geometry: 109× Earth radius, positioned so only a sliver
        // of the leftmost arc peeks in from the right edge.
        var sunR    = SUN_SCALE * earthRadius;
        var sliverW = Math.max(6, Math.round(earthRadius * 0.22));
        var sunCX   = w + sunR - sliverW;
        var sunCY   = h / 2;
        var glowR   = sliverW * 4;

        // ── 1. Clear ──────────────────────────────────────────── //
        ctx.clearRect(0, 0, w, h);

        // ── 2. Sunlight wash ──────────────────────────────────── //
        // Subtle yellow gradient from right to left, fading out
        // before the Earth so the lit side of the scene glows warmly.
        var washEnd = Math.max(0, earthCX - earthRadius * 1.5);
        var washGrad = ctx.createLinearGradient(w, 0, washEnd, 0);
        washGrad.addColorStop(0.0, "rgba(231, 226, 71, 0.08)");
        washGrad.addColorStop(0.5, "rgba(231, 226, 71, 0.03)");
        washGrad.addColorStop(1.0, "rgba(231, 226, 71, 0.00)");
        ctx.fillStyle = washGrad;
        ctx.fillRect(0, 0, w, h);

        // ── 3. Earth (composited from offscreen canvas) ───────── //
        ctx.drawImage(
            earthCanvas,
            earthCX - earthCanvas.width  / 2,
            earthCY - earthCanvas.height / 2
        );

        // ── 4. Shadow cone behind Earth ───────────────────────── //
        // Dark region extending from Earth's left silhouette to the
        // left edge, slightly diverging to suggest depth.
        var spread = earthRadius * 1.08;
        ctx.save();
        ctx.beginPath();
        // Trace the left semicircle of the Earth (top → left → bottom)
        ctx.arc(earthCX, earthCY, earthRadius, -Math.PI / 2, Math.PI / 2, true);
        // Extend to left edge of canvas
        ctx.lineTo(0, earthCY + spread);
        ctx.lineTo(0, earthCY - spread);
        ctx.closePath();
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
        ctx.fill();
        ctx.restore();

        // ── 5. Sun sliver (right edge) ────────────────────────── //
        // Draw the sun's massive disc; only its leftmost arc is visible
        // within the canvas bounds.
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.beginPath();
        ctx.arc(sunCX, sunCY, sunR, 0, Math.PI * 2);
        ctx.fillStyle = SUN_COLOR;
        ctx.fill();
        ctx.restore();

        // ── 6. Sun glow ──────────────────────────────────────── //
        // Radial gradient emanating from the visible sun edge
        ctx.save();
        var glowGrad = ctx.createRadialGradient(
            w, sunCY, sliverW * 0.5,
            w, sunCY, glowR
        );
        glowGrad.addColorStop(0.0, "rgba(231, 226, 71, 0.20)");
        glowGrad.addColorStop(0.3, "rgba(231, 226, 71, 0.08)");
        glowGrad.addColorStop(0.7, "rgba(231, 226, 71, 0.02)");
        glowGrad.addColorStop(1.0, "rgba(231, 226, 71, 0.00)");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(w, sunCY, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Renders the season details table into the details container.
     * Shows data for both Northern and Southern hemispheres.
     *
     * @param {string} northSeason - Northern hemisphere season name
     * @param {string} southSeason - Southern hemisphere season name
     * @param {string} northNext - Northern hemisphere next season name
     * @param {string} southNext - Southern hemisphere next season name
     * @param {Object} progress - { elapsedDays, totalDays, percentage }
     * @param {Object} currentEvent - Start event for current season
     * @param {Object} nextEvent - Start event for next season
     */
    function renderDetails(northSeason, southSeason, northNext, southNext, progress, currentEvent, nextEvent) {
        if (!detailsEl) return;

        var progressStr = "Day " + progress.elapsedDays + " of " + progress.totalDays
                        + " (" + progress.percentage + "%)";
        var progressBar = '<div class="seasons-progress-bar">'
                        + '<div class="seasons-progress-fill" style="width: '
                        + progress.percentage + '%;"></div></div>';

        var rows = [
            {
                label: "Northern Season",
                value: northSeason + " \u2014 " + progressStr + progressBar
            },
            {
                label: "Southern Season",
                value: southSeason + " \u2014 " + progressStr + progressBar
            },
            {
                label: "Season Started",
                value: formatEventDate(currentEvent, currentTz, currentDst)
            },
            {
                label: "Next Season",
                value: northNext + " (North) / " + southNext + " (South) \u2014 "
                     + formatEventDate(nextEvent, currentTz, currentDst)
            }
        ];

        var html = "<table>"
            + "<thead><tr><th>Field</th><th>Value</th></tr></thead>"
            + "<tbody>";

        for (var i = 0; i < rows.length; i++) {
            html += "<tr><td>" + rows[i].label + "</td><td>" + rows[i].value + "</td></tr>";
        }

        html += "</tbody></table>";
        detailsEl.innerHTML = html;
    }

    /**
     * Displays an error message in the details container.
     * Uses the site's accent3 (grapefruit) color for error styling.
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
            updateDisplay();
        }
    }

    /**
     * Handles timezone input change events.
     */
    function onTzChange() {
        var val = parseFloat(tzInput.value);
        if (!isNaN(val) && val >= -12 && val <= 14) {
            currentTz = val;
            updateDisplay();
        }
    }

    /**
     * Handles DST checkbox change events.
     */
    function onDstChange() {
        currentDst = dstCheckbox.checked;
        updateDisplay();
    }

    // ================================================================== //
    //  Initialization                                                     //
    // ================================================================== //

    /**
     * Initializes the Earth Seasons tool:
     *   1. Grabs DOM elements by ID
     *   2. Verifies CelestialSphere is loaded
     *   3. Verifies canvas support
     *   4. Sets responsive canvas size (wide 2:1 aspect ratio)
     *   5. Detects timezone and sets default
     *   6. Creates offscreen canvas and CelestialSphere instance
     *   7. Loads Earth texture asynchronously
     *   8. Sets date input to today
     *   9. Wires up event listeners
     *  10. Triggers the initial display update
     */
    function init() {
        // 1. Grab DOM elements
        dateInput    = document.getElementById("seasons-date-input");
        tzInput      = document.getElementById("seasons-tz-input");
        dstCheckbox  = document.getElementById("seasons-dst-checkbox");
        canvasEl     = document.getElementById("seasons-canvas");
        labelEl      = document.getElementById("seasons-label");
        detailsEl    = document.getElementById("seasons-details");

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

        // 4. Set responsive canvas size (2:1 aspect ratio)
        var containerWidth = canvasEl.parentElement.clientWidth;
        var canvasWidth  = Math.min(CANVAS_MAX_W, containerWidth - 32);
        var canvasHeight = Math.round(canvasWidth / CANVAS_ASPECT);
        canvasEl.width  = canvasWidth;
        canvasEl.height = canvasHeight;
        mainCtx = canvasEl.getContext("2d");

        // Compute Earth position and size
        earthRadius = Math.round(canvasHeight * 0.38);
        earthCX     = Math.round(canvasWidth * EARTH_X_FRAC);
        earthCY     = Math.round(canvasHeight / 2);

        // 5. Detect timezone and set default
        currentTz = detectTimezoneOffset();
        if (tzInput) {
            tzInput.value = currentTz;
        }

        // 6. Create offscreen canvas and CelestialSphere instance
        //    The offscreen canvas is sized to fit the Earth sphere with
        //    padding for the edge stroke and extended axis line.
        //    CelestialSphere renders here, then the result is composited
        //    onto the main visible canvas.
        var earthPad = Math.ceil(earthRadius * (AXIS_EXTEND - 1.0) * 2) + 10;
        earthCanvas = document.createElement("canvas");
        earthCanvas.width  = earthRadius * 2 + earthPad;
        earthCanvas.height = earthRadius * 2 + earthPad;

        sphere = new CelestialSphere(earthCanvas, {
            radius:           earthRadius,
            color:            "#4A90D9",    // Ocean blue fallback while image loads
            shadowColor:      "#0a0a1a",    // Deep space black for nightside
            illumination:     0.5,          // Half the Earth is always lit
            waxing:           true,         // Sun on the right side (fixed)
            shading:          true,         // 3D depth shading
            shadingIntensity: 0.20,         // Subtle — let the Earth texture dominate
            edgeColor:        "#1E4D6E",    // Dark ocean blue edge glow
            edgeWidth:        4,            // Match moon tool thickness
            background:       null,         // Transparent (composited onto scene)
            shadowOpacity:    0.75,         // Slightly translucent shadow (show terrain)
            tilt:             0,            // Updated dynamically per selected date
            axisLine:         true,         // Show pole-to-pole axis indicator
            axisLineColor:    "#FFFFFF",    // White axis line
            axisLineWidth:    1.5,          // Thin but visible
            axisLineExtend:   AXIS_EXTEND   // Extend 30% beyond sphere
        });

        // 7. Load Earth texture asynchronously
        //    Once loaded, set it on the sphere and re-render the scene.
        //    The sphere renders with flat color fallback until the image
        //    is ready.
        var earthImg = new Image();
        earthImg.onload = function () {
            sphere.setImage(earthImg);
            renderEarth(currentTilt);
        };
        earthImg.src = "/images/astro/earth.png";

        // 8. Set date input to today
        currentDate = todayString();
        if (dateInput) {
            dateInput.value = currentDate;
        }

        // 9. Wire up event listeners
        if (dateInput) {
            dateInput.addEventListener("change", onDateChange);
        }
        if (tzInput) {
            tzInput.addEventListener("change", onTzChange);
        }
        if (dstCheckbox) {
            dstCheckbox.addEventListener("change", onDstChange);
        }

        // 10. Trigger initial display update
        updateDisplay();
    }

    // Run initialization
    init();
})();
