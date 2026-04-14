// Solar System Rendering Library — script/lib/solarsystem.js
// A standalone, zero-dependency Canvas 2D library for rendering an animated
// top-down solar system with clickable, orbiting bodies. Exposes a global
// SolarSystem constructor via an IIFE.
//
// Usage:
//   var system = new SolarSystem(canvasElement, {
//       sun:    { radius: 40, color: "#FFD700", link: "/me", label: "Me" },
//       bodies: [
//           { radius: 18, color: "#4A90D9", link: "/tools", label: "Tools",
//             orbitRadius: 140, period: 90, startAngle: 0 }
//       ]
//   });
//   system.start();
//
// Rendering layers (back to front):
//   0. Clear / background
//   1. Orbit lines (solid circles for each body)
//   2. Sun glow (radial gradient, skipped when glowRadius is 0)
//   3. Sun body (image clipped to circle, or flat color fill)
//   4. Planet bodies (image clipped or flat color fill)
//   5. Labels (sun + planets)
//   6. Hover / Press rims (flat stroked circles around hovered/pressed bodies)

(function (global) {
    "use strict";

    // ================================================================== //
    //  Default Configuration                                              //
    // ================================================================== //

    var PI  = Math.PI;
    var TAU = 2 * PI;

    // Hover animation constants
    var HOVER_MAX_WIDTH  = 6;    // Maximum rim width when fully hovered (px)
    var HOVER_GROW_MS    = 150;  // Duration to grow from base to max width (ms)
    var HOVER_SHRINK_MS  = 100;  // Duration to shrink back to 0 (ms)

    var DEFAULTS = {
        sun: {
            radius:     40,                         // Radius in px (at reference width)
            image:      null,                       // URL string, HTMLImageElement, or null
            color:      "#FFD700",                  // Fallback fill color
            link:       null,                       // Navigation URL on click
            label:      null,                       // Text label below the body
            glowColor:  "rgba(255, 215, 0, 0.15)",  // Radial glow color
            glowRadius: 0                           // Glow extent as multiplier of sun radius (0 = disabled)
        },
        bodies:       [],                           // Array of body config objects
        orbitStyle: {
            color: "rgba(255, 255, 255, 0.15)",     // Orbit line stroke color
            width: 3                                // Orbit line width in pixels
        },
        labelStyle: {
            font:   "14px 'Aldrich', 'Helvetica Neue', Arial, sans-serif",
            color:  "rgba(255, 255, 255, 0.85)",
            offset: 10                              // Pixels below the body center + radius
        },
        hoverStyle: {
            enabled: true,                              // Enable/disable hover rim
            color:   "rgba(255, 255, 255, 0.7)",        // Rim stroke color
            width:   2,                                 // Rim stroke thickness
            gap:     4                                  // Pixels between sphere edge and rim
        },
        background:     null,                       // Canvas background color (null = transparent)
        animate:        true,                       // Whether to animate (false = static render)
        referenceWidth: 500                         // Design width; radii/orbits scale relative to this
    };

    // ================================================================== //
    //  Utilities                                                           //
    // ================================================================== //

    /**
     * Returns true if the given image is fully loaded and ready to draw.
     *
     * @param {HTMLImageElement|null} img
     * @returns {boolean}
     */
    function isImageReady(img) {
        return img && img.complete && img.naturalWidth > 0;
    }

    /**
     * Simple shallow merge: copies own properties from src onto dst.
     * Does NOT deep-merge nested objects.
     */
    function shallowMerge(dst, src) {
        for (var key in src) {
            if (src.hasOwnProperty(key)) {
                dst[key] = src[key];
            }
        }
        return dst;
    }

    /**
     * Returns a lighter shade of a hex color by blending it toward white.
     *
     * @param {string} hexColor - Hex color string (e.g. "#4A90D9")
     * @param {number} amount   - Blend amount: 0.0 = no change, 1.0 = white
     * @returns {string} CSS rgb() color string
     */
    function lightenColor(hexColor, amount) {
        var r = parseInt(hexColor.slice(1, 3), 16);
        var g = parseInt(hexColor.slice(3, 5), 16);
        var b = parseInt(hexColor.slice(5, 7), 16);
        r = Math.round(r + (255 - r) * amount);
        g = Math.round(g + (255 - g) * amount);
        b = Math.round(b + (255 - b) * amount);
        return "rgb(" + r + "," + g + "," + b + ")";
    }

    /**
     * Returns a contrasting text color (dark or light) for a given hex
     * background color, based on perceived luminance. Attempts to read
     * the current theme's --color-text and --color-bg CSS custom properties
     * for best visual consistency; falls back to hardcoded dark/light values.
     *
     * @param {string} hexColor - Hex color string (e.g. "#4A90D9")
     * @returns {string} A contrasting hex color string
     */
    function getContrastColor(hexColor) {
        var r = parseInt(hexColor.slice(1, 3), 16);
        var g = parseInt(hexColor.slice(3, 5), 16);
        var b = parseInt(hexColor.slice(5, 7), 16);
        var luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // Try to read theme colors from CSS custom properties
        var darkColor  = "#2D2B28";
        var lightColor = "#F5F5F5";
        try {
            var styles = getComputedStyle(document.documentElement);
            var textColor = styles.getPropertyValue("--color-text").trim();
            var bgColor   = styles.getPropertyValue("--color-bg").trim();
            if (textColor) darkColor  = textColor;
            if (bgColor)   lightColor = bgColor;
        } catch (_e) { /* ignore */ }

        return luminance > 128 ? darkColor : lightColor;
    }

    /**
     * Darken a hex color by blending it toward black.
     *
     * @param {string} hexColor - Hex color string (e.g. "#4A90D9")
     * @param {number} amount   - Darken amount: 0.0 = no change, 1.0 = black
     * @returns {string} CSS rgb() color string
     */
    function darkenColor(hexColor, amount) {
        var r = parseInt(hexColor.slice(1, 3), 16);
        var g = parseInt(hexColor.slice(3, 5), 16);
        var b = parseInt(hexColor.slice(5, 7), 16);
        r = Math.round(r * (1 - amount));
        g = Math.round(g * (1 - amount));
        b = Math.round(b * (1 - amount));
        return "rgb(" + r + "," + g + "," + b + ")";
    }

    /**
     * Deep-merge defaults with user-supplied options. Only merges one level
     * deep for plain objects (sun, orbitStyle, labelStyle). Arrays and
     * primitives are copied directly.
     */
    function mergeOptions(defaults, user) {
        var result = {};
        for (var key in defaults) {
            if (!defaults.hasOwnProperty(key)) continue;
            var dv = defaults[key];
            var uv = user && user.hasOwnProperty(key) ? user[key] : undefined;

            if (uv === undefined) {
                // Use default (shallow copy objects/arrays so mutations don't leak)
                if (dv && typeof dv === "object" && !Array.isArray(dv)) {
                    result[key] = shallowMerge({}, dv);
                } else if (Array.isArray(dv)) {
                    result[key] = dv.slice();
                } else {
                    result[key] = dv;
                }
            } else if (dv && typeof dv === "object" && !Array.isArray(dv) &&
                       uv && typeof uv === "object" && !Array.isArray(uv)) {
                // Merge one level deep for objects like sun, orbitStyle, labelStyle
                result[key] = shallowMerge(shallowMerge({}, dv), uv);
            } else {
                result[key] = uv;
            }
        }
        return result;
    }

    // ================================================================== //
    //  Constructor                                                         //
    // ================================================================== //

    /**
     * Creates a SolarSystem renderer bound to a canvas element.
     *
     * @param {HTMLCanvasElement} canvas - The canvas element to render onto.
     *        Width and height should be set before construction.
     * @param {Object} [options]        - Configuration options (see DEFAULTS).
     */
    function SolarSystem(canvas, options) {
        if (!canvas || !canvas.getContext) {
            throw new Error("SolarSystem: a valid <canvas> element is required.");
        }

        this._canvas  = canvas;
        this._ctx     = canvas.getContext("2d");

        // Merge user options with defaults
        this._options = mergeOptions(DEFAULTS, options || {});

        // Animation state
        this._animationId    = null;   // requestAnimationFrame ID (null when stopped)
        this._startTime      = null;   // performance.now() timestamp at start()
        this._pauseElapsed   = 0;      // Accumulated elapsed time before last stop()
        this._currentElapsed = 0;      // Elapsed seconds stored each frame (for hit testing)

        // Image cache: URL -> Image element
        this._images = {};

        // Hover state
        this._hoveredBody = null;

        // Press state (rim color change only — no animation)
        this._pressedBody      = null;   // Body config currently pressed (for white/black rim)

        // Hover animation state
        this._hoverAnimState   = null;   // "growing" | "shrinking" | null
        this._hoverAnimStart   = 0;      // performance.now() when current animation began
        this._hoverShrinkFrom  = 0;      // Rim width at the moment shrink animation began
        this._lastHoveredBody  = null;   // Last hovered body (used during shrink after cursor leaves)

        // Compute layout values
        this._recomputeLayout();

        // Load images for sun and all bodies
        this._loadImages();

        // Bind event handlers (store references for removal in destroy())
        var self = this;

        this._onClickBound       = function (e) { self._onClick(e); };
        this._onMoveBound        = function (e) { self._onMouseMove(e); };
        this._onResizeBound      = function ()  { self._onResize(); };
        this._onVisibilityBound  = function ()  { self._onVisibilityChange(); };
        this._onMouseDownBound   = function (e) { self._onMouseDown(e); };
        this._onMouseUpBound     = function (e) { self._onMouseUp(e); };
        this._onTouchStartBound  = function (e) { self._onTouchStart(e); };
        this._onTouchEndBound    = function (e) { self._onTouchEnd(e); };

        this._canvas.addEventListener("click",      this._onClickBound,      false);
        this._canvas.addEventListener("mousemove",  this._onMoveBound,       false);
        this._canvas.addEventListener("mousedown",  this._onMouseDownBound,  false);
        this._canvas.addEventListener("touchstart", this._onTouchStartBound, { passive: false });
        document.addEventListener("mouseup",        this._onMouseUpBound,    false);
        document.addEventListener("touchend",       this._onTouchEndBound,   false);
        global.addEventListener("resize",           this._onResizeBound,     false);
        document.addEventListener("visibilitychange", this._onVisibilityBound, false);
    }

    // ================================================================== //
    //  Layout                                                              //
    // ================================================================== //

    /**
     * Recomputes scale factor and sun center from current canvas dimensions.
     */
    SolarSystem.prototype._recomputeLayout = function () {
        this._scale = this._canvas.width / this._options.referenceWidth;
        this._sunX  = this._canvas.width  / 2;
        this._sunY  = this._canvas.height / 2;
    };

    // ================================================================== //
    //  Image Loading                                                       //
    // ================================================================== //

    /**
     * Initiates image loading for the sun and all bodies that specify an
     * image URL string. Images are loaded eagerly; the animation renders
     * with fallback colors until images are ready.
     */
    SolarSystem.prototype._loadImages = function () {
        var self = this;
        var sun  = this._options.sun;

        if (typeof sun.image === "string") {
            this._loadImage(sun.image);
        }

        var bodies = this._options.bodies;
        for (var i = 0; i < bodies.length; i++) {
            if (typeof bodies[i].image === "string") {
                this._loadImage(bodies[i].image);
            }
        }
    };

    /**
     * Loads a single image URL and caches it. Triggers a re-render when
     * the image finishes loading (so it appears on the next frame).
     *
     * @param {string} url - The image URL to load.
     */
    SolarSystem.prototype._loadImage = function (url) {
        if (this._images[url]) return; // Already loading / loaded

        var self = this;
        var img  = new Image();
        this._images[url] = img;

        img.onload = function () {
            // If not animating, force a single render so the image shows up
            if (self._animationId === null) {
                self.render();
            }
        };
        img.src = url;
    };

    /**
     * Returns the loaded Image element for a body/sun config, or null if
     * no image is specified or the image is not yet ready.
     *
     * @param {Object} bodyConfig - A sun or body config object.
     * @returns {HTMLImageElement|null}
     */
    SolarSystem.prototype._getImage = function (bodyConfig) {
        if (!bodyConfig.image) return null;

        // If it's already an HTMLImageElement (or duck-typed Image), use directly
        if (typeof bodyConfig.image === "object" && bodyConfig.image.src !== undefined) {
            return isImageReady(bodyConfig.image) ? bodyConfig.image : null;
        }

        // Look up the cached Image from the URL string
        var img = this._images[bodyConfig.image];
        return isImageReady(img) ? img : null;
    };

    // ================================================================== //
    //  Public Methods                                                      //
    // ================================================================== //

    /**
     * Begins the animation loop via requestAnimationFrame. If already
     * running, this is a no-op.
     *
     * @returns {SolarSystem} this (for chaining)
     */
    SolarSystem.prototype.start = function () {
        if (this._animationId !== null) return this; // Already running

        var self = this;
        this._startTime = performance.now() - (this._pauseElapsed * 1000);

        function frame(timestamp) {
            var elapsedSec = (timestamp - self._startTime) / 1000;
            self._currentElapsed = elapsedSec;
            self._renderFrame(elapsedSec);
            self._animationId = requestAnimationFrame(frame);
        }

        this._animationId = requestAnimationFrame(frame);
        return this;
    };

    /**
     * Pauses the animation loop. The current frame remains on canvas.
     * Calling start() again resumes from the paused position.
     *
     * @returns {SolarSystem} this (for chaining)
     */
    SolarSystem.prototype.stop = function () {
        if (this._animationId !== null) {
            cancelAnimationFrame(this._animationId);
            this._pauseElapsed = (performance.now() - this._startTime) / 1000;
            this._animationId  = null;
        }
        return this;
    };

    /**
     * Stops animation, removes all event listeners, clears canvas, and
     * nulls internal references. The instance should not be reused after
     * calling destroy().
     */
    SolarSystem.prototype.destroy = function () {
        this.stop();

        // Clear press and hover animation state
        this._pressedBody    = null;
        this._hoverAnimState = null;
        this._lastHoveredBody = null;

        // Remove event listeners
        this._canvas.removeEventListener("click",      this._onClickBound,      false);
        this._canvas.removeEventListener("mousemove",  this._onMoveBound,       false);
        this._canvas.removeEventListener("mousedown",  this._onMouseDownBound,  false);
        this._canvas.removeEventListener("touchstart", this._onTouchStartBound, false);
        document.removeEventListener("mouseup",        this._onMouseUpBound,    false);
        document.removeEventListener("touchend",       this._onTouchEndBound,   false);
        global.removeEventListener("resize",           this._onResizeBound,     false);
        document.removeEventListener("visibilitychange", this._onVisibilityBound, false);

        // Clear canvas
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        // Null references
        this._canvas  = null;
        this._ctx     = null;
        this._options = null;
        this._images  = null;
    };

    /**
     * Forces a single-frame render at the current elapsed time. Useful
     * for static displays or debugging.
     */
    SolarSystem.prototype.render = function () {
        this._renderFrame(this._currentElapsed || 0);
    };

    /**
     * Updates canvas dimensions and recomputes scale factor. Called
     * internally on window resize, but can also be called externally.
     *
     * @param {number} w - New canvas width in pixels.
     * @param {number} h - New canvas height in pixels.
     * @returns {SolarSystem} this (for chaining)
     */
    SolarSystem.prototype.resize = function (w, h) {
        this._canvas.width  = w;
        this._canvas.height = h;
        this._recomputeLayout();

        // If not animating, re-render so the canvas doesn't go blank
        if (this._animationId === null) {
            this.render();
        }

        return this;
    };

    // ================================================================== //
    //  Body Position & Rim Drawing Helpers                                //
    // ================================================================== //

    /**
     * Returns the current screen-space position and scaled radius for a body.
     * For the sun, returns the fixed center position.
     *
     * @param {Object} bodyConfig - A sun or body config object.
     * @returns {{ x: number, y: number, r: number }|null}
     */
    SolarSystem.prototype._getBodyScreenPosition = function (bodyConfig) {
        var sun   = this._options.sun;
        var scale = this._scale;
        var sunX  = this._sunX;
        var sunY  = this._sunY;

        // Sun: always at canvas center
        if (bodyConfig === sun) {
            return { x: sunX, y: sunY, r: sun.radius * scale };
        }

        // Planet: compute orbital position
        var elapsed = this._currentElapsed || 0;
        var angle   = (bodyConfig.startAngle * PI / 180) + (TAU * elapsed / bodyConfig.period);
        return {
            x: sunX + bodyConfig.orbitRadius * scale * Math.cos(angle),
            y: sunY - bodyConfig.orbitRadius * scale * Math.sin(angle),
            r: bodyConfig.radius * scale
        };
    };

    /**
     * Draws a flat stroked circle (rim) around a body at the given
     * screen position. No gradients, no glow — just a solid ring.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} cx    - Center X of the body
     * @param {number} cy    - Center Y of the body
     * @param {number} r     - Scaled radius of the body
     * @param {string} color - Stroke color
     * @param {number} width - Stroke line width
     * @param {number} gap   - Gap between body edge and rim
     */
    SolarSystem.prototype._drawRim = function (ctx, cx, cy, r, color, width, gap) {
        var innerRadius = r + gap;              // Fixed inner edge
        var rimRadius   = innerRadius + width / 2;  // Center of stroke (grows outward)
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, rimRadius, 0, TAU);
        ctx.strokeStyle = color;
        ctx.lineWidth   = width;
        ctx.stroke();
        ctx.restore();
    };

    // ================================================================== //
    //  Rendering Pipeline                                                  //
    // ================================================================== //

    /**
     * Main render function. Draws the complete scene for a given elapsed
     * time (in seconds since animation started).
     *
     * @param {number} elapsedSec - Elapsed time in seconds.
     */
    SolarSystem.prototype._renderFrame = function (elapsedSec) {
        var ctx   = this._ctx;
        var opts  = this._options;
        var scale = this._scale;
        var sunX  = this._sunX;
        var sunY  = this._sunY;
        var w     = this._canvas.width;
        var h     = this._canvas.height;

        // ---- Layer 0: Clear / Background ---- //
        ctx.clearRect(0, 0, w, h);
        if (opts.background) {
            ctx.fillStyle = opts.background;
            ctx.fillRect(0, 0, w, h);
        }

        // ---- Layer 1: Orbit Lines ---- //
        var bodies = opts.bodies;
        var orbitStyle = opts.orbitStyle;
        ctx.strokeStyle = orbitStyle.color;
        ctx.lineWidth   = orbitStyle.width;

        for (var i = 0; i < bodies.length; i++) {
            var orbitR = bodies[i].orbitRadius * scale;
            ctx.beginPath();
            ctx.arc(sunX, sunY, orbitR, 0, TAU);
            ctx.stroke();
        }

        // ---- Layer 2: Sun Glow (skipped when glowRadius is 0) ---- //
        var sun      = opts.sun;
        var sunR     = sun.radius * scale;

        if (sun.glowRadius) {
            var glowR    = sunR * sun.glowRadius;
            var glowGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, glowR);
            glowGrad.addColorStop(0, sun.glowColor || "rgba(255, 215, 0, 0.15)");
            glowGrad.addColorStop(1, "rgba(255, 215, 0, 0)");

            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(sunX, sunY, glowR, 0, TAU);
            ctx.fill();
        }

        // ---- Layer 3: Sun Body ---- //
        this._drawBody(ctx, sunX, sunY, sunR, sun);

        // ---- Layer 3 cont.: Planet Bodies ---- //
        // Pre-compute planet positions for labels pass
        var positions = [];
        for (var j = 0; j < bodies.length; j++) {
            var b     = bodies[j];
            var angle = (b.startAngle * PI / 180) + (TAU * elapsedSec / b.period);
            var bx    = sunX + b.orbitRadius * scale * Math.cos(angle);
            var by    = sunY - b.orbitRadius * scale * Math.sin(angle);
            var br    = b.radius * scale;

            positions.push({ x: bx, y: by, r: br });
            this._drawBody(ctx, bx, by, br, b);
        }

        // ---- Layer 4: Labels ---- //
        var labelStyle = opts.labelStyle;

        // Parse the numeric font size from the font string (e.g. "32px Jost, ...")
        // and scale it proportionally to the canvas so labels don't bleed on mobile.
        var fontMatch    = labelStyle.font.match(/^(\d+(?:\.\d+)?)(px\s+.*)$/);
        if (fontMatch) {
            var scaledSize = Math.round(parseFloat(fontMatch[1]) * scale);
            ctx.font = scaledSize + fontMatch[2];
        } else {
            ctx.font = labelStyle.font;
        }

        ctx.fillStyle    = labelStyle.color;
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";

        var scaledOffset = labelStyle.offset * scale;

        // Sun label
        if (sun.label) {
            ctx.fillText(sun.label, sunX, sunY + sunR + scaledOffset);
        }

        // Planet labels
        for (var k = 0; k < bodies.length; k++) {
            if (bodies[k].label) {
                var pos = positions[k];
                ctx.fillText(bodies[k].label, pos.x, pos.y + pos.r + scaledOffset);
            }
        }

        // ---- Layer 5: Hover Rim ---- //
        var hoverStyle = opts.hoverStyle;

        if (hoverStyle.enabled) {
            // Determine which body to draw the rim for:
            // - During shrink, use the last hovered body (since _hoveredBody is now null)
            // - Otherwise, use the currently hovered body
            var rimBody = null;
            if (this._hoverAnimState === "shrinking") {
                rimBody = this._lastHoveredBody;
            } else if (this._hoveredBody) {
                rimBody = this._hoveredBody;
            }

            if (rimBody) {
                var hbPos = this._getBodyScreenPosition(rimBody);
                if (hbPos) {
                    var now      = performance.now();
                    var rimWidth = 0;
                    var baseWidth = hoverStyle.width;

                    if (this._hoverAnimState === "growing") {
                        // Interpolate from base width to max over HOVER_GROW_MS
                        var gt = Math.min((now - this._hoverAnimStart) / HOVER_GROW_MS, 1.0);
                        rimWidth = baseWidth + (HOVER_MAX_WIDTH - baseWidth) * gt;
                        if (gt >= 1.0) {
                            this._hoverAnimState = null; // Done growing — hold at max
                        }
                    } else if (this._hoverAnimState === "shrinking") {
                        // Interpolate from shrinkFrom to 0 over HOVER_SHRINK_MS
                        var st = Math.min((now - this._hoverAnimStart) / HOVER_SHRINK_MS, 1.0);
                        rimWidth = this._hoverShrinkFrom * (1 - st);
                        if (st >= 1.0) {
                            this._hoverAnimState  = null;
                            this._lastHoveredBody = null;
                            rimWidth = 0;
                        }
                    } else if (this._hoveredBody) {
                        // Fully grown — hold at max width
                        rimWidth = HOVER_MAX_WIDTH;
                    }

                    if (rimWidth > 0) {
                        // Determine rim color:
                        // - Pressed: white (dark mode) or black (light mode)
                        // - Hovered: darker shade (light mode) or lighter shade (dark mode)
                        var rimColor;
                        if (this._pressedBody && this._pressedBody === rimBody) {
                            rimColor = document.body.classList.contains("light-mode")
                                ? "#000000"
                                : "#FFFFFF";
                        } else {
                            var isLight = document.body.classList.contains("light-mode");
                            rimColor = isLight
                                ? darkenColor(rimBody.color || "#888888", 0.30)
                                : lightenColor(rimBody.color || "#888888", 0.35);
                        }

                        this._drawRim(ctx, hbPos.x, hbPos.y, hbPos.r,
                                      rimColor, rimWidth, hoverStyle.gap);
                    }
                }
            }
        }
    };

    /**
     * Draws a single body (sun or planet) as a circle. If the body has a
     * loaded image, it is drawn clipped to the circular region ("cover"
     * scaling). Otherwise, the fallback color is used.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} cx - Center X
     * @param {number} cy - Center Y
     * @param {number} r  - Radius (already scaled)
     * @param {Object} bodyConfig - Body configuration object
     */
    SolarSystem.prototype._drawBody = function (ctx, cx, cy, r, bodyConfig) {
        var img = this._getImage(bodyConfig);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);

        if (img) {
            // Clip to circle and draw image with "cover" scaling
            ctx.clip();

            // Compute cover-fit dimensions: image fills the circle's bounding box
            var d    = r * 2;
            var iw   = img.naturalWidth;
            var ih   = img.naturalHeight;
            var imgScale = Math.max(d / iw, d / ih);
            var dw   = iw * imgScale;
            var dh   = ih * imgScale;
            var dx   = cx - dw / 2;
            var dy   = cy - dh / 2;

            ctx.drawImage(img, dx, dy, dw, dh);
        } else {
            // Color fallback
            ctx.fillStyle = bodyConfig.color || "#888";
            ctx.fill();
        }

        ctx.restore();

        // ---- Icon overlay ---- //
        // If the body has an icon config, draw the icon character centered
        // on the sphere using the specified font family and weight.
        if (bodyConfig.icon) {
            var icon     = bodyConfig.icon;
            var fontSize = Math.round(r * 1.1);
            var iconColor = bodyConfig.iconColor || "#2D2B28";

            ctx.save();
            ctx.font         = icon.fontWeight + " " + fontSize + "px '" + icon.fontFamily + "'";
            ctx.textAlign    = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle    = iconColor;
            ctx.fillText(icon.char, cx, cy);
            ctx.restore();
        }
    };

    // ================================================================== //
    //  Hit Testing & Event Handlers                                        //
    // ================================================================== //

    /**
     * Tests whether a point (in canvas coordinates) hits any clickable body.
     * Checks planets in reverse order (topmost-rendered wins), then the sun.
     *
     * @param {number} cx - X coordinate in canvas space
     * @param {number} cy - Y coordinate in canvas space
     * @returns {Object|null} The hit body config, or null
     */
    SolarSystem.prototype._hitTest = function (cx, cy) {
        var bodies  = this._options.bodies;
        var scale   = this._scale;
        var elapsed = this._currentElapsed || 0;
        var sunX    = this._sunX;
        var sunY    = this._sunY;

        // Check planets (reverse order — topmost drawn body wins)
        for (var i = bodies.length - 1; i >= 0; i--) {
            var b     = bodies[i];
            var angle = (b.startAngle * PI / 180) + (TAU * elapsed / b.period);
            var bx    = sunX + b.orbitRadius * scale * Math.cos(angle);
            var by    = sunY - b.orbitRadius * scale * Math.sin(angle);
            var br    = b.radius * scale;
            var dx    = cx - bx;
            var dy    = cy - by;

            // Use slightly enlarged hit area (1.25x radius) for easier clicking
            var hitR = br * 1.25;
            if (dx * dx + dy * dy <= hitR * hitR) {
                return b;
            }
        }

        // Check sun
        var sun  = this._options.sun;
        var sr   = sun.radius * scale;
        var sdx  = cx - sunX;
        var sdy  = cy - sunY;
        var sunHitR = sr * 1.25;
        if (sdx * sdx + sdy * sdy <= sunHitR * sunHitR) {
            return sun;
        }

        return null;
    };

    /**
     * Translates a mouse/touch event to canvas-space coordinates, accounting
     * for CSS scaling (canvas element vs. canvas buffer dimensions).
     *
     * @param {MouseEvent} e
     * @returns {{ x: number, y: number }}
     */
    SolarSystem.prototype._canvasCoords = function (e) {
        var rect = this._canvas.getBoundingClientRect();
        var scaleX = this._canvas.width  / rect.width;
        var scaleY = this._canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top)  * scaleY
        };
    };

    /**
     * Canvas click handler. Navigates immediately to the clicked body's
     * link URL with no delay. Acts as a fallback for simple clicks.
     */
    SolarSystem.prototype._onClick = function (e) {
        var coords = this._canvasCoords(e);
        var hit    = this._hitTest(coords.x, coords.y);

        if (hit && hit.link) {
            global.location.href = hit.link;
        }
    };

    /**
     * Canvas mousedown handler. Sets press state for rim color change only
     * (white in dark mode, black in light mode). Does NOT trigger animation.
     */
    SolarSystem.prototype._onMouseDown = function (e) {
        if (this._hoveredBody && this._hoveredBody.link) {
            this._pressedBody = this._hoveredBody;
        }
    };

    /**
     * Document mouseup handler. Clears press state (rim reverts to lighter
     * body color). Navigates to the body's link if still hovering.
     */
    SolarSystem.prototype._onMouseUp = function (e) {
        if (!this._pressedBody || !this._canvas) return;

        var pressedBody   = this._pressedBody;
        this._pressedBody = null;

        // Navigate if cursor is still over the pressed body
        if (this._hoveredBody === pressedBody && pressedBody.link) {
            global.location.href = pressedBody.link;
        }
    };

    /**
     * Canvas touchstart handler. Simulates hover-enter (starts grow animation)
     * and press (white/black rim color) for touch interactions.
     */
    SolarSystem.prototype._onTouchStart = function (e) {
        if (!e.touches || !e.touches.length) return;

        var touch  = e.touches[0];
        var coords = this._canvasCoords(touch);
        var hit    = this._hitTest(coords.x, coords.y);

        if (hit && hit.link) {
            e.preventDefault(); // Prevent scroll / long-press menu

            // Simulate hover enter — start grow animation
            this._hoveredBody     = hit;
            this._lastHoveredBody = hit;
            this._hoverAnimState  = "growing";
            this._hoverAnimStart  = performance.now();

            // Set press state for color change
            this._pressedBody = hit;
        }
    };

    /**
     * Document touchend handler. Navigates to the body's link if the touch
     * ends over a linkable body. Otherwise starts the shrink animation.
     */
    SolarSystem.prototype._onTouchEnd = function (e) {
        if (!this._pressedBody || !this._canvas) return;

        var pressedBody   = this._pressedBody;
        this._pressedBody = null;

        var touch = e.changedTouches && e.changedTouches[0];
        if (touch) {
            var coords = this._canvasCoords(touch);
            var hit    = this._hitTest(coords.x, coords.y);

            if (hit && hit.link) {
                // Clear hover state and navigate
                this._hoveredBody    = null;
                this._hoverAnimState = null;
                global.location.href = hit.link;
                return;
            }
        }

        // Released outside the body — clear hover and start shrink
        this._hoveredBody = null;
        this._startHoverShrink();
    };

    /**
     * Transitions the hover animation into the "shrinking" state.
     * Computes the current interpolated rim width to shrink from.
     * @private
     */
    SolarSystem.prototype._startHoverShrink = function () {
        var now       = performance.now();
        var baseWidth = this._options.hoverStyle.width;

        if (this._hoverAnimState === "growing") {
            // Shrink from current interpolated width (mid-grow)
            var gt = Math.min((now - this._hoverAnimStart) / HOVER_GROW_MS, 1.0);
            this._hoverShrinkFrom = baseWidth + (HOVER_MAX_WIDTH - baseWidth) * gt;
        } else {
            // Was fully grown or idle — shrink from max
            this._hoverShrinkFrom = HOVER_MAX_WIDTH;
        }

        this._hoverAnimState = "shrinking";
        this._hoverAnimStart = now;
    };

    /**
     * Canvas mousemove handler. Updates cursor style and triggers hover
     * grow/shrink animations when the cursor enters or leaves a body.
     */
    SolarSystem.prototype._onMouseMove = function (e) {
        var coords  = this._canvasCoords(e);
        var hit     = this._hitTest(coords.x, coords.y);
        var hitBody = (hit && hit.link) ? hit : null;

        var prevHovered = this._hoveredBody;

        if (hitBody) {
            this._canvas.style.cursor = "pointer";
            this._hoveredBody = hitBody;

            if (hitBody !== prevHovered) {
                // Entered a (new) body — start grow animation
                this._lastHoveredBody = hitBody;
                this._hoverAnimState  = "growing";
                this._hoverAnimStart  = performance.now();
            }
        } else {
            this._canvas.style.cursor = "default";
            this._hoveredBody = null;

            if (prevHovered) {
                // Left a body — start shrink animation
                this._startHoverShrink();
            }

            // Clear press state when cursor leaves all bodies
            this._pressedBody = null;
        }
    };

    /**
     * Window resize handler. Recomputes canvas dimensions based on the
     * canvas's parent container width.
     */
    SolarSystem.prototype._onResize = function () {
        var container = this._canvas.parentElement;
        if (!container) return;

        var width  = Math.min(container.clientWidth, 600);
        var height = Math.min(width * 0.8, 400);

        this.resize(width, height);
    };

    /**
     * Visibility change handler. Pauses animation when the page is hidden
     * (e.g., tab switch) and resumes when visible again. This saves CPU
     * and prevents large elapsed-time jumps after returning to the tab.
     */
    SolarSystem.prototype._onVisibilityChange = function () {
        if (document.hidden) {
            // Only pause if we were actively animating
            if (this._animationId !== null) {
                this._wasRunning = true;
                this.stop();
            }
        } else {
            // Resume if we paused due to visibility
            if (this._wasRunning) {
                this._wasRunning = false;
                this.start();
            }
        }
    };

    // ================================================================== //
    //  Export                                                               //
    // ================================================================== //

    global.SolarSystem = SolarSystem;

})(window);
