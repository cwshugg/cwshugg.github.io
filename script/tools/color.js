// Color Picker — script/tools/color.js
// Interactive RGB color picker with HSV wheel, sliders, text inputs,
// and xterm 256-color palette with nearest-match highlighting.
// ES5-compatible IIFE — no external dependencies.

(function () {
    "use strict";

    // ================================================================== //
    //  Constants                                                          //
    // ================================================================== //

    /** CSS pixel size of the color wheel canvas. */
    var WHEEL_SIZE = 280;

    /** Pre-computed xterm 256 color palette ({r, g, b} objects). */
    var XTERM_COLORS = [];

    // ================================================================== //
    //  State                                                              //
    // ================================================================== //

    /** Canonical color state — single source of truth.
     *  r/g/b: RGB channels (0-255), the display color.
     *  h/s/v: HSV components (h: 0-360, s: 0-1, v: 0-1), kept in sync.
     *  Tracking HSV separately lets the lightness slider preserve hue and
     *  saturation even when the color is very dark (where rgbToHsv would
     *  lose precision). */
    var state = { r: 255, g: 87, b: 51, h: 0, s: 0, v: 1.0 };

    /** Whether the user is currently dragging on the color wheel. */
    var dragging = false;

    // ================================================================== //
    //  DOM References (populated in init)                                 //
    // ================================================================== //

    var canvas, ctx;
    var wheelImageData;           // cached ImageData for the HSV disc
    var preview, valuesDiv;
    var sliderR, sliderG, sliderB;
    var sliderV, inputV;           // lightness (HSV Value) slider + numeric
    var inputR, inputG, inputB;
    var inputHex, inputRgb;
    var xtermContainer;
    var xtermCells = [];           // array of 256 cell DOM elements
    var currentNearestIdx = -1;

    // ================================================================== //
    //  Utility                                                            //
    // ================================================================== //

    /**
     * Clamps a numeric value to [min, max].
     */
    function clamp(val, min, max) {
        return val < min ? min : (val > max ? max : val);
    }

    // ================================================================== //
    //  Color Conversions — all pure functions                             //
    // ================================================================== //

    /**
     * Converts a single channel value (0-255) to a two-digit uppercase hex
     * string.
     */
    function toHex(n) {
        var hex = n.toString(16).toUpperCase();
        return hex.length === 1 ? "0" + hex : hex;
    }

    /**
     * Converts RGB (0-255 each) to a hex string "#RRGGBB".
     */
    function rgbToHex(r, g, b) {
        return "#" + toHex(r) + toHex(g) + toHex(b);
    }

    /**
     * Parses a hex color string ("#RRGGBB" or "#RGB") into {r, g, b}.
     * Returns null if the string is invalid.
     */
    function hexToRgb(hex) {
        hex = hex.replace(/^#/, "");
        // Expand shorthand (#RGB -> #RRGGBB)
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
            return null;
        }
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
        };
    }

    /**
     * Converts RGB (0-255) to HSV.
     * Returns {h: 0-360, s: 0-1, v: 0-1}.
     */
    function rgbToHsv(r, g, b) {
        var rr = r / 255, gg = g / 255, bb = b / 255;
        var cmax = Math.max(rr, gg, bb);
        var cmin = Math.min(rr, gg, bb);
        var delta = cmax - cmin;
        var h = 0, s = 0, v = cmax;

        if (cmax !== 0) {
            s = delta / cmax;
        }

        if (delta !== 0) {
            if (cmax === rr) {
                h = 60 * (((gg - bb) / delta) % 6);
            } else if (cmax === gg) {
                h = 60 * (((bb - rr) / delta) + 2);
            } else {
                h = 60 * (((rr - gg) / delta) + 4);
            }
        }

        if (h < 0) { h += 360; }
        return { h: h, s: s, v: v };
    }

    /**
     * Converts HSV (h: 0-360, s: 0-1, v: 0-1) to RGB {r, g, b} (0-255).
     */
    function hsvToRgb(h, s, v) {
        var c = v * s;
        var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        var m = v - c;
        var rp = 0, gp = 0, bp = 0;

        if (h < 60)       { rp = c; gp = x; bp = 0; }
        else if (h < 120) { rp = x; gp = c; bp = 0; }
        else if (h < 180) { rp = 0; gp = c; bp = x; }
        else if (h < 240) { rp = 0; gp = x; bp = c; }
        else if (h < 300) { rp = x; gp = 0; bp = c; }
        else              { rp = c; gp = 0; bp = x; }

        return {
            r: Math.round((rp + m) * 255),
            g: Math.round((gp + m) * 255),
            b: Math.round((bp + m) * 255)
        };
    }

    /**
     * Converts RGB (0-255) to HSL.
     * Returns {h: 0-360, s: 0-1, l: 0-1}.
     */
    function rgbToHsl(r, g, b) {
        var rr = r / 255, gg = g / 255, bb = b / 255;
        var cmax = Math.max(rr, gg, bb);
        var cmin = Math.min(rr, gg, bb);
        var delta = cmax - cmin;
        var l = (cmax + cmin) / 2;
        var h = 0, s = 0;

        if (delta !== 0) {
            s = delta / (1 - Math.abs(2 * l - 1));

            if (cmax === rr) {
                h = 60 * (((gg - bb) / delta) % 6);
            } else if (cmax === gg) {
                h = 60 * (((bb - rr) / delta) + 2);
            } else {
                h = 60 * (((rr - gg) / delta) + 4);
            }
        }

        if (h < 0) { h += 360; }
        return { h: h, s: s, l: l };
    }

    // ================================================================== //
    //  Xterm 256-Color Palette                                            //
    // ================================================================== //

    /**
     * Builds the XTERM_COLORS array with 256 {r, g, b} entries.
     * Colors 0-7:    standard ANSI
     * Colors 8-15:   high-intensity ANSI
     * Colors 16-231: 6x6x6 color cube
     * Colors 232-255: grayscale ramp
     */
    function buildXtermPalette() {
        // Standard ANSI colors (0-7)
        var ansi = [
            { r: 0,   g: 0,   b: 0   },  // 0  Black
            { r: 128, g: 0,   b: 0   },  // 1  Red
            { r: 0,   g: 128, b: 0   },  // 2  Green
            { r: 128, g: 128, b: 0   },  // 3  Yellow (Olive)
            { r: 0,   g: 0,   b: 128 },  // 4  Blue
            { r: 128, g: 0,   b: 128 },  // 5  Magenta
            { r: 0,   g: 128, b: 128 },  // 6  Cyan
            { r: 192, g: 192, b: 192 }   // 7  White (Light Gray)
        ];

        // High-intensity ANSI colors (8-15)
        var ansiHi = [
            { r: 128, g: 128, b: 128 },  // 8  Dark Gray
            { r: 255, g: 0,   b: 0   },  // 9  Light Red
            { r: 0,   g: 255, b: 0   },  // 10 Light Green
            { r: 255, g: 255, b: 0   },  // 11 Light Yellow
            { r: 0,   g: 0,   b: 255 },  // 12 Light Blue
            { r: 255, g: 0,   b: 255 },  // 13 Light Magenta
            { r: 0,   g: 255, b: 255 },  // 14 Light Cyan
            { r: 255, g: 255, b: 255 }   // 15 White
        ];

        XTERM_COLORS = [];
        var i, n, ri, gi, bi, gray;

        // 0-7
        for (i = 0; i < 8; i++) {
            XTERM_COLORS.push(ansi[i]);
        }

        // 8-15
        for (i = 0; i < 8; i++) {
            XTERM_COLORS.push(ansiHi[i]);
        }

        // 16-231: 6x6x6 color cube
        // Channel value mapping: idx===0 ? 0 : 55 + idx*40
        // Produces: 0, 95, 135, 175, 215, 255
        for (i = 16; i <= 231; i++) {
            n = i - 16;
            ri = Math.floor(n / 36);
            gi = Math.floor((n % 36) / 6);
            bi = n % 6;
            XTERM_COLORS.push({
                r: ri === 0 ? 0 : 55 + ri * 40,
                g: gi === 0 ? 0 : 55 + gi * 40,
                b: bi === 0 ? 0 : 55 + bi * 40
            });
        }

        // 232-255: grayscale ramp
        // gray = 8 + (i - 232) * 10  =>  8, 18, 28, ..., 238
        for (i = 232; i <= 255; i++) {
            gray = 8 + (i - 232) * 10;
            XTERM_COLORS.push({ r: gray, g: gray, b: gray });
        }
    }

    /**
     * Computes perceived luminance for text-color contrast decisions.
     * Returns a value in 0-255.
     */
    function luminance(r, g, b) {
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    /**
     * Finds the index of the nearest xterm color to the given RGB values
     * using squared Euclidean distance (no sqrt needed for comparison).
     */
    function findNearestXterm(r, g, b) {
        var bestIndex = 0;
        var bestDist = Infinity;
        var i, xr, xg, xb, dist;

        for (i = 0; i < 256; i++) {
            xr = XTERM_COLORS[i].r;
            xg = XTERM_COLORS[i].g;
            xb = XTERM_COLORS[i].b;
            dist = (r - xr) * (r - xr) +
                   (g - xg) * (g - xg) +
                   (b - xb) * (b - xb);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }
        return { index: bestIndex, dist: bestDist };
    }

    // ================================================================== //
    //  Xterm Grid Building                                                //
    // ================================================================== //

    /**
     * Creates a single xterm cell <div> and attaches a click handler.
     * Returns the DOM element.
     */
    function createXtermCell(idx) {
        var c = XTERM_COLORS[idx];
        var cell = document.createElement("div");
        cell.className = "cp-xterm-cell";
        cell.textContent = String(idx);
        cell.style.backgroundColor = "rgb(" + c.r + "," + c.g + "," + c.b + ")";
        cell.style.color = luminance(c.r, c.g, c.b) > 128 ? "#000" : "#fff";
        cell.title = idx + ": rgb(" + c.r + ", " + c.g + ", " + c.b + ")";

        cell.addEventListener("click", function () {
            onXtermClick(idx);
        });

        return cell;
    }

    /**
     * Builds the full xterm 256-color grid inside #cp-xterm-grid.
     * Layout:
     *   - Standard (0-7):          single row of 8
     *   - High-Intensity (8-15):   single row of 8
     *   - Color Cube (16-231):     6 blocks of 6x6 grids
     *   - Grayscale (232-255):     single row of 24
     */
    function buildXtermGrid() {
        var container = xtermContainer;
        var i, row, block, label;

        // -- Standard Colors (0-7) --
        label = document.createElement("div");
        label.className = "cp-xterm-label";
        label.textContent = "Standard (0-7)";
        container.appendChild(label);

        row = document.createElement("div");
        row.className = "cp-xterm-row";
        for (i = 0; i < 8; i++) {
            var cell0 = createXtermCell(i);
            xtermCells[i] = cell0;
            row.appendChild(cell0);
        }
        container.appendChild(row);

        // -- High-Intensity Colors (8-15) --
        label = document.createElement("div");
        label.className = "cp-xterm-label";
        label.textContent = "High-Intensity (8-15)";
        container.appendChild(label);

        row = document.createElement("div");
        row.className = "cp-xterm-row";
        for (i = 8; i < 16; i++) {
            var cell1 = createXtermCell(i);
            xtermCells[i] = cell1;
            row.appendChild(cell1);
        }
        container.appendChild(row);

        // -- Color Cube (16-231): 6 blocks of 6x6 --
        label = document.createElement("div");
        label.className = "cp-xterm-label";
        label.textContent = "Color Cube (16-231)";
        container.appendChild(label);

        var cubeWrap = document.createElement("div");
        cubeWrap.className = "cp-xterm-cube-wrap";

        for (var rBlock = 0; rBlock < 6; rBlock++) {
            block = document.createElement("div");
            block.className = "cp-xterm-cube-block";

            for (var gRow = 0; gRow < 6; gRow++) {
                for (var bCol = 0; bCol < 6; bCol++) {
                    var idx = 16 + rBlock * 36 + gRow * 6 + bCol;
                    var cell2 = createXtermCell(idx);
                    xtermCells[idx] = cell2;
                    block.appendChild(cell2);
                }
            }
            cubeWrap.appendChild(block);
        }
        container.appendChild(cubeWrap);

        // -- Grayscale Ramp (232-255) --
        label = document.createElement("div");
        label.className = "cp-xterm-label";
        label.textContent = "Grayscale (232-255)";
        container.appendChild(label);

        row = document.createElement("div");
        row.className = "cp-xterm-row";
        for (i = 232; i <= 255; i++) {
            var cell3 = createXtermCell(i);
            xtermCells[i] = cell3;
            row.appendChild(cell3);
        }
        container.appendChild(row);
    }

    // ================================================================== //
    //  Canvas Color Wheel                                                 //
    // ================================================================== //

    /**
     * Renders the HSV disc into the canvas and caches the ImageData.
     *
     * For each pixel, angle = hue (0-360°), distance from center =
     * saturation (0-1), value fixed at 1.0. Pixels outside the disc
     * radius are transparent.
     *
     * Uses devicePixelRatio scaling for HiDPI displays.
     */
    function initWheel() {
        var dpr = window.devicePixelRatio || 1;
        var size = WHEEL_SIZE;

        // Set the backing store size for HiDPI
        canvas.width = size * dpr;
        canvas.height = size * dpr;

        // Set display size in CSS pixels
        canvas.style.width = size + "px";
        canvas.style.height = size + "px";

        ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);

        // Render the HSV disc pixel-by-pixel into an ImageData buffer.
        // We work at the full backing-store resolution for sharpness.
        var w = size * dpr;
        var h = size * dpr;
        var imgData = ctx.createImageData(w, h);
        var data = imgData.data;
        var centerX = w / 2;
        var centerY = h / 2;
        var radius = w / 2;

        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var dx = x - centerX;
                var dy = y - centerY;
                var dist = Math.sqrt(dx * dx + dy * dy);
                var offset = (y * w + x) * 4;

                if (dist > radius) {
                    // Outside the circle — transparent
                    data[offset]     = 0;
                    data[offset + 1] = 0;
                    data[offset + 2] = 0;
                    data[offset + 3] = 0;
                } else {
                    // Hue from angle (atan2), saturation from distance
                    var hue = Math.atan2(dy, dx) * (180 / Math.PI);
                    if (hue < 0) { hue += 360; }
                    var sat = dist / radius;

                    var rgb = hsvToRgb(hue, sat, 1.0);
                    data[offset]     = rgb.r;
                    data[offset + 1] = rgb.g;
                    data[offset + 2] = rgb.b;
                    data[offset + 3] = 255;
                }
            }
        }

        // Cache the disc image for re-use (we redraw it when adding the
        // indicator overlay so we don't have to re-compute pixels).
        wheelImageData = imgData;

        // Reset scaling before putImageData (it operates in raw pixel space)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.putImageData(imgData, 0, 0);
        // Restore scaling for subsequent drawing commands
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Size the preview swatch to match the wheel
        sizePreview();
    }

    /**
     * Sizes the preview swatch (#cp-preview) so that it is a square
     * whose height matches the rendered height of the color wheel canvas.
     * This keeps the two side-by-side at the same height, and works
     * responsively since it reads the canvas's actual rendered size.
     */
    function sizePreview() {
        var wheelHeight = canvas.getBoundingClientRect().height;
        preview.style.width  = wheelHeight + "px";
        preview.style.height = wheelHeight + "px";
    }

    /**
     * Redraws the wheel disc from the cache, applies a darkening overlay
     * based on the current HSV Value, and draws the selection indicator
     * at the given HSV hue/saturation position.
     *
     * The overlay works by compositing a semi-transparent black circle
     * over the cached V=1.0 disc.  Because HSV value scales each RGB
     * channel linearly, rgba(0,0,0, 1-V) produces the exact result.
     *
     * @param {number} h  Hue in degrees (0-360).
     * @param {number} s  Saturation (0-1).
     */
    function drawIndicator(h, s) {
        var dpr = window.devicePixelRatio || 1;
        var size = WHEEL_SIZE;
        var radius = size / 2;
        var centerX = size / 2;
        var centerY = size / 2;

        // Restore cached disc image (V=1.0, clears previous indicator)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.putImageData(wheelImageData, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Apply darkening overlay for current Value (V < 1.0).
        // A black circle with opacity (1 - V) correctly scales each
        // channel: R_out = R * V, which matches hsvToRgb behaviour.
        if (state.v < 1.0) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0,0,0," + (1 - state.v) + ")";
            ctx.fill();
        }

        // Calculate indicator position in CSS-pixel coordinate space
        var angle = h * (Math.PI / 180);
        var dist = s * radius;
        var ix = centerX + dist * Math.cos(angle);
        var iy = centerY + dist * Math.sin(angle);

        // Draw indicator — dark outer ring for contrast, white inner ring
        ctx.beginPath();
        ctx.arc(ix, iy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(ix, iy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    /**
     * Extracts the hue and saturation from a canvas click/touch point.
     * Coordinates should be in CSS-pixel space relative to the canvas.
     * Points outside the disc are clamped to the edge.
     *
     * @returns {{h: number, s: number}}  Hue (0-360) and saturation (0-1).
     */
    function colorAtPoint(x, y) {
        var size = WHEEL_SIZE;
        var centerX = size / 2;
        var centerY = size / 2;
        var radius = size / 2;
        var dx = x - centerX;
        var dy = y - centerY;
        var dist = Math.sqrt(dx * dx + dy * dy);

        // Clamp to edge of disc
        var sat = Math.min(dist / radius, 1.0);

        var hue = Math.atan2(dy, dx) * (180 / Math.PI);
        if (hue < 0) { hue += 360; }

        return { h: hue, s: sat };
    }

    // ================================================================== //
    //  UI Update                                                          //
    // ================================================================== //

    /**
     * Central update function. Reads the new value from `source`,
     * converts to RGB, stores canonical state, and updates all other UI.
     *
     * @param {string} source  One of: "wheel", "slider", "numeric",
     *                         "hex", "rgb", "xterm",
     *                         "lightness-slider", "lightness-numeric",
     *                         or null (init).
     */
    function updateFromSource(source) {
        var r = state.r, g = state.g, b = state.b;
        var parsed, val, lrgb, vn;

        // -- Lightness sources: read V, use stored H/S, derive RGB --
        if (source === "lightness-slider") {
            state.v = clamp(parseInt(sliderV.value, 10), 0, 100) / 100;
            lrgb = hsvToRgb(state.h, state.s, state.v);
            state.r = lrgb.r;
            state.g = lrgb.g;
            state.b = lrgb.b;
            updateUI(source);
            return;
        }
        if (source === "lightness-numeric") {
            vn = parseInt(inputV.value, 10);
            state.v = isNaN(vn) ? 0 : clamp(vn, 0, 100) / 100;
            lrgb = hsvToRgb(state.h, state.s, state.v);
            state.r = lrgb.r;
            state.g = lrgb.g;
            state.b = lrgb.b;
            updateUI(source);
            return;
        }

        // -- RGB-based sources: read RGB, then sync HSV from result --
        if (source === "slider") {
            r = parseInt(sliderR.value, 10);
            g = parseInt(sliderG.value, 10);
            b = parseInt(sliderB.value, 10);
        } else if (source === "numeric") {
            val = parseInt(inputR.value, 10);
            r = isNaN(val) ? 0 : clamp(val, 0, 255);
            val = parseInt(inputG.value, 10);
            g = isNaN(val) ? 0 : clamp(val, 0, 255);
            val = parseInt(inputB.value, 10);
            b = isNaN(val) ? 0 : clamp(val, 0, 255);
        } else if (source === "hex") {
            parsed = hexToRgb(inputHex.value.trim());
            if (!parsed) { return; }  // invalid — leave state unchanged
            r = parsed.r;
            g = parsed.g;
            b = parsed.b;
        } else if (source === "rgb") {
            var parts = inputRgb.value.split(",");
            if (parts.length !== 3) { return; }
            var rv = parseInt(parts[0].trim(), 10);
            var gv = parseInt(parts[1].trim(), 10);
            var bv = parseInt(parts[2].trim(), 10);
            if (isNaN(rv) || isNaN(gv) || isNaN(bv)) { return; }
            r = clamp(rv, 0, 255);
            g = clamp(gv, 0, 255);
            b = clamp(bv, 0, 255);
        }
        // "wheel" and "xterm" sources set state directly before
        // calling updateUI, so no parsing is needed here for those.

        state.r = r;
        state.g = g;
        state.b = b;

        // Keep HSV in sync for all RGB-based sources so the lightness
        // slider and wheel indicator reflect the actual color.
        var hsv = rgbToHsv(r, g, b);
        state.h = hsv.h;
        state.s = hsv.s;
        state.v = hsv.v;

        updateUI(source);
    }

    /**
     * Updates every UI component to reflect the current state.
     * Skips the source control to prevent cursor-jumping in text fields
     * and circular update loops.
     *
     * @param {string|null} skipSource  The source to skip updating.
     */
    function updateUI(skipSource) {
        var r = state.r, g = state.g, b = state.b;

        // -- RGB Sliders --
        if (skipSource !== "slider") {
            sliderR.value = r;
            sliderG.value = g;
            sliderB.value = b;
        }

        // -- Lightness (V) slider --
        if (skipSource !== "lightness-slider") {
            sliderV.value = Math.round(state.v * 100);
        }
        if (skipSource !== "lightness-numeric") {
            inputV.value = Math.round(state.v * 100);
        }

        // -- Numeric inputs --
        if (skipSource !== "numeric") {
            inputR.value = r;
            inputG.value = g;
            inputB.value = b;
        }

        // -- Hex input --
        if (skipSource !== "hex") {
            inputHex.value = rgbToHex(r, g, b);
        }

        // -- RGB text input --
        if (skipSource !== "rgb") {
            inputRgb.value = r + ", " + g + ", " + b;
        }

        // -- Preview swatch --
        preview.style.backgroundColor = "rgb(" + r + "," + g + "," + b + ")";

        // -- Color values display --
        var hsv = rgbToHsv(r, g, b);
        var hsl = rgbToHsl(r, g, b);
        valuesDiv.innerHTML =
            "<span><span class=\"cp-val-label\">RGB:</span> rgb(" + r + ", " + g + ", " + b + ")</span>" +
            "<span><span class=\"cp-val-label\">Hex:</span> " + rgbToHex(r, g, b) + "</span>" +
            "<span><span class=\"cp-val-label\">HSL:</span> hsl(" +
                Math.round(hsl.h) + ", " +
                Math.round(hsl.s * 100) + "%, " +
                Math.round(hsl.l * 100) + "%)</span>" +
            "<span><span class=\"cp-val-label\">HSV:</span> hsv(" +
                Math.round(hsv.h) + ", " +
                Math.round(hsv.s * 100) + "%, " +
                Math.round(hsv.v * 100) + "%)</span>";

        // -- Wheel indicator (uses stored H/S to avoid rounding drift) --
        drawIndicator(state.h, state.s);

        // -- Xterm nearest match --
        var nearResult = findNearestXterm(r, g, b);
        var nearIdx = nearResult.index;
        var nearDist = nearResult.dist;
        var highlightClass;
        if (nearIdx !== currentNearestIdx) {
            if (currentNearestIdx >= 0 && xtermCells[currentNearestIdx]) {
                xtermCells[currentNearestIdx].className = "cp-xterm-cell";
            }
            highlightClass = nearDist === 0 ? "cp-xterm-exact" : "cp-xterm-nearest";
            xtermCells[nearIdx].className = "cp-xterm-cell " + highlightClass;
            currentNearestIdx = nearIdx;
        } else if (xtermCells[nearIdx]) {
            // Same cell, but distance may have changed (exact vs approximate)
            highlightClass = nearDist === 0 ? "cp-xterm-exact" : "cp-xterm-nearest";
            xtermCells[nearIdx].className = "cp-xterm-cell " + highlightClass;
        }

        // -- Slider track gradients --
        updateSliderGradients();
    }

    /**
     * Sets inline background gradients on each slider track to show the
     * color range for that channel. For example, the R slider gradient
     * runs from rgb(0, G, B) to rgb(255, G, B).
     *
     * The V (lightness) slider gradient runs from black to the current
     * hue/saturation at full brightness, showing the darkening range.
     */
    function updateSliderGradients() {
        var r = state.r, g = state.g, b = state.b;

        var rGrad = "linear-gradient(to right, rgb(0," + g + "," + b + "), rgb(255," + g + "," + b + "))";
        var gGrad = "linear-gradient(to right, rgb(" + r + ",0," + b + "), rgb(" + r + ",255," + b + "))";
        var bGrad = "linear-gradient(to right, rgb(" + r + "," + g + ",0), rgb(" + r + "," + g + ",255))";

        sliderR.style.background = rGrad;
        sliderG.style.background = gGrad;
        sliderB.style.background = bGrad;

        // V slider: black (left, V=0) → full-brightness color (right, V=1)
        var fullBright = hsvToRgb(state.h, state.s, 1.0);
        var vGrad = "linear-gradient(to right, rgb(0,0,0), rgb(" +
            fullBright.r + "," + fullBright.g + "," + fullBright.b + "))";
        sliderV.style.background = vGrad;
    }

    // ================================================================== //
    //  Event Handlers                                                     //
    // ================================================================== //

    /**
     * Returns the (x, y) position of a mouse or touch event relative to
     * the canvas element, in CSS-pixel coordinates.
     */
    function getCanvasCoords(e) {
        var rect = canvas.getBoundingClientRect();
        var clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    /**
     * Handles a wheel interaction (click or drag). Extracts hue/saturation
     * from the position, combines with the current lightness (Value) from
     * state, converts to RGB, and triggers a UI update.
     *
     * The lightness slider is intentionally preserved — the user can set a
     * dark value and then pick hues from the wheel without resetting to
     * full brightness.
     */
    function handleWheelInteraction(e) {
        var coords = getCanvasCoords(e);
        var hs = colorAtPoint(coords.x, coords.y);
        var rgb = hsvToRgb(hs.h, hs.s, state.v);

        state.r = rgb.r;
        state.g = rgb.g;
        state.b = rgb.b;
        state.h = hs.h;    // exact H from wheel position
        state.s = hs.s;    // exact S from wheel position
        // state.v is preserved (not changed by wheel interaction)
        updateUI("wheel");
    }

    /** mousedown / touchstart on the canvas. */
    function onWheelMouseDown(e) {
        e.preventDefault();
        dragging = true;
        handleWheelInteraction(e);
    }

    /** mousemove / touchmove (document-level) while dragging. */
    function onWheelMouseMove(e) {
        if (!dragging) { return; }
        e.preventDefault();
        handleWheelInteraction(e);
    }

    /** mouseup / touchend (document-level) — stop dragging. */
    function onWheelMouseUp() {
        dragging = false;
    }

    /** Range slider input event. */
    function onSliderInput() {
        updateFromSource("slider");
    }

    /** Numeric input event. */
    function onNumericInput() {
        updateFromSource("numeric");
    }

    /** Lightness (V) range slider input event. */
    function onLightnessSliderInput() {
        updateFromSource("lightness-slider");
    }

    /** Lightness (V) numeric input event. */
    function onLightnessNumericInput() {
        updateFromSource("lightness-numeric");
    }

    /** Hex text input event. */
    function onHexInput() {
        updateFromSource("hex");
    }

    /** RGB text input event. */
    function onRgbInput() {
        updateFromSource("rgb");
    }

    /**
     * Click handler for an xterm palette cell.
     * @param {number} idx  The xterm color index (0-255).
     */
    function onXtermClick(idx) {
        var c = XTERM_COLORS[idx];
        state.r = c.r;
        state.g = c.g;
        state.b = c.b;
        // Sync HSV so the lightness slider reflects the xterm color's V
        var hsv = rgbToHsv(c.r, c.g, c.b);
        state.h = hsv.h;
        state.s = hsv.s;
        state.v = hsv.v;
        updateUI("xterm");
    }

    // ================================================================== //
    //  Initialization                                                     //
    // ================================================================== //

    /**
     * Initializes the color picker: caches DOM refs, builds the xterm
     * palette and grid, renders the HSV disc, attaches all event listeners,
     * and performs the initial UI update.
     */
    function init() {
        // -- Cache DOM references --
        canvas       = document.getElementById("cp-wheel-canvas");
        preview      = document.getElementById("cp-preview");
        valuesDiv    = document.getElementById("cp-values");
        sliderR      = document.getElementById("cp-slider-r");
        sliderG      = document.getElementById("cp-slider-g");
        sliderB      = document.getElementById("cp-slider-b");
        sliderV      = document.getElementById("cp-slider-v");
        inputV       = document.getElementById("cp-input-v");
        inputR       = document.getElementById("cp-input-r");
        inputG       = document.getElementById("cp-input-g");
        inputB       = document.getElementById("cp-input-b");
        inputHex     = document.getElementById("cp-input-hex");
        inputRgb     = document.getElementById("cp-input-rgb");
        xtermContainer = document.getElementById("cp-xterm-grid");

        // Bail out gracefully if required elements are missing (e.g.,
        // script loaded on the wrong page).
        if (!canvas || !preview || !valuesDiv || !sliderR || !sliderV || !xtermContainer) {
            return;
        }

        // -- Compute initial HSV from the default RGB state --
        var initHsv = rgbToHsv(state.r, state.g, state.b);
        state.h = initHsv.h;
        state.s = initHsv.s;
        state.v = initHsv.v;

        // -- Build xterm palette data & grid --
        buildXtermPalette();
        buildXtermGrid();

        // -- Render HSV disc --
        initWheel();

        // -- Attach event listeners: RGB sliders --
        sliderR.addEventListener("input", onSliderInput);
        sliderG.addEventListener("input", onSliderInput);
        sliderB.addEventListener("input", onSliderInput);

        // -- Attach event listeners: lightness (V) slider --
        sliderV.addEventListener("input", onLightnessSliderInput);
        inputV.addEventListener("input", onLightnessNumericInput);

        // -- Attach event listeners: numeric inputs --
        inputR.addEventListener("input", onNumericInput);
        inputG.addEventListener("input", onNumericInput);
        inputB.addEventListener("input", onNumericInput);

        // -- Attach event listeners: text inputs --
        inputHex.addEventListener("input", onHexInput);
        inputRgb.addEventListener("input", onRgbInput);

        // -- Attach event listeners: canvas (mouse) --
        canvas.addEventListener("mousedown", onWheelMouseDown);
        document.addEventListener("mousemove", onWheelMouseMove);
        document.addEventListener("mouseup", onWheelMouseUp);

        // -- Attach event listeners: canvas (touch) --
        canvas.addEventListener("touchstart", onWheelMouseDown, { passive: false });
        document.addEventListener("touchmove", onWheelMouseMove, { passive: false });
        document.addEventListener("touchend", onWheelMouseUp);

        // -- Resize: keep preview swatch in sync with the wheel --
        window.addEventListener("resize", sizePreview);

        // -- Initial UI state --
        updateUI(null);
    }

    // Run initialization
    init();
})();
