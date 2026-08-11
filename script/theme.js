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
    var ICON_BASE_CLASS = "fas";
    var ICON_DARK_CLASS = "fa-sun";
    var ICON_LIGHT_CLASS = "fa-moon";

    /**
     * Replaces a toggle's icon using only fixed DOM operations.
     */
    function setButtonIcon(button, theme) {
        var icon;

        if (!button) {
            return;
        }

        button.replaceChildren();
        icon = document.createElement("i");
        icon.classList.add(ICON_BASE_CLASS);
        icon.classList.add(theme === "light" ? ICON_LIGHT_CLASS : ICON_DARK_CLASS);
        button.appendChild(icon);
    }

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
            setButtonIcon(button, theme);
        } else {
            document.body.classList.remove(BODY_CLASS);
            setButtonIcon(button, theme);
        }
        var sidebarBtn = document.getElementById("themeToggleSidebar");
        setButtonIcon(sidebarBtn, theme);
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
