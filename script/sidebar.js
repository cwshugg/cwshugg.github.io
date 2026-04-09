(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {
        var toggle = document.getElementById("sidebarToggle");
        var close = document.getElementById("sidebarClose");
        var sidebar = document.getElementById("sidebar");
        var overlay = document.getElementById("sidebarOverlay");

        if (!toggle || !sidebar) return;

        function openSidebar() {
            sidebar.classList.add("active");
            overlay.classList.add("active");
            document.body.style.overflow = "hidden";
        }

        function closeSidebar() {
            sidebar.classList.remove("active");
            overlay.classList.remove("active");
            document.body.style.overflow = "";
        }

        toggle.addEventListener("click", openSidebar);
        if (close) close.addEventListener("click", closeSidebar);
        if (overlay) overlay.addEventListener("click", closeSidebar);

        // Sync sidebar theme toggle with main toggle
        var themeToggleSidebar = document.getElementById("themeToggleSidebar");
        var themeToggleMain = document.getElementById("themeToggle");

        if (themeToggleSidebar && themeToggleMain) {
            themeToggleSidebar.addEventListener("click", function () {
                themeToggleMain.click();
                // Sync the sidebar button icon with the main one
                setTimeout(function () {
                    themeToggleSidebar.innerHTML = themeToggleMain.innerHTML;
                }, 10);
            });
        }
    });
})();
