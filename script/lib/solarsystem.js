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
//   6. Hover / Click rims (flat stroked circles around hovered/clicked bodies)

(function (global) {
    "use strict";

    // ================================================================== //
    //  Default Configuration                                              //
    // ================================================================== //

    var PI  = Math.PI;
    var TAU = 2 * PI;

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
        clickStyle: {
            color: "#E7E247",                           // Click feedback color (yellow accent)
            width: 3,                                   // Click rim thickness
            gap:   4,                                   // Gap between sphere edge and rim
            delay: 250                                  // ms to show click feedback before navigating
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

        // Click animation state
        this._clickedBody   = null;   // { body: <config>, time: <performance.now timestamp> }
        this._clickTimeout  = null;   // setTimeout ID for delayed navigation

        // Compute layout values
        this._recomputeLayout();

        // Load images for sun and all bodies
        this._loadImages();

        // Bind event handlers (store references for removal in destroy())
        var self = this;

        this._onClickBound = function (e) { self._onClick(e); };
        this._onMoveBound  = function (e) { self._onMouseMove(e); };
        this._onResizeBound = function ()  { self._onResize(); };
        this._onVisibilityBound = function () { self._onVisibilityChange(); };

        this._canvas.addEventListener("click",     this._onClickBound,     false);
        this._canvas.addEventListener("mousemove", this._onMoveBound,      false);
        global.addEventListener("resize",          this._onResizeBound,    false);
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

        // Clear pending click navigation
        if (this._clickTimeout) {
            clearTimeout(this._clickTimeout);
            this._clickTimeout = null;
        }
        this._clickedBody = null;

        // Remove event listeners
        this._canvas.removeEventListener("click",     this._onClickBound,     false);
        this._canvas.removeEventListener("mousemove", this._onMoveBound,      false);
        global.removeEventListener("resize",          this._onResizeBound,    false);
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
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r + gap, 0, TAU);
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
        ctx.font         = labelStyle.font;
        ctx.fillStyle    = labelStyle.color;
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";

        // Sun label
        if (sun.label) {
            ctx.fillText(sun.label, sunX, sunY + sunR + labelStyle.offset);
        }

        // Planet labels
        for (var k = 0; k < bodies.length; k++) {
            if (bodies[k].label) {
                var pos = positions[k];
                ctx.fillText(bodies[k].label, pos.x, pos.y + pos.r + labelStyle.offset);
            }
        }

        // ---- Layer 5: Hover / Click Rims ---- //
        var clickStyle = opts.clickStyle;
        var hoverStyle = opts.hoverStyle;

        // Determine which rim to draw. Click rim overrides hover rim.
        if (this._clickedBody) {
            var elapsed_ms = performance.now() - this._clickedBody.time;
            if (elapsed_ms < clickStyle.delay) {
                var cbPos = this._getBodyScreenPosition(this._clickedBody.body);
                if (cbPos) {
                    this._drawRim(ctx, cbPos.x, cbPos.y, cbPos.r,
                                  clickStyle.color, clickStyle.width, clickStyle.gap);
                }
            }
        } else if (this._hoveredBody && hoverStyle.enabled) {
            var hbPos = this._getBodyScreenPosition(this._hoveredBody);
            if (hbPos) {
                this._drawRim(ctx, hbPos.x, hbPos.y, hbPos.r,
                              hoverStyle.color, hoverStyle.width, hoverStyle.gap);
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
     * Canvas click handler. Sets click animation state and navigates
     * to the clicked body's link URL after the configured delay.
     */
    SolarSystem.prototype._onClick = function (e) {
        var coords = this._canvasCoords(e);
        var hit    = this._hitTest(coords.x, coords.y);

        if (hit && hit.link) {
            var self  = this;
            var delay = this._options.clickStyle.delay;

            // Set click animation state
            this._clickedBody = { body: hit, time: performance.now() };

            // Clear any previous pending navigation
            if (this._clickTimeout) {
                clearTimeout(this._clickTimeout);
            }

            // Navigate after delay
            this._clickTimeout = setTimeout(function () {
                self._clickedBody  = null;
                self._clickTimeout = null;
                global.location.href = hit.link;
            }, delay);
        }
    };

    /**
     * Canvas mousemove handler. Updates the cursor to "pointer" when
     * hovering over a clickable body.
     */
    SolarSystem.prototype._onMouseMove = function (e) {
        var coords = this._canvasCoords(e);
        var hit    = this._hitTest(coords.x, coords.y);

        if (hit && hit.link) {
            this._canvas.style.cursor = "pointer";
            this._hoveredBody = hit;
        } else {
            this._canvas.style.cursor = "default";
            this._hoveredBody = null;
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
