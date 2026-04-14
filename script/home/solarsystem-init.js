// Solar System Homepage Initialization — script/home/solarsystem-init.js
// Configures and starts the SolarSystem animation on the homepage canvas.
// This script must load AFTER script/lib/solarsystem.js.

(function () {
    "use strict";

    var canvas = document.getElementById("solarsystem-canvas");
    if (!canvas || typeof SolarSystem === "undefined") return;

    // ---- Responsive canvas sizing ---- //
    var container = canvas.parentElement;
    var width     = Math.min(container.clientWidth, 600);
    var height    = Math.min(width * 0.8, 400);

    // Add bottom/top margin so planet labels aren't clipped when a body
    // is at the very bottom (or top) of its orbit.  Compute the extra
    // space needed from the outermost orbit config:
    //   needed_half = orbitRadius·scale + bodyRadius·scale + labelOffset + fontSize
    // The base height already accounts for the orbit, so we only need to
    // cover the "overflow" portion (body radius scaled + label metrics).
    var _refWidth      = 500;   // must match referenceWidth passed to SolarSystem
    var _scale         = width / _refWidth;
    var _maxOrbitR     = 140;   // outermost orbit radius (px at reference width)
    var _maxBodyR      = 18;    // largest planet radius
    var _labelOffset   = 8;     // labelStyle.offset
    var _labelFontSize = 16;    // label font size in px
    var _descenderPad  = 6;     // extra px for text descenders + safety margin
    var _neededHalf    = _maxOrbitR * _scale + _maxBodyR * _scale
                       + _labelOffset + _labelFontSize + _descenderPad;
    var _minHeight     = Math.ceil(_neededHalf * 2);
    height = Math.max(height, _minHeight);

    canvas.width  = width;
    canvas.height = height;

    // ---- Resolve font from CSS custom property ---- //
    // Canvas cannot resolve CSS variables, so we read the computed font-family
    // from the document body and build a concrete font string.
    var bodyFont = getComputedStyle(document.documentElement).getPropertyValue("--font-body").trim() || getComputedStyle(document.body).fontFamily;
    bodyFont = "16px " + bodyFont;

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

    // ---- Create and start the solar system ---- //
    var system = new SolarSystem(canvas, {
        sun: {
            radius:     40,
            color:      "#FFD700",
            glowColor:  "rgba(255, 215, 0, 0.12)",
            glowRadius: 0,
            link:       "/me",
            label:      "Me"
        },
        bodies: [
            {
                radius:      18,
                image:       "/images/astro/earth.png",
                color:       "#4A90D9",
                link:        "/tools",
                label:       "Tools",
                orbitRadius: 140,
                period:      90,
                startAngle:  0
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
        clickStyle: {
            color: "#E7E247",
            width: 3,
            gap:   4,
            delay: 250
        },
        background:     null,    // Transparent — page background shows through
        animate:        true,
        referenceWidth: 500
    });

    system.start();

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
