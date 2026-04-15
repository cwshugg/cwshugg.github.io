// Night Sky Tool — script/tools/nightsky.js
// Celestial navigation dome visualization using the US Naval Observatory API.
// Renders navigational stars, planets, the Sun, and Moon onto an equidistant
// azimuthal projection canvas.
//
// Architecture:
//   - Fetches celestial object positions from the USNO /api/celnav endpoint
//   - Projects altitude/azimuth (hc/zn) onto a circular dome canvas
//   - Caches API responses in localStorage (5-minute TTL)
//   - Supports geolocation auto-detect and manual coordinate entry
//   - Interactive hover/touch hit-testing with tooltip display

(function () {
    "use strict";

    // ================================================================== //
    //  Constants                                                          //
    // ================================================================== //

    var API_BASE = "https://aa.usno.navy.mil/api/celnav";
    var CACHE_PREFIX = "nightsky-";
    var CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL
    var API_ID = "shuggdev";           // Optional 8-char tracking ID

    // Planet and solar-system object colors
    var PLANET_COLORS = {
        "Sun":     "#E7E247",
        "Moon":    "#C8C8C8",
        "Venus":   "#FFFDE8",
        "Mars":    "#E07050",
        "Jupiter": "#D4A76A",
        "Saturn":  "#DAC47A"
    };

    // Rendering sizes (radius as fraction of dome radius R)
    var SUN_RADIUS_FRAC     = 0.018;
    var MOON_RADIUS_FRAC    = 0.015;
    var PLANET_RADIUS_FRAC  = 0.012;
    var BRIGHT_STAR_FRAC    = 0.007; // 1st-magnitude (ALL CAPS name)
    var DIM_STAR_FRAC       = 0.005; // 2nd-magnitude (mixed case)

    // Colors
    var STAR_COLOR_BRIGHT = "#FFFFFF";
    var STAR_COLOR_DIM    = "#A0A8B8";
    var GRID_COLOR        = "rgba(107, 113, 126, 0.3)";
    var HORIZON_COLOR     = "rgba(136, 204, 241, 0.5)";
    var CARDINAL_COLOR    = "#88CCF1";
    var ZENITH_COLOR      = "#E7E247";

    // Hit-test tolerance for hover (pixels)
    var HIT_RADIUS = 18;

    // Canvas sizing constraints (CSS pixels)
    var MAX_CANVAS_SIZE = 2000;
    var MIN_CANVAS_SIZE = 280;
    var CANVAS_PADDING  = 32;

    // Debounce delay for control inputs (ms)
    var DEBOUNCE_MS = 300;

    // ================================================================== //
    //  DOM References                                                     //
    // ================================================================== //

    var dateInput;    // <input type="date">
    var timeInput;    // <input type="time">
    var latInput;     // <input type="number"> latitude
    var lonInput;     // <input type="number"> longitude
    var nowBtn;       // "Now" button
    var locateBtn;    // "Locate" button
    var canvasEl;     // <canvas> for sky dome
    var ctx;          // Canvas 2D rendering context
    var tooltipEl;    // Tooltip overlay div
    var statusLabel;  // Status/message label below canvas
    var detailsEl;    // Details panel container
    var utcCheckbox;  // UTC mode toggle checkbox
    var tzLabel;      // Timezone abbreviation label span

    // ================================================================== //
    //  State                                                              //
    // ================================================================== //

    var celestialObjects = []; // Parsed/classified objects for rendering
    var hoverIndex = -1;       // Index of hovered object (-1 = none)
    var debounceTimer = null;  // Debounce timer for control changes
    var apiResponse = null;    // Full API response (for moon_phase, etc.)
    var canvasSize = MAX_CANVAS_SIZE; // Current canvas size (CSS pixels)
    var domeRadius = 0;        // Dome radius in CSS pixels
    var domeCenterX = 0;       // Dome center X in CSS pixels
    var domeCenterY = 0;       // Dome center Y in CSS pixels
    var useUTC = false;        // Whether time picker is in UTC mode

    // ================================================================== //
    //  Date/Time Utilities                                                //
    // ================================================================== //

    /**
     * Returns the current UTC date as a YYYY-MM-DD string.
     */
    function nowUTCDate() {
        var d = new Date();
        var y = d.getUTCFullYear();
        var m = String(d.getUTCMonth() + 1).padStart(2, "0");
        var day = String(d.getUTCDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
    }

    /**
     * Returns the current UTC time as an HH:MM string.
     */
    function nowUTCTime() {
        var d = new Date();
        var h = String(d.getUTCHours()).padStart(2, "0");
        var m = String(d.getUTCMinutes()).padStart(2, "0");
        return h + ":" + m;
    }

    /**
     * Returns the current local date as a YYYY-MM-DD string.
     */
    function nowLocalDate() {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, "0");
        var day = String(d.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
    }

    /**
     * Returns the current local time as an HH:MM string.
     */
    function nowLocalTime() {
        var d = new Date();
        var h = String(d.getHours()).padStart(2, "0");
        var m = String(d.getMinutes()).padStart(2, "0");
        return h + ":" + m;
    }

    // ================================================================== //
    //  Timezone Utilities                                                  //
    // ================================================================== //

    /**
     * Returns a short timezone abbreviation for the user's local timezone
     * (e.g., "EST", "PDT"). Falls back to a UTC offset string.
     *
     * @returns {string}
     */
    function getTzAbbreviation() {
        try {
            return new Date().toLocaleTimeString("en-US", {
                timeZoneName: "short"
            }).split(" ").pop();
        } catch (e) {
            var offset = new Date().getTimezoneOffset();
            var sign = offset <= 0 ? "+" : "-";
            var absHours = Math.floor(Math.abs(offset) / 60);
            return "UTC" + sign + absHours;
        }
    }

    /**
     * Converts a local date/time pair to UTC.
     * Handles date rollover across midnight correctly.
     *
     * @param {string} dateStr - YYYY-MM-DD in local time
     * @param {string} timeStr - HH:MM in local time
     * @returns {{ date: string, time: string }}
     */
    function localToUTC(dateStr, timeStr) {
        var parts = dateStr.split("-");
        var timeParts = timeStr.split(":");
        var d = new Date(
            parseInt(parts[0], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[2], 10),
            parseInt(timeParts[0], 10),
            parseInt(timeParts[1], 10)
        );
        return {
            date: d.getUTCFullYear() + "-" +
                  String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
                  String(d.getUTCDate()).padStart(2, "0"),
            time: String(d.getUTCHours()).padStart(2, "0") + ":" +
                  String(d.getUTCMinutes()).padStart(2, "0")
        };
    }

    /**
     * Converts a UTC date/time pair to local time.
     * Handles date rollover across midnight correctly.
     *
     * @param {string} dateStr - YYYY-MM-DD in UTC
     * @param {string} timeStr - HH:MM in UTC
     * @returns {{ date: string, time: string }}
     */
    function utcToLocal(dateStr, timeStr) {
        var parts = dateStr.split("-");
        var timeParts = timeStr.split(":");
        var d = new Date(Date.UTC(
            parseInt(parts[0], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[2], 10),
            parseInt(timeParts[0], 10),
            parseInt(timeParts[1], 10)
        ));
        return {
            date: d.getFullYear() + "-" +
                  String(d.getMonth() + 1).padStart(2, "0") + "-" +
                  String(d.getDate()).padStart(2, "0"),
            time: String(d.getHours()).padStart(2, "0") + ":" +
                  String(d.getMinutes()).padStart(2, "0")
        };
    }

    /**
     * Updates the timezone label to show the current mode abbreviation.
     */
    function updateTimezoneLabel() {
        if (!tzLabel) return;
        tzLabel.textContent = useUTC ? "UTC:" : getTzAbbreviation() + ":";
    }

    /**
     * Formats a degree value for display (e.g., "45.2°").
     *
     * @param {number} deg - Degrees
     * @param {number} [decimals=1] - Decimal places
     * @returns {string}
     */
    function formatDeg(deg, decimals) {
        if (typeof decimals === "undefined") decimals = 1;
        return deg.toFixed(decimals) + "\u00B0";
    }

    // ================================================================== //
    //  HTML Escaping                                                      //
    // ================================================================== //

    /**
     * Escapes HTML special characters to prevent injection.
     *
     * @param {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ================================================================== //
    //  Cache Layer                                                        //
    // ================================================================== //
    //  Uses localStorage to cache API responses. All access is wrapped in
    //  try/catch for resilience (private browsing, quota exceeded, etc.).

    /**
     * Builds a cache key from request parameters.
     * Lat/lon rounded to 2 decimal places for bucketing.
     *
     * @param {string} date
     * @param {string} time
     * @param {number} lat
     * @param {number} lon
     * @returns {string}
     */
    function cacheKey(date, time, lat, lon) {
        return date + "-" + time + "-" +
               lat.toFixed(2) + "-" + lon.toFixed(2);
    }

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
     * On quota exceeded, clears all nightsky cache entries and retries once.
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
            if (e.name === "QuotaExceededError" || e.code === 22) {
                clearNightSkyCache();
                try {
                    localStorage.setItem(CACHE_PREFIX + key, entry);
                } catch (e2) {
                    // Silent degradation — caching unavailable
                }
            }
        }
    }

    /**
     * Removes all localStorage entries with the nightsky cache prefix.
     */
    function clearNightSkyCache() {
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
     * Builds the full API URL from parameters.
     *
     * @param {string} date - YYYY-MM-DD
     * @param {string} time - HH:MM
     * @param {number} lat  - Decimal degrees
     * @param {number} lon  - Decimal degrees
     * @returns {string}
     */
    function buildApiUrl(date, time, lat, lon) {
        return API_BASE
            + "?date=" + encodeURIComponent(date)
            + "&time=" + encodeURIComponent(time)
            + "&coords=" + lat.toFixed(4) + "," + lon.toFixed(4)
            + "&ID=" + API_ID;
    }

    /**
     * Fetches celestial navigation data from the USNO API.
     * Returns a Promise that resolves with the parsed JSON response.
     *
     * @param {string} date
     * @param {string} time
     * @param {number} lat
     * @param {number} lon
     * @returns {Promise<Object>}
     */
    function fetchCelNavData(date, time, lat, lon) {
        return fetch(buildApiUrl(date, time, lat, lon))
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
                if (!json.properties || !json.properties.data) {
                    throw new Error("Unexpected API response structure.");
                }
                return json;
            });
    }

    /**
     * Gets celestial navigation data, checking cache first then fetching.
     *
     * @param {string} date
     * @param {string} time
     * @param {number} lat
     * @param {number} lon
     * @returns {Promise<Object>}
     */
    function getCelNavData(date, time, lat, lon) {
        var key = cacheKey(date, time, lat, lon);
        var cached = cacheGet(key);
        if (cached) {
            return Promise.resolve(cached);
        }
        return fetchCelNavData(date, time, lat, lon)
            .then(function (json) {
                cacheSet(key, json);
                return json;
            });
    }

    // ================================================================== //
    //  Data Processing                                                    //
    // ================================================================== //

    /**
     * Classifies a celestial object from the API response for rendering.
     * Returns null if the object should be skipped (ARIES, below horizon).
     *
     * @param {Object} raw - Raw object from API data array
     * @returns {Object|null} Classified object with rendering metadata
     */
    function classifyObject(raw) {
        var name = raw.object;
        var ad = raw.almanac_data || {};
        var hc = parseFloat(ad.hc);
        var zn = parseFloat(ad.zn);

        // ARIES is a reference point — skip (no hc/zn)
        if (name === "ARIES") return null;

        // Objects below horizon or with missing data — skip
        if (isNaN(hc) || isNaN(zn) || hc <= 0) return null;

        var type, color, radiusFrac, glow;

        if (name === "Sun") {
            type = "sun";
            color = PLANET_COLORS.Sun;
            radiusFrac = SUN_RADIUS_FRAC;
            glow = true;
        } else if (name === "Moon") {
            type = "moon";
            color = PLANET_COLORS.Moon;
            radiusFrac = MOON_RADIUS_FRAC;
            glow = false;
        } else if (PLANET_COLORS[name]) {
            type = "planet";
            color = PLANET_COLORS[name];
            radiusFrac = PLANET_RADIUS_FRAC;
            glow = true;
        } else {
            // Navigation star
            type = "star";
            var isBright = (name === name.toUpperCase() && name.length > 1);
            if (name === "POLARIS") isBright = true;
            color = isBright ? STAR_COLOR_BRIGHT : STAR_COLOR_DIM;
            radiusFrac = isBright ? BRIGHT_STAR_FRAC : DIM_STAR_FRAC;
            glow = isBright;
        }

        return {
            name: name,
            type: type,
            hc: hc,
            zn: zn,
            radiusFrac: radiusFrac,
            color: color,
            glow: glow,
            rawData: raw
        };
    }

    /**
     * Parses the full API response into an array of classified objects.
     *
     * @param {Object} json - Full API response
     * @returns {Array} Array of classified objects
     */
    function parseObjects(json) {
        var data = json.properties.data;
        var result = [];
        for (var i = 0; i < data.length; i++) {
            var obj = classifyObject(data[i]);
            if (obj) {
                result.push(obj);
            }
        }
        return result;
    }

    /**
     * Converts ALL CAPS star names to title case for display.
     * Mixed-case names (2nd-magnitude stars) are returned as-is.
     *
     * @param {string} name
     * @returns {string}
     */
    function formatName(name) {
        if (name !== name.toUpperCase()) return name;
        return name.charAt(0).toUpperCase() +
            name.slice(1).toLowerCase().replace(/\s\w/g, function (m) {
                return m.toUpperCase();
            });
    }

    /**
     * Returns a readable type label for an object type string.
     *
     * @param {string} type
     * @returns {string}
     */
    function typeLabel(type) {
        if (type === "sun") return "Sun";
        if (type === "moon") return "Moon";
        if (type === "planet") return "Planet";
        return "Star";
    }

    // ================================================================== //
    //  Projection                                                         //
    // ================================================================== //

    /**
     * Projects a celestial object's altitude (hc) and azimuth (zn)
     * onto canvas pixel coordinates using equidistant azimuthal projection.
     *
     * - Center = zenith (hc=90), Edge = horizon (hc=0)
     * - North at top, East at right (looking UP at sky)
     *
     * @param {number} hc - Computed altitude in degrees (0=horizon, 90=zenith)
     * @param {number} zn - Azimuth in degrees (0=north, clockwise)
     * @param {number} cx - Dome center X (CSS pixels)
     * @param {number} cy - Dome center Y (CSS pixels)
     * @param {number} R  - Dome radius (CSS pixels)
     * @returns {{ x: number, y: number }}
     */
    function projectToCanvas(hc, zn, cx, cy, R) {
        // Radial distance: zenith = center (0), horizon = edge (R)
        var r = R * (90 - hc) / 90;

        // Convert azimuth to radians
        // x = r*sin(zn), y = -r*cos(zn) puts North at top
        var theta = zn * Math.PI / 180;
        var x = cx + r * Math.sin(theta);
        var y = cy - r * Math.cos(theta);

        return { x: x, y: y };
    }

    // ================================================================== //
    //  Canvas Rendering                                                   //
    // ================================================================== //

    /**
     * Layer 1: Sky background — dark radial gradient.
     * Darker at center (zenith/deep space), slightly lighter at edge (horizon).
     */
    function renderSky() {
        var grad = ctx.createRadialGradient(
            domeCenterX, domeCenterY, 0,
            domeCenterX, domeCenterY, domeRadius
        );
        grad.addColorStop(0, "#0a0a1a");
        grad.addColorStop(1, "#1a1a2e");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(domeCenterX, domeCenterY, domeRadius, 0, 2 * Math.PI);
        ctx.fill();
    }

    /**
     * Layer 2: Grid overlay — altitude rings, azimuth lines, cardinal labels.
     */
    function renderGrid() {
        // Altitude rings at 15° intervals
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;

        var altitudes = [15, 30, 45, 60, 75];
        for (var i = 0; i < altitudes.length; i++) {
            var r = domeRadius * (90 - altitudes[i]) / 90;
            ctx.beginPath();
            ctx.arc(domeCenterX, domeCenterY, r, 0, 2 * Math.PI);
            ctx.stroke();
        }

        // Horizon ring (hc=0) — thicker, in horizon color
        ctx.strokeStyle = HORIZON_COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(domeCenterX, domeCenterY, domeRadius, 0, 2 * Math.PI);
        ctx.stroke();

        // Azimuth lines at 45° intervals
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        for (var az = 0; az < 360; az += 45) {
            var theta = az * Math.PI / 180;
            var x1 = domeCenterX;
            var y1 = domeCenterY;
            var x2 = domeCenterX + domeRadius * Math.sin(theta);
            var y2 = domeCenterY - domeRadius * Math.cos(theta);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // Zenith marker — small dot at center
        ctx.fillStyle = ZENITH_COLOR;
        ctx.beginPath();
        ctx.arc(domeCenterX, domeCenterY, 2, 0, 2 * Math.PI);
        ctx.fill();

        // Cardinal labels just outside the horizon circle
        var labelOffset = domeRadius + 16;
        var fontSize = Math.max(11, Math.min(14, canvasSize * 0.024));
        ctx.font = fontSize + "px Audiowide, sans-serif";
        ctx.fillStyle = CARDINAL_COLOR;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        var cardinals = [
            { label: "N", az: 0 },
            { label: "E", az: 90 },
            { label: "S", az: 180 },
            { label: "W", az: 270 }
        ];

        for (var c = 0; c < cardinals.length; c++) {
            var cTheta = cardinals[c].az * Math.PI / 180;
            var cx = domeCenterX + labelOffset * Math.sin(cTheta);
            var cy = domeCenterY - labelOffset * Math.cos(cTheta);
            ctx.fillText(cardinals[c].label, cx, cy);
        }
    }

    /**
     * Layer 3: Celestial objects — draw each object as a colored dot/circle.
     */
    function renderObjects() {
        for (var i = 0; i < celestialObjects.length; i++) {
            var obj = celestialObjects[i];
            var pos = projectToCanvas(
                obj.hc, obj.zn, domeCenterX, domeCenterY, domeRadius
            );
            var radius = obj.radiusFrac * domeRadius;

            // Optional glow effect for bright objects
            if (obj.glow) {
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius * 2.5, 0, 2 * Math.PI);
                var grad = ctx.createRadialGradient(
                    pos.x, pos.y, radius * 0.5,
                    pos.x, pos.y, radius * 2.5
                );
                grad.addColorStop(0, obj.color);
                grad.addColorStop(1, "transparent");
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.restore();
            }

            // Draw filled circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = obj.color;
            ctx.fill();

            // Store projected position for hit-testing
            obj._px = pos.x;
            obj._py = pos.y;
            obj._pr = radius;
        }
    }

    /**
     * Layer 4: Object labels — name text near each object.
     * On small canvases (< 400px), only show labels for planets and
     * 1st-magnitude stars to reduce visual clutter.
     */
    function renderLabels() {
        var isSmall = canvasSize < 400;
        var fontSize = Math.max(9, Math.min(11, canvasSize * 0.018));
        ctx.font = fontSize + "px Jost, sans-serif";
        ctx.fillStyle = "rgba(223, 224, 226, 0.75)";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";

        for (var i = 0; i < celestialObjects.length; i++) {
            var obj = celestialObjects[i];

            // On small canvases, hide labels for dim (2nd-magnitude) stars
            if (isSmall && obj.type === "star" &&
                obj.color === STAR_COLOR_DIM) {
                continue;
            }

            var pos = { x: obj._px, y: obj._py };
            var labelX = pos.x + obj._pr + 4;
            var labelY = pos.y - 2;

            ctx.fillText(formatName(obj.name), labelX, labelY);
        }
    }

    /**
     * Layer 5: Hover highlight — ring around the hovered object.
     */
    function renderHoverHighlight() {
        if (hoverIndex < 0 || hoverIndex >= celestialObjects.length) return;

        var obj = celestialObjects[hoverIndex];
        var highlightRadius = obj._pr + 4;

        ctx.strokeStyle = CARDINAL_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(obj._px, obj._py, highlightRadius, 0, 2 * Math.PI);
        ctx.stroke();
    }

    /**
     * Orchestrator: clears the canvas and renders all 5 layers in order.
     */
    function render() {
        // Clear entire canvas
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        renderSky();
        renderGrid();
        renderObjects();
        renderLabels();
        renderHoverHighlight();
    }

    // ================================================================== //
    //  Canvas Sizing & HiDPI                                              //
    // ================================================================== //

    /**
     * Computes the responsive canvas size based on parent container width.
     * Square canvas, clamped between MIN_CANVAS_SIZE and MAX_CANVAS_SIZE.
     *
     * @returns {number} Canvas size in CSS pixels
     */
    function computeCanvasSize() {
        var containerWidth = canvasEl.parentElement.clientWidth;
        var size = Math.min(MAX_CANVAS_SIZE,
            Math.max(MIN_CANVAS_SIZE, containerWidth - CANVAS_PADDING));
        return size;
    }

    /**
     * Sets up the canvas size and HiDPI scaling.
     * Updates canvasSize, domeRadius, domeCenterX, domeCenterY.
     */
    function setupCanvas() {
        canvasSize = computeCanvasSize();
        var dpr = window.devicePixelRatio || 1;

        canvasEl.width = canvasSize * dpr;
        canvasEl.height = canvasSize * dpr;
        canvasEl.style.width = canvasSize + "px";
        canvasEl.style.height = canvasSize + "px";

        ctx = canvasEl.getContext("2d");
        ctx.scale(dpr, dpr);

        // Dome fills most of the canvas, with margin for cardinal labels
        var labelMargin = 24;
        domeRadius = (canvasSize / 2) - labelMargin;
        domeCenterX = canvasSize / 2;
        domeCenterY = canvasSize / 2;
    }

    // ================================================================== //
    //  Geolocation                                                        //
    // ================================================================== //

    /**
     * Attempts to detect the user's location via the Geolocation API.
     * On success, populates lat/lon inputs and triggers an update.
     * On failure, shows a user-friendly message.
     */
    function detectLocation() {
        if (!navigator.geolocation) {
            // No Geolocation API — try IP-based fallback before giving up
            showStatus("Detecting location\u2026");
            if (locateBtn) {
                locateBtn.disabled = true;
                locateBtn.textContent = "Locating\u2026";
            }
            tryIpGeolocation(function (success) {
                if (!success) {
                    showStatus(
                        "Geolocation is not supported by your browser. " +
                        "Enter coordinates manually."
                    );
                }
                if (locateBtn) {
                    locateBtn.disabled = false;
                    locateBtn.textContent = "Locate";
                }
            });
            return;
        }

        showStatus("Detecting location\u2026");

        // Disable Locate button while detecting
        if (locateBtn) {
            locateBtn.disabled = true;
            locateBtn.textContent = "Locating\u2026";
        }

        navigator.geolocation.getCurrentPosition(
            function (position) {
                var lat = position.coords.latitude;
                var lon = position.coords.longitude;
                latInput.value = lat.toFixed(4);
                lonInput.value = lon.toFixed(4);
                showStatus(
                    "Location detected: " +
                    lat.toFixed(2) + "\u00B0, " +
                    lon.toFixed(2) + "\u00B0"
                );

                // Restore Locate button
                if (locateBtn) {
                    locateBtn.disabled = false;
                    locateBtn.textContent = "Locate";
                }

                // Fire update immediately (bypass debounce for geolocation)
                clearTimeout(debounceTimer);
                updateDisplay();
            },
            function (error) {
                var msg = "Location detection failed. " +
                          "Enter coordinates manually.";
                if (error.code === 1) {
                    msg = "Location access denied. " +
                          "Enter coordinates manually.";
                } else if (error.code === 2) {
                    msg = "Location unavailable. " +
                          "Enter coordinates manually.";
                } else if (error.code === 3) {
                    msg = "Location request timed out. " +
                          "Enter coordinates manually.";
                }

                // Try IP-based geolocation as a fallback
                tryIpGeolocation(function (success) {
                    if (!success) {
                        showStatus(msg);
                    }
                    // Restore Locate button
                    if (locateBtn) {
                        locateBtn.disabled = false;
                        locateBtn.textContent = "Locate";
                    }
                });
            },
            { timeout: 10000, maximumAge: 300000, enableHighAccuracy: false }
        );
    }

    /**
     * Attempts IP-based geolocation via ipapi.co as a fallback when the
     * browser Geolocation API is unavailable or fails.
     *
     * Accuracy is city-level (~10-50 km), which is sufficient for night-sky
     * viewing.  If the service is unreachable or returns unusable data the
     * callback receives `false` so the caller can show an appropriate error.
     *
     * @param {function(boolean)} callback – called with `true` on success,
     *        `false` on failure.
     */
    function tryIpGeolocation(callback) {
        fetch("https://ipapi.co/json/")
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("IP geolocation failed");
                }
                return response.json();
            })
            .then(function (data) {
                if (data.latitude && data.longitude) {
                    latInput.value = Number(data.latitude).toFixed(4);
                    lonInput.value = Number(data.longitude).toFixed(4);
                    showStatus(
                        "Approximate location (IP-based): " +
                        Number(data.latitude).toFixed(2) + "\u00B0, " +
                        Number(data.longitude).toFixed(2) + "\u00B0"
                    );

                    // Fire update immediately (bypass debounce)
                    clearTimeout(debounceTimer);
                    updateDisplay();
                    callback(true);
                } else {
                    callback(false);
                }
            })
            .catch(function () {
                callback(false);
            });
    }

    // ================================================================== //
    //  Coordinate Validation                                              //
    // ================================================================== //

    /**
     * Validates that lat/lon inputs are valid numbers within range.
     *
     * @returns {{ valid: boolean, lat: number, lon: number, msg: string }}
     */
    function validateCoords() {
        var latVal = latInput.value.trim();
        var lonVal = lonInput.value.trim();

        if (latVal === "" || lonVal === "") {
            return {
                valid: false,
                lat: 0,
                lon: 0,
                msg: "Please enter both latitude and longitude."
            };
        }

        var lat = parseFloat(latVal);
        var lon = parseFloat(lonVal);

        if (isNaN(lat) || isNaN(lon)) {
            return {
                valid: false,
                lat: 0,
                lon: 0,
                msg: "Please enter valid numeric coordinates."
            };
        }

        if (lat < -90 || lat > 90) {
            return {
                valid: false,
                lat: lat,
                lon: lon,
                msg: "Latitude must be between -90 and 90."
            };
        }

        if (lon < -180 || lon > 180) {
            return {
                valid: false,
                lat: lat,
                lon: lon,
                msg: "Longitude must be between -180 and 180."
            };
        }

        return { valid: true, lat: lat, lon: lon, msg: "" };
    }

    // ================================================================== //
    //  Interaction — Hit-Testing, Tooltip, Cursor                         //
    // ================================================================== //

    /**
     * Finds the celestial object closest to the given canvas coordinates.
     * Returns the index into celestialObjects[], or -1 if none within range.
     *
     * @param {number} mx - Mouse X in CSS pixels relative to canvas
     * @param {number} my - Mouse Y in CSS pixels relative to canvas
     * @returns {number}
     */
    function hitTest(mx, my) {
        var closest = -1;
        var closestDist = HIT_RADIUS;

        for (var i = 0; i < celestialObjects.length; i++) {
            var obj = celestialObjects[i];
            var dx = mx - obj._px;
            var dy = my - obj._py;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < closestDist) {
                closestDist = dist;
                closest = i;
            }
        }
        return closest;
    }

    /**
     * Handles mousemove on the canvas for hover hit-testing.
     */
    function onCanvasMouseMove(e) {
        var rect = canvasEl.getBoundingClientRect();
        // Scale from client coordinates to CSS-pixel coordinates
        var scaleX = canvasSize / rect.width;
        var scaleY = canvasSize / rect.height;
        var mx = (e.clientX - rect.left) * scaleX;
        var my = (e.clientY - rect.top) * scaleY;
        var idx = hitTest(mx, my);

        if (idx !== hoverIndex) {
            hoverIndex = idx;
            render();
        }

        if (idx >= 0) {
            updateTooltip(idx, e.clientX, e.clientY);
            canvasEl.style.cursor = "crosshair";
        } else {
            hideTooltip();
            canvasEl.style.cursor = "default";
        }
    }

    /**
     * Handles mouseleave on the canvas — clears hover state.
     */
    function onCanvasMouseLeave() {
        if (hoverIndex >= 0) {
            hoverIndex = -1;
            render();
            hideTooltip();
        }
        canvasEl.style.cursor = "default";
    }

    /**
     * Handles touchstart on the canvas for mobile hit-testing.
     */
    function onCanvasTouchStart(e) {
        e.preventDefault();
        var touch = e.touches[0];
        var rect = canvasEl.getBoundingClientRect();
        var scaleX = canvasSize / rect.width;
        var scaleY = canvasSize / rect.height;
        var mx = (touch.clientX - rect.left) * scaleX;
        var my = (touch.clientY - rect.top) * scaleY;
        var idx = hitTest(mx, my);

        hoverIndex = idx;
        render();

        if (idx >= 0) {
            updateTooltip(idx, touch.clientX, touch.clientY);
        } else {
            hideTooltip();
        }
    }

    /**
     * Shows the tooltip with object information near the cursor position.
     *
     * @param {number} idx    - Index into celestialObjects[]
     * @param {number} pageX  - Client X coordinate
     * @param {number} pageY  - Client Y coordinate
     */
    function updateTooltip(idx, pageX, pageY) {
        if (idx < 0) {
            hideTooltip();
            return;
        }

        var obj = celestialObjects[idx];
        tooltipEl.innerHTML =
            "<strong>" + escapeHtml(formatName(obj.name)) + "</strong><br>" +
            "Altitude: " + formatDeg(obj.hc) + "<br>" +
            "Azimuth: " + formatDeg(obj.zn) + "<br>" +
            "Type: " + typeLabel(obj.type);
        tooltipEl.style.display = "block";

        // Position near cursor, within the canvas wrapper
        var rect = canvasEl.parentElement.getBoundingClientRect();
        var left = pageX - rect.left + 12;
        var top = pageY - rect.top - 40;

        // Clamp tooltip within container bounds
        var ttWidth = tooltipEl.offsetWidth || 120;
        var ttHeight = tooltipEl.offsetHeight || 60;
        if (left + ttWidth > rect.width) {
            left = pageX - rect.left - ttWidth - 12;
        }
        if (top < 0) {
            top = pageY - rect.top + 12;
        }
        if (top + ttHeight > rect.height) {
            top = rect.height - ttHeight - 4;
        }

        tooltipEl.style.left = left + "px";
        tooltipEl.style.top = top + "px";
    }

    /**
     * Hides the tooltip.
     */
    function hideTooltip() {
        tooltipEl.style.display = "none";
    }

    // ================================================================== //
    //  UI Rendering — Status, Details Panel, Error                        //
    // ================================================================== //

    /**
     * Shows a message in the status label below the canvas.
     *
     * @param {string} message
     */
    function showStatus(message) {
        if (statusLabel) {
            statusLabel.textContent = message;
        }
    }

    /**
     * Shows a loading indicator in the details panel.
     */
    function showLoading() {
        if (detailsEl) {
            detailsEl.innerHTML =
                '<p class="nightsky-loading">Loading sky data\u2026</p>';
        }
    }

    /**
     * Displays an error message in the details panel and clears the canvas.
     *
     * @param {string} message
     */
    function renderError(message) {
        // Clear the canvas and re-draw empty dome
        celestialObjects = [];
        render();

        if (detailsEl) {
            detailsEl.innerHTML =
                '<p class="nightsky-error">' +
                escapeHtml(message) + "</p>";
        }
    }

    /**
     * Updates the details panel with object summary and table.
     *
     * @param {Object} json - Full API response
     * @param {Array} objects - Classified celestial objects
     */
    function updateDetailsPanel(json, objects) {
        if (!detailsEl) return;

        var html = "";

        // Moon info section (if moon_phase is available)
        var moonPhase = json.properties.moon_phase;
        var moonIllum = json.properties.moon_illum;
        if (moonPhase && moonPhase !== "") {
            html += '<div class="nightsky-moon-info">';
            html += "<p><strong>Moon:</strong> " +
                    escapeHtml(moonPhase);
            if (moonIllum !== "" && typeof moonIllum !== "undefined") {
                html += ", " + moonIllum + "% illuminated";
            }
            html += "</p></div>";
        }

        // Object count
        html += "<p>" + objects.length +
                " object" + (objects.length !== 1 ? "s" : "") +
                " visible above the horizon</p>";

        // Object table — sort: planets/sun/moon first, then stars by altitude
        var sorted = objects.slice().sort(function (a, b) {
            var typeOrder = { sun: 0, moon: 1, planet: 2, star: 3 };
            var ta = typeOrder[a.type] || 3;
            var tb = typeOrder[b.type] || 3;
            if (ta !== tb) return ta - tb;
            return b.hc - a.hc; // Higher altitude first within same type
        });

        html += '<table class="nightsky-details-table">';
        html += "<thead><tr>" +
                "<th>Object</th>" +
                "<th>Type</th>" +
                "<th>Altitude</th>" +
                "<th>Azimuth</th>" +
                "</tr></thead>";
        html += "<tbody>";

        for (var i = 0; i < sorted.length; i++) {
            var obj = sorted[i];
            html += "<tr>" +
                    "<td>" + escapeHtml(formatName(obj.name)) + "</td>" +
                    "<td>" + typeLabel(obj.type) + "</td>" +
                    "<td>" + formatDeg(obj.hc) + "</td>" +
                    "<td>" + formatDeg(obj.zn) + "</td>" +
                    "</tr>";
        }

        html += "</tbody></table>";
        detailsEl.innerHTML = html;
    }

    // ================================================================== //
    //  Control Handlers                                                   //
    // ================================================================== //

    /**
     * Debounced trigger for updating the display after a control change.
     */
    function triggerUpdate() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
            updateDisplay();
        }, DEBOUNCE_MS);
    }

    /**
     * Main update function — validates inputs, fetches data, renders.
     */
    function updateDisplay() {
        var coords = validateCoords();
        if (!coords.valid) {
            showStatus(coords.msg);
            return;
        }

        var date = dateInput.value;
        var time = timeInput.value;

        if (!date) {
            showStatus("Please select a date.");
            return;
        }
        if (!time) {
            showStatus("Please select a time.");
            return;
        }

        // Convert to UTC for the API if displaying local time
        var apiDate = date;
        var apiTime = time;
        if (!useUTC) {
            var utcDT = localToUTC(date, time);
            apiDate = utcDT.date;
            apiTime = utcDT.time;
        }

        showLoading();
        showStatus("");

        getCelNavData(apiDate, apiTime, coords.lat, coords.lon)
            .then(function (json) {
                apiResponse = json;
                celestialObjects = parseObjects(json);
                hoverIndex = -1;
                render();
                updateDetailsPanel(json, celestialObjects);
            })
            .catch(function (err) {
                var msg = "Network error \u2014 check your connection and try again.";
                if (err && err.message) {
                    msg = err.message;
                }
                renderError(msg);
            });
    }

    /**
     * "Now" button handler — sets date and time to current moment.
     * Uses local time or UTC depending on the current mode.
     */
    function onNow() {
        if (useUTC) {
            dateInput.value = nowUTCDate();
            timeInput.value = nowUTCTime();
        } else {
            dateInput.value = nowLocalDate();
            timeInput.value = nowLocalTime();
        }
        triggerUpdate();
    }

    /**
     * "Locate" button handler — triggers geolocation detection.
     */
    function onLocate() {
        detectLocation();
    }

    /**
     * Handler for date/time input changes (immediate trigger).
     */
    function onDateTimeChange() {
        triggerUpdate();
    }

    /**
     * Handler for coordinate input changes (debounced).
     */
    function onCoordInput() {
        triggerUpdate();
    }

    /**
     * Handler for UTC toggle checkbox.
     * Converts the displayed time between local and UTC so the actual
     * moment in time stays the same.
     */
    function onUTCToggle() {
        var date = dateInput.value;
        var time = timeInput.value;
        var wasUTC = useUTC;
        useUTC = utcCheckbox.checked;

        // Convert displayed time to keep the same moment
        if (date && time) {
            var converted;
            if (wasUTC && !useUTC) {
                // UTC → local
                converted = utcToLocal(date, time);
            } else if (!wasUTC && useUTC) {
                // local → UTC
                converted = localToUTC(date, time);
            }
            if (converted) {
                dateInput.value = converted.date;
                timeInput.value = converted.time;
            }
        }

        updateTimezoneLabel();
        // No triggerUpdate — same moment in time, just different display
    }

    // ================================================================== //
    //  Window Resize Handler                                              //
    // ================================================================== //

    /**
     * Handles window resize — recomputes canvas size and re-renders.
     */
    var resizeTimer = null;
    function onWindowResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            setupCanvas();
            render();
        }, 150);
    }

    // ================================================================== //
    //  Initialization                                                     //
    // ================================================================== //

    /**
     * Initializes the Night Sky tool.
     * Grabs DOM elements, sets up canvas, wires event listeners, and
     * performs initial geolocation detection.
     */
    function init() {
        // Grab DOM elements
        dateInput   = document.getElementById("nightsky-date-input");
        timeInput   = document.getElementById("nightsky-time-input");
        latInput    = document.getElementById("nightsky-lat-input");
        lonInput    = document.getElementById("nightsky-lon-input");
        nowBtn      = document.getElementById("nightsky-now-btn");
        locateBtn   = document.getElementById("nightsky-locate-btn");
        canvasEl    = document.getElementById("nightsky-canvas");
        tooltipEl   = document.getElementById("nightsky-tooltip");
        statusLabel = document.getElementById("nightsky-status-label");
        detailsEl   = document.getElementById("nightsky-details");
        utcCheckbox = document.getElementById("nightsky-utc-checkbox");
        tzLabel     = document.getElementById("nightsky-tz-label");

        // Verify canvas support
        if (!canvasEl || !canvasEl.getContext) {
            if (detailsEl) {
                detailsEl.innerHTML =
                    '<p class="nightsky-error">' +
                    "Your browser does not support the Canvas element." +
                    "</p>";
            }
            return;
        }

        // Set up canvas with HiDPI support
        setupCanvas();

        // Initialize timezone — default to local time
        useUTC = false;
        if (utcCheckbox) {
            utcCheckbox.checked = false;
        }
        updateTimezoneLabel();

        // Set date/time inputs to current local time
        dateInput.value = nowLocalDate();
        timeInput.value = nowLocalTime();

        // Wire up event listeners — control inputs
        dateInput.addEventListener("change", onDateTimeChange);
        timeInput.addEventListener("change", onDateTimeChange);
        latInput.addEventListener("input", onCoordInput);
        lonInput.addEventListener("input", onCoordInput);
        nowBtn.addEventListener("click", onNow);
        locateBtn.addEventListener("click", onLocate);

        // Wire up UTC toggle
        if (utcCheckbox) {
            utcCheckbox.addEventListener("change", onUTCToggle);
        }

        // Wire up event listeners — canvas interaction
        canvasEl.addEventListener("mousemove", onCanvasMouseMove);
        canvasEl.addEventListener("mouseleave", onCanvasMouseLeave);
        canvasEl.addEventListener("touchstart", onCanvasTouchStart,
                                  { passive: false });

        // Wire up window resize
        window.addEventListener("resize", onWindowResize);

        // Render empty sky dome (background + grid, no objects yet)
        render();

        // Attempt geolocation auto-detect
        detectLocation();
    }

    // Run initialization when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
