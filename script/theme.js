/**
 * theme.js — Dark/light mode toggle for shugg.dev
 *
 * Reads/writes a "theme" key in localStorage and applies/removes
 * the "light-mode" class on <body> to swap CSS custom properties.
 * Dark mode is the default.
 */
(function () {
    "use strict";

    var STORAGE_KEY = "theme";
    var BODY_CLASS = "light-mode";
    var LABEL_DARK = '<i class="fas fa-sun"></i>';   // shown in dark mode (click to go light)
    var LABEL_LIGHT = '<i class="fas fa-moon"></i>'; // shown in light mode (click to go dark)

    /**
     * Read persisted theme from localStorage.
     * Returns "light" or "dark". Default is "dark".
     */
    function getTheme() {
        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            return stored === "light" ? "light" : "dark";
        } catch (_e) {
            return "dark";
        }
    }

    /**
     * Persist the theme choice.
     */
    function persist(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (_e) {
            // Silently ignore — localStorage unavailable
        }
    }

    /**
     * Apply the visual state to the DOM.
     */
    function applyTheme(theme, button) {
        if (theme === "light") {
            document.body.classList.add(BODY_CLASS);
            if (button) {
                button.innerHTML = LABEL_LIGHT;
            }
        } else {
            document.body.classList.remove(BODY_CLASS);
            if (button) {
                button.innerHTML = LABEL_DARK;
            }
        }
    }

    // ---------------------------------------------------------------
    // Apply state as early as possible (script is at end of <body>,
    // so the DOM is available but not yet painted in most browsers).
    // ---------------------------------------------------------------
    var theme = getTheme();
    applyTheme(theme, document.getElementById("themeToggle"));

    // ---------------------------------------------------------------
    // Bind the toggle button once the DOM is fully ready.
    // ---------------------------------------------------------------
    document.addEventListener("DOMContentLoaded", function () {
        var button = document.getElementById("themeToggle");
        if (!button) {
            return;
        }

        // Re-apply in case DOMContentLoaded fires after our first
        // applyTheme call (very unlikely, but defensive).
        applyTheme(getTheme(), button);

        button.addEventListener("click", function () {
            var isLight = document.body.classList.contains(BODY_CLASS);
            var newTheme = isLight ? "dark" : "light";
            persist(newTheme);
            applyTheme(newTheme, button);
        });
    });
})();
