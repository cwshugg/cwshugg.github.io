// Solar System Homepage Initialization — script/home/solarsystem-init.js
// Configures and starts the SolarSystem animation on the homepage canvas.
// This script must load AFTER script/lib/solarsystem.js.

(function () {
    "use strict";

    var canvas = document.getElementById("solarsystem-canvas");
    if (!canvas || typeof SolarSystem === "undefined") return;

    // ---- Layout constants (must match SolarSystem config below) ---- //
    // referenceWidth was increased from 600 → 860 to accommodate the new
    // GitHub orbit at radius 360.  The outermost reach is now
    // 360 + 36 = 396 px at scale 1.  At REFERENCE_WIDTH = 860 the desktop
    // scale is 600 / 860 ≈ 0.698, giving a reach of ~276 px — identical to
    // the original (240 + 36 = 276) reach at scale 1 with the old 600 ref
    // width.  This keeps the ~24 px buffer within the 300 px half-canvas.
    var REFERENCE_WIDTH = 860;
    var MAX_ORBIT_R     = 360;   // outermost orbit radius (px at reference width)
    var MAX_BODY_R      = 36;    // largest body radius
    var LABEL_OFFSET    = 8;     // labelStyle.offset
    var LABEL_FONT_SIZE = 44;    // label font size (px)
    var LABEL_CLEARANCE = 10;    // descender + safety margin below labels
    var H_PADDING       = 10;    // minimum horizontal buffer each side
    var V_PADDING       = 4;     // minimum vertical buffer top & bottom

    // ---- Responsive canvas sizing ---- //
    // Compute canvas dimensions that guarantee no orbit/label clipping on
    // ANY side.  The sun is always centered in the canvas.
    //
    // Horizontal: halfCanvas >= (maxOrbitR + maxBodyR) × scale + H_PADDING
    // Vertical:   halfCanvas >= (maxOrbitR + maxBodyR) × scale + labelSpace + V_PADDING
    //
    // With REFERENCE_WIDTH = 860 and D = 396 the desktop scale is
    // 600 / 860 ≈ 0.698, giving a reach of ~276 px.  The half-canvas is
    // 300 px, so there is a ~24 px buffer plus the additive H_PADDING.

    function computeCanvasSize(containerWidth) {
        // On mobile viewports (≤ 600 px) render at ~65 % size (was 50 %).
        var isMobile    = window.innerWidth <= 600;
        var maxWidth    = isMobile ? 400 : 600;
        var targetWidth = Math.min(containerWidth, maxWidth);

        // Scale factor the library will use for this canvas width
        var scale    = targetWidth / REFERENCE_WIDTH;
        var maxReach = (MAX_ORBIT_R + MAX_BODY_R) * scale;

        // Ensure canvas is wide enough (safety net for very small containers)
        var minWidth = Math.ceil(2 * maxReach + 2 * H_PADDING);
        var width    = Math.max(targetWidth, minWidth);

        // Recompute reach at the final width (matters when minWidth won)
        scale    = width / REFERENCE_WIDTH;
        maxReach = (MAX_ORBIT_R + MAX_BODY_R) * scale;

        // Label space — labels are drawn in absolute px, not scaled
        var labelSpace = LABEL_FONT_SIZE + LABEL_OFFSET + LABEL_CLEARANCE;

        // Height must fit orbit + labels on bottom AND orbit on top
        var height = Math.ceil(2 * (maxReach + labelSpace + V_PADDING));

        return { width: width, height: height };
    }

    var container = canvas.parentElement;
    var size      = computeCanvasSize(container.clientWidth);
    canvas.width  = size.width;
    canvas.height = size.height;

    // ---- Resolve font from CSS custom property ---- //
    // Canvas cannot resolve CSS variables, so we read the computed font-family
    // from the document body and build a concrete font string.
    var bodyFont = getComputedStyle(document.documentElement).getPropertyValue("--font-body").trim() || getComputedStyle(document.body).fontFamily;
    bodyFont = LABEL_FONT_SIZE + "px " + bodyFont;

    // ---- Theme-aware color helpers ---- //
    // Detect light/dark mode. theme.js may not have run yet (it loads after
    // extra_js), so check localStorage first, then fall back to the class.
    function isLightMode() {
        try {
            if (localStorage.getItem("theme") === "light") return true;
        } catch (_e) { /* ignore */ }
        return document.body.classList.contains("light-mode");
    }

    function themeColors(light) {
        return {
            orbit:    light ? "rgba(0, 0, 0, 0.15)"   : "rgba(255, 255, 255, 0.2)",
            label:    light ? "rgba(0, 0, 0, 0.7)"    : "rgba(255, 255, 255, 0.8)",
            hoverRim: light ? "rgba(0, 0, 0, 0.5)"    : "rgba(255, 255, 255, 0.7)"
        };
    }

    var colors = themeColors(isLightMode());

    // ---- Resolve social URLs from footer links (avoid duplication) ---- //
    var githubLink   = document.querySelector('a[title="GitHub"]');
    var linkedinLink = document.querySelector('a[title="LinkedIn"]');
    var githubUrl    = githubLink   ? githubLink.href   : "https://github.com/cwshugg";
    var linkedinUrl  = linkedinLink ? linkedinLink.href  : "https://www.linkedin.com/in/connor-shugg/";

    // ---- Create and start the solar system ---- //
    var system = new SolarSystem(canvas, {
        sun: {
            radius:     80,
            image:      null,
            color:      "#FFCB77",
            glowColor:  "rgba(255, 215, 0, 0.12)",
            glowRadius: 0,
            link:       "/me",
            label:      "Me",
            icon:       { char: "\uf007", fontFamily: "Font Awesome 5 Free", fontWeight: "900" },
            iconColor:  "#2D2B28"
        },
        bodies: [
            {
                radius:      36,
                image:       null,
                color:       "#FE6D73",
                link:        "/tools",
                label:       "Tools",
                orbitRadius: 240,
                period:      90,
                startAngle:  0,
                icon:        { char: "\uf0ad", fontFamily: "Font Awesome 5 Free", fontWeight: "900" },
                iconColor:   "#2D2B28"
            },
            {
                radius:      36,
                image:       null,
                color:       "#227C9D",
                link:        linkedinUrl,
                label:       "LinkedIn",
                orbitRadius: 300,
                period:      105,
                startAngle:  120,
                external:    true,
                icon:        { char: "\uf0e1", fontFamily: "Font Awesome 5 Brands", fontWeight: "400" },
                iconColor:   "#2D2B28"
            },
            {
                radius:      36,
                image:       null,
                color:       "#1a1a1a",
                link:        githubUrl,
                label:       "GitHub",
                orbitRadius: 360,
                period:      120,
                startAngle:  240,
                external:    true,
                icon:        { char: "\uf09b", fontFamily: "Font Awesome 5 Brands", fontWeight: "400" },
                iconColor:   "#F5F5F5"
            }
        ],
        orbitStyle: {
            color: colors.orbit,
            width: 3
        },
        labelStyle: {
            font:   bodyFont,
            color:  colors.label,
            offset: 8
        },
        hoverStyle: {
            enabled: true,
            color:   colors.hoverRim,
            width:   2,
            gap:     4
        },
        background:     null,    // Transparent — page background shows through
        animate:        true,
        referenceWidth: REFERENCE_WIDTH
    });

    // ---- Explicitly load Font Awesome webfonts, then start ---- //
    // Canvas fillText() does NOT trigger CSS @font-face loading the way DOM
    // elements do.  Therefore document.fonts.ready can resolve *before* the
    // FA fonts have even been requested.  We use the FontFace API to fetch
    // the woff2 files directly and register them with the document so that
    // ctx.font / ctx.fillText() can use them reliably on the first frame.

    function loadFAFonts(callback) {
        if (typeof FontFace === "undefined") {
            // FontFace API unavailable — fall back to a simple delay so the
            // CSS @font-face has time to load from the stylesheet.
            setTimeout(callback, 500);
            return;
        }

        var baseUrl = "https://use.fontawesome.com/releases/v5.15.4/webfonts/";
        var fonts   = [
            new FontFace(
                "Font Awesome 5 Free",
                "url(" + baseUrl + "fa-solid-900.woff2) format('woff2')",
                { weight: "900", style: "normal" }
            ),
            new FontFace(
                "Font Awesome 5 Brands",
                "url(" + baseUrl + "fa-brands-400.woff2) format('woff2')",
                { weight: "400", style: "normal" }
            )
        ];

        var loaded = 0;
        var total  = fonts.length;

        fonts.forEach(function (face) {
            face.load().then(function (loaded_face) {
                document.fonts.add(loaded_face);
            }).catch(function (err) {
                // Log but don't block — the system can still start without
                // icons; labels provide a fallback.
                console.warn("FA font load failed:", err);
            }).then(function () {
                // .then() after .catch() acts as a "finally" in ES5
                loaded++;
                if (loaded === total) { callback(); }
            });
        });
    }

    loadFAFonts(function () { system.start(); });

    // ---- Override library resize handler ---- //
    // The library's built-in _onResize uses a hard-coded 600 / 0.8 formula
    // that doesn't account for full-side padding or mobile scaling.  Replace
    // it so resize / orientation-change recalculates properly.
    system._onResize = function () {
        var c = this._canvas.parentElement;
        if (!c) return;
        var s = computeCanvasSize(c.clientWidth);
        this.resize(s.width, s.height);
    };

    // ---- Live theme switching ---- //
    // Watch for the "light-mode" class being toggled on <body> by theme.js.
    // When it changes, update the solar system colors in place so the user
    // doesn't need to refresh the page.
    var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].attributeName === "class") {
                var light  = document.body.classList.contains("light-mode");
                var c      = themeColors(light);
                var opts   = system._options;
                opts.orbitStyle.color = c.orbit;
                opts.labelStyle.color = c.label;
                opts.hoverStyle.color = c.hoverRim;
                break;
            }
        }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
})();
