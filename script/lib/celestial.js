// Celestial Sphere Rendering Library — script/lib/celestial.js
// A standalone, zero-dependency Canvas 2D library for rendering illuminated
// celestial bodies (moon, planet, star). Exposes a global CelestialSphere
// constructor via an IIFE.
//
// Usage:
//   var sphere = new CelestialSphere(canvasElement, { illumination: 0.75 });
//   sphere.render();
//
// Rendering layers (back to front):
//   1. Background fill (optional)
//   2. Base sphere (solid color circle)
//   3. 3D shading gradient (radial gradient for depth)
//   4. Phase shadow (terminator ellipse)
//   5. Limb edge stroke (optional)

(function (global) {
    "use strict";

    // ================================================================== //
    //  Default Configuration                                              //
    // ================================================================== //

    var DEFAULTS = {
        radius:           null,       // Auto-fit to canvas if null
        color:            "#C8C8C8",  // Base body color (lit surface)
        shadowColor:      "#1a1a2e",  // Dark side / shadow color
        edgeColor:        null,       // Optional limb outline color
        edgeWidth:        1.5,        // Limb stroke thickness (px)
        illumination:     1.0,        // Fraction illuminated: 0.0–1.0
        waxing:           true,       // true = right side lit (Northern Hemisphere)
        shading:          true,       // Apply 3D gradient shading
        shadingIntensity: 0.25,       // Strength of 3D gradient (0.0–1.0)
        background:       null,       // Canvas background (null = transparent)
        image:            null,       // Optional image overlay (HTMLImageElement, URL string, or null)
        shadowOpacity:    1.0         // Shadow alpha: 0.0 (invisible) – 1.0 (opaque)
    };

    // ================================================================== //
    //  Constructor                                                         //
    // ================================================================== //

    /**
     * Creates a CelestialSphere renderer bound to a canvas element.
     *
     * @param {HTMLCanvasElement} canvas - The canvas element to render onto.
     * @param {Object} [options]        - Configuration options (see DEFAULTS).
     */
    function CelestialSphere(canvas, options) {
        if (!canvas || !canvas.getContext) {
            throw new Error("CelestialSphere: a valid <canvas> element is required.");
        }

        this._canvas = canvas;
        this._ctx = canvas.getContext("2d");

        // Merge user options with defaults
        var opts = options || {};
        this._color            = opts.color            || DEFAULTS.color;
        this._shadowColor      = opts.shadowColor      || DEFAULTS.shadowColor;
        this._edgeColor        = (opts.edgeColor !== undefined) ? opts.edgeColor : DEFAULTS.edgeColor;
        this._edgeWidth        = Math.max(0, Number(opts.edgeWidth !== undefined ? opts.edgeWidth : DEFAULTS.edgeWidth) || 0);
        this._illumination     = clamp(opts.illumination !== undefined ? opts.illumination : DEFAULTS.illumination, 0, 1);
        this._waxing           = (opts.waxing !== undefined) ? !!opts.waxing : DEFAULTS.waxing;
        this._shading          = (opts.shading !== undefined) ? !!opts.shading : DEFAULTS.shading;
        this._shadingIntensity = clamp(opts.shadingIntensity !== undefined ? opts.shadingIntensity : DEFAULTS.shadingIntensity, 0, 1);
        this._background       = (opts.background !== undefined) ? opts.background : DEFAULTS.background;

        this._shadowOpacity    = clamp(opts.shadowOpacity !== undefined ? opts.shadowOpacity : DEFAULTS.shadowOpacity, 0, 1);

        // Load image overlay (HTMLImageElement, URL string, or null)
        this._initImage(opts.image);

        // Compute center and radius
        this._cx = this._canvas.width / 2;
        this._cy = this._canvas.height / 2;
        this._radius = (opts.radius != null)
            ? opts.radius
            : Math.min(this._canvas.width, this._canvas.height) / 2 - 4;
    }

    // ================================================================== //
    //  Utility                                                            //
    // ================================================================== //

    /**
     * Clamps a numeric value between min and max.
     */
    function clamp(val, min, max) {
        if (val < min) return min;
        if (val > max) return max;
        return val;
    }

    /**
     * Returns true if the given image is fully loaded and ready to draw.
     *
     * @param {HTMLImageElement|null} img
     * @returns {boolean}
     */
    function isImageReady(img) {
        return img && img.complete && img.naturalWidth > 0;
    }

    // ================================================================== //
    //  Chainable Setters                                                  //
    // ================================================================== //
    //  Each setter validates input, stores the value, and returns `this`
    //  for chaining. They do NOT auto-render — call render() after, or
    //  use update() for batch-set + auto-render.

    CelestialSphere.prototype.setIllumination = function (value) {
        this._illumination = clamp(Number(value) || 0, 0, 1);
        return this;
    };

    CelestialSphere.prototype.setWaxing = function (value) {
        this._waxing = !!value;
        return this;
    };

    CelestialSphere.prototype.setColor = function (color) {
        this._color = color;
        return this;
    };

    CelestialSphere.prototype.setShadowColor = function (color) {
        this._shadowColor = color;
        return this;
    };

    CelestialSphere.prototype.setRadius = function (r) {
        this._radius = Math.max(0, Number(r) || 0);
        return this;
    };

    CelestialSphere.prototype.setShading = function (enabled) {
        this._shading = !!enabled;
        return this;
    };

    CelestialSphere.prototype.setShadingIntensity = function (v) {
        this._shadingIntensity = clamp(Number(v) || 0, 0, 1);
        return this;
    };

    CelestialSphere.prototype.setEdgeColor = function (color) {
        this._edgeColor = color || null;
        return this;
    };

    CelestialSphere.prototype.setEdgeWidth = function (width) {
        this._edgeWidth = Math.max(0, Number(width) || 0);
        return this;
    };

    CelestialSphere.prototype.setBackground = function (color) {
        this._background = color || null;
        return this;
    };

    CelestialSphere.prototype.setShadowOpacity = function (value) {
        this._shadowOpacity = clamp(Number(value) || 0, 0, 1);
        return this;
    };

    /**
     * Sets the image overlay for the sphere surface.
     * Accepts an HTMLImageElement, a URL string, or null to clear.
     * Chainable — does NOT auto-render. Call render() after, or use update().
     *
     * @param {HTMLImageElement|string|null} img
     * @returns {CelestialSphere} this
     */
    CelestialSphere.prototype.setImage = function (img) {
        this._initImage(img);
        return this;
    };

    /**
     * Internal helper to initialize the image property.
     * If a URL string is given, creates a new Image element and sets up an
     * onload callback that triggers a re-render when the image is ready.
     * If an HTMLImageElement is given, stores it directly.
     * If null/undefined, clears the image (falls back to flat color).
     *
     * @param {HTMLImageElement|string|null|undefined} imageOption
     */
    CelestialSphere.prototype._initImage = function (imageOption) {
        if (typeof imageOption === "string") {
            var self = this;
            this._image = new Image();
            this._image.onload = function () { self.render(); };
            this._image.src = imageOption;
        } else {
            this._image = imageOption || null;
        }
    };

    // ================================================================== //
    //  Batch Update                                                       //
    // ================================================================== //

    /**
     * Applies multiple property updates at once, then auto-calls render().
     * Recognized keys match the constructor option names.
     *
     * @param {Object} opts - An object with any subset of configuration keys.
     */
    CelestialSphere.prototype.update = function (opts) {
        if (!opts) return;

        // Map of option key -> setter method name
        var setters = {
            illumination:     "setIllumination",
            waxing:           "setWaxing",
            color:            "setColor",
            shadowColor:      "setShadowColor",
            radius:           "setRadius",
            shading:          "setShading",
            shadingIntensity: "setShadingIntensity",
            edgeColor:        "setEdgeColor",
            edgeWidth:        "setEdgeWidth",
            background:       "setBackground",
            image:            "setImage",
            shadowOpacity:    "setShadowOpacity"
        };

        for (var key in setters) {
            if (setters.hasOwnProperty(key) && opts[key] !== undefined) {
                this[setters[key]](opts[key]);
            }
        }

        this.render();
    };

    // ================================================================== //
    //  Rendering                                                          //
    // ================================================================== //

    /**
     * Renders the celestial sphere onto the canvas. Clears the canvas first,
     * then draws all layers in order:
     *   1. Background
     *   2. Base sphere
     *   3. 3D shading gradient
     *   4. Phase shadow (terminator)
     *   5. Edge/limb stroke
     */
    CelestialSphere.prototype.render = function () {
        var ctx = this._ctx;
        var cx  = this._cx;
        var cy  = this._cy;
        var R   = this._radius;
        var w   = this._canvas.width;
        var h   = this._canvas.height;

        // Clear the entire canvas
        ctx.clearRect(0, 0, w, h);

        // ---- Layer 1: Background (optional) ---- //
        if (this._background) {
            ctx.fillStyle = this._background;
            ctx.fillRect(0, 0, w, h);
        }

        // ---- Layer 2: Base sphere (flat color or image overlay) ---- //
        if (isImageReady(this._image)) {
            // Image is loaded — draw it clipped to the sphere circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.clip();

            // "Cover" scaling: scale the image so it fully covers the
            // sphere circle, handling non-square images (e.g. 992×1078).
            var img = this._image;
            var scale = Math.max(2 * R / img.naturalWidth, 2 * R / img.naturalHeight);
            var drawWidth  = img.naturalWidth  * scale;
            var drawHeight = img.naturalHeight * scale;
            var drawX = cx - drawWidth  / 2;
            var drawY = cy - drawHeight / 2;
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

            ctx.restore();
        } else {
            // No image or image not yet loaded — flat color fill (fallback)
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.fillStyle = this._color;
            ctx.fill();
        }

        // ---- Layer 3: 3D shading gradient (optional) ---- //
        if (this._shading) {
            this._renderShading(ctx, cx, cy, R);
        }

        // ---- Layer 4: Phase shadow (terminator) ---- //
        this._renderShadow(ctx, cx, cy, R);

        // ---- Layer 5: Edge/limb stroke (optional) ---- //
        if (this._edgeColor && this._edgeWidth > 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, R - this._edgeWidth / 2, 0, Math.PI * 2);
            ctx.strokeStyle = this._edgeColor;
            ctx.lineWidth = this._edgeWidth;
            ctx.stroke();
        }
    };

    /**
     * Renders the 3D shading gradient (Layer 3).
     * Creates a radial gradient offset toward the upper-left to simulate
     * a highlight, with limb darkening at the edges.
     */
    CelestialSphere.prototype._renderShading = function (ctx, cx, cy, R) {
        var intensity = this._shadingIntensity;

        // Inner gradient center: offset toward upper-left for highlight
        var grad = ctx.createRadialGradient(
            cx - R * 0.3, cy - R * 0.3, R * 0.05,  // inner center + radius
            cx, cy, R                                 // outer center + radius
        );

        grad.addColorStop(0.0, "rgba(255, 255, 255, " + (intensity * 0.5) + ")");
        grad.addColorStop(0.5, "rgba(255, 255, 255, 0)");
        grad.addColorStop(1.0, "rgba(0, 0, 0, " + (intensity * 0.6) + ")");

        // Clip to sphere and fill
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = grad;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        ctx.restore();
    };

    /**
     * Renders the phase shadow / terminator (Layer 4).
     *
     * The terminator is the boundary between the lit and unlit hemispheres.
     * When projected onto a 2D disc, it appears as an ellipse that shares
     * the same vertical axis as the disc. The ellipse's horizontal radius
     * depends on the illumination fraction.
     *
     * For waning phases (light from left), the drawing is mirrored horizontally.
     */
    CelestialSphere.prototype._renderShadow = function (ctx, cx, cy, R) {
        var f = this._illumination;
        var PI = Math.PI;

        // Special cases: avoid floating-point rendering artifacts
        if (f < 0.001) {
            // Fully dark: fill entire sphere with shadow
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, PI * 2);
            ctx.fillStyle = this._shadowColor;
            ctx.globalAlpha = this._shadowOpacity;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            return;
        }
        if (f > 0.999) {
            // Fully lit: no shadow needed
            return;
        }

        // Compute terminator ellipse horizontal radius
        // k = 1 - 2*f  =>  k ranges from +1 (new) to -1 (full)
        var k = 1 - 2 * f;
        var terminatorRx = Math.abs(k) * R;

        // Mirror for waning (light from left)
        ctx.save();
        if (!this._waxing) {
            ctx.translate(cx, cy);
            ctx.scale(-1, 1);
            ctx.translate(-cx, -cy);
        }

        // Build shadow path:
        // For waxing (light from right), shadow covers the LEFT side.
        //   1. Arc: left semicircle from north pole counterclockwise to south pole
        //   2. Ellipse: terminator from south pole back to north pole
        ctx.beginPath();

        // Left semicircle: from north (-PI/2) counterclockwise to south (+PI/2)
        ctx.arc(cx, cy, R, -PI / 2, PI / 2, true);

        // Terminator ellipse: from south pole back to north pole
        // Direction depends on illumination fraction:
        //   f < 0.5 (crescent): terminator curves RIGHT of center => counterclockwise (true)
        //                       to enclose the LARGE shadow area (most of the disc)
        //   f > 0.5 (gibbous):  terminator curves LEFT of center  => clockwise (false)
        //                       to enclose the SMALL shadow area (crescent on far left)
        var anticlockwise = (f < 0.5);
        ctx.ellipse(cx, cy, terminatorRx, R, 0, PI / 2, -PI / 2, anticlockwise);

        ctx.fillStyle = this._shadowColor;
        ctx.globalAlpha = this._shadowOpacity;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.restore();
    };

    // ================================================================== //
    //  Cleanup                                                            //
    // ================================================================== //

    /**
     * Clears the canvas and nullifies internal references.
     * After calling destroy(), the instance should not be reused.
     */
    CelestialSphere.prototype.destroy = function () {
        if (this._ctx && this._canvas) {
            this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        }
        this._canvas = null;
        this._ctx = null;
    };

    // ================================================================== //
    //  Export                                                              //
    // ================================================================== //

    global.CelestialSphere = CelestialSphere;

})(window);
