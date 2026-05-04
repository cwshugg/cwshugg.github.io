// Time Zone Comparison Tool — script/tools/timezones.js
// Compare times across multiple time zones using the browser's Intl API.
// Zero dependencies. All logic in an IIFE.
//
// Architecture:
//   - Uses Intl.supportedValuesOf("timeZone") for zone list
//   - Caches Intl.DateTimeFormat instances per zone (invalidated on format toggle)
//   - All DOM content rendered via textContent/createElement (never innerHTML)
//   - Persists zones + format preference to localStorage with validation

(function () {
    "use strict";

    // ================================================================== //
    //  Constants                                                          //
    // ================================================================== //


    var DEFAULT_FORMAT = 12;
    var LOCAL_STORAGE_KEY = "tz-tool-zones";
    var LOCAL_STORAGE_FMT = "tz-tool-format";
    var LOCAL_STORAGE_NICKNAMES = "tz-tool-nicknames";
    var MAX_DROPDOWN_ITEMS = 10;
    var MAX_NICKNAME_LENGTH = 50;
    var ANNOUNCE_CLEAR_MS = 3000;

    // ================================================================== //
    //  State                                                              //
    // ================================================================== //

    var state = {
        zones: [],
        referenceDate: null,
        format: 12,
        isLive: true,
        localZone: "",
        nicknames: {}
    };

    // ================================================================== //
    //  Formatter Cache                                                    //
    // ================================================================== //

    var formatterCache = {};

    function getFormatter(zone) {
        if (formatterCache[zone]) {
            return formatterCache[zone];
        }
        var options = {
            timeZone: zone,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: (state.format === 12),
            year: "numeric",
            month: "short",
            day: "numeric",
            weekday: "short",
            timeZoneName: "short"
        };
        formatterCache[zone] = new Intl.DateTimeFormat("en-US", options);
        return formatterCache[zone];
    }

    function invalidateFormatterCache() {
        formatterCache = {};
    }

    // ================================================================== //
    //  Zone List                                                          //
    // ================================================================== //

    var ALL_ZONES = null;

    function getAllZones() {
        if (!ALL_ZONES) {
            ALL_ZONES = Intl.supportedValuesOf("timeZone");
        }
        return ALL_ZONES;
    }

    // ================================================================== //
    //  Zone Abbreviation Cache                                            //
    // ================================================================== //

    var zoneAbbreviations = {};

    function buildAbbreviationCache() {
        var zones = getAllZones();
        var jan = new Date(new Date().getFullYear(), 0, 1);
        var jul = new Date(new Date().getFullYear(), 6, 1);
        for (var i = 0; i < zones.length; i++) {
            var fmt = new Intl.DateTimeFormat("en-US", {
                timeZone: zones[i],
                timeZoneName: "short"
            });
            var janParts = fmt.formatToParts(jan);
            var julParts = fmt.formatToParts(jul);
            var janAbbr = null;
            var julAbbr = null;
            for (var j = 0; j < janParts.length; j++) {
                if (janParts[j].type === "timeZoneName") {
                    janAbbr = janParts[j].value;
                    break;
                }
            }
            for (var j = 0; j < julParts.length; j++) {
                if (julParts[j].type === "timeZoneName") {
                    julAbbr = julParts[j].value;
                    break;
                }
            }
            if (janAbbr && julAbbr) {
                zoneAbbreviations[zones[i]] = janAbbr === julAbbr ? janAbbr : janAbbr + " " + julAbbr;
            } else if (janAbbr) {
                zoneAbbreviations[zones[i]] = janAbbr;
            } else if (julAbbr) {
                zoneAbbreviations[zones[i]] = julAbbr;
            }
        }
    }

    // ================================================================== //
    //  Utility Functions                                                  //
    // ================================================================== //

    function formatZoneLabel(iana) {
        var parts = iana.split("/");
        var city = parts.pop().replace(/_/g, " ");
        var region = parts.join("/");
        return city + (region ? " (" + region + ")" : "");
    }

    function getUtcOffset(iana) {
        var refDate = state.referenceDate || new Date();
        var fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: iana,
            timeZoneName: "shortOffset"
        });
        var parts = fmt.formatToParts(refDate);
        for (var i = 0; i < parts.length; i++) {
            if (parts[i].type === "timeZoneName") {
                return parts[i].value;
            }
        }
        return "";
    }

    function filterZones(query) {
        var q = query.toLowerCase();
        return getAllZones().filter(function (zone) {
            var abbr = zoneAbbreviations[zone] || "";
            return zone.toLowerCase().indexOf(q) !== -1 ||
                formatZoneLabel(zone).toLowerCase().indexOf(q) !== -1 ||
                abbr.toLowerCase().indexOf(q) !== -1;
        });
    }

    function extractTimeParts(parts) {
        var time = "";
        for (var i = 0; i < parts.length; i++) {
            var t = parts[i].type;
            if (t === "hour" || t === "minute" || t === "second") {
                time += parts[i].value;
            } else if ((t === "literal") && time.length > 0 &&
                       time.length < 8) {
                time += parts[i].value;
            } else if (t === "dayPeriod") {
                time += " " + parts[i].value;
            }
        }
        return time;
    }

    function extractDateParts(parts) {
        var weekday = "";
        var month = "";
        var day = "";
        var year = "";
        for (var i = 0; i < parts.length; i++) {
            switch (parts[i].type) {
                case "weekday": weekday = parts[i].value; break;
                case "month": month = parts[i].value; break;
                case "day": day = parts[i].value; break;
                case "year": year = parts[i].value; break;
            }
        }
        return weekday + ", " + month + " " + day + ", " + year;
    }

    function extractOffsetParts(parts) {
        for (var i = 0; i < parts.length; i++) {
            if (parts[i].type === "timeZoneName") {
                return parts[i].value;
            }
        }
        return "";
    }

    function announce(msg) {
        var el = document.getElementById("tz-live-announce");
        el.textContent = msg;
        setTimeout(function () { el.textContent = ""; }, ANNOUNCE_CLEAR_MS);
    }

    // ================================================================== //
    //  localStorage                                                       //
    // ================================================================== //

    function persist() {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.zones));
            localStorage.setItem(LOCAL_STORAGE_FMT, String(state.format));
            localStorage.setItem(LOCAL_STORAGE_NICKNAMES, JSON.stringify(state.nicknames));
        } catch (e) {
            // localStorage unavailable — silently ignore
        }
    }

    function loadPersisted() {
        var validZones = getAllZones();

        try {
            var raw = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));
            if (Array.isArray(raw)) {
                state.zones = raw.filter(function (z) {
                    return typeof z === "string" && validZones.indexOf(z) !== -1;
                });
            }
        } catch (e) {
            // Silently fall back to defaults
        }

        try {
            var fmt = parseInt(localStorage.getItem(LOCAL_STORAGE_FMT), 10);
            state.format = (fmt === 24) ? 24 : 12;
        } catch (e) {
            state.format = DEFAULT_FORMAT;
        }

        // Load nicknames
        try {
            var rawNicknames = JSON.parse(localStorage.getItem(LOCAL_STORAGE_NICKNAMES));
            if (rawNicknames && typeof rawNicknames === "object" && !Array.isArray(rawNicknames)) {
                var cleaned = {};
                var keys = Object.keys(rawNicknames);
                for (var i = 0; i < keys.length; i++) {
                    var key = keys[i];
                    var val = rawNicknames[key];
                    if (validZones.indexOf(key) !== -1 &&
                        typeof val === "string" && val.length > 0 && val.length <= MAX_NICKNAME_LENGTH) {
                        cleaned[key] = val;
                    }
                }
                state.nicknames = cleaned;
            }
        } catch (e) {
            state.nicknames = {};
        }

        // Ensure local zone is present (but don't force position)
        if (state.zones.indexOf(state.localZone) === -1) {
            state.zones.unshift(state.localZone);
        }
    }

    // ================================================================== //
    //  DOM References                                                     //
    // ================================================================== //

    var fmt12Btn, fmt24Btn;
    var timeInput, dateInput, nowBtn;
    var slider;
    var searchInput, dropdown;
    var clocksContainer;

    // ================================================================== //
    //  Rendering                                                          //
    // ================================================================== //

    function createCard(zone, index) {
        var card = document.createElement("div");
        card.className = "box tz-card";
        if (zone === state.localZone) {
            card.className += " tz-card-local";
        }
        card.setAttribute("data-zone", zone);
        card.setAttribute("draggable", "true");
        card.setAttribute("tabindex", "0");

        var header = document.createElement("div");
        header.className = "tz-card-header";

        // Drag handle
        var dragHandle = document.createElement("span");
        dragHandle.className = "tz-drag-handle";
        dragHandle.textContent = "\u2261"; // ≡
        dragHandle.setAttribute("aria-hidden", "true");

        // Left side: zone info (name + meta on single line)
        var cardInfo = document.createElement("div");
        cardInfo.className = "tz-card-info";

        var labelWrap = document.createElement("div");
        labelWrap.className = "tz-card-label-wrap";

        var label = document.createElement("span");
        label.className = "tz-card-label";

        var nickname = state.nicknames[zone];
        label.textContent = nickname ? nickname : formatZoneLabel(zone);
        labelWrap.appendChild(label);

        // Make label clickable to edit nickname
        label.classList.add("tz-card-label-editable");
        label.setAttribute("title", "Click to edit nickname");
        label.addEventListener("click", function () {
            startNicknameEdit(card, zone);
        });

        var metaEl = document.createElement("span");
        metaEl.className = "tz-card-meta";

        cardInfo.appendChild(labelWrap);
        cardInfo.appendChild(metaEl);

        // Right side: actions (local badge + remove button)
        var cardActions = document.createElement("div");
        cardActions.className = "tz-card-actions";

        // Local badge (actual DOM element)
        if (zone === state.localZone) {
            var localBadge = document.createElement("span");
            localBadge.className = "tz-card-local-badge";
            localBadge.textContent = "Local";
            cardActions.appendChild(localBadge);
        }

        var removeBtn = document.createElement("button");
        removeBtn.className = "button-nav tz-card-remove";
        removeBtn.setAttribute("aria-label", "Remove " + formatZoneLabel(zone) + " time zone");
        removeBtn.textContent = "\u00d7";

        // Don't allow removing local zone
        if (zone === state.localZone) {
            removeBtn.style.display = "none";
        }

        cardActions.appendChild(removeBtn);

        header.appendChild(dragHandle);
        header.appendChild(cardInfo);
        header.appendChild(cardActions);

        var timeEl = document.createElement("div");
        timeEl.className = "tz-card-time";

        card.appendChild(header);
        card.appendChild(timeEl);

        return card;
    }

    function updateCard(card, zone) {
        var formatter = getFormatter(zone);
        var parts = formatter.formatToParts(state.referenceDate);

        card.querySelector(".tz-card-time").textContent = extractTimeParts(parts);

        var dateText = extractDateParts(parts);
        var abbr = extractOffsetParts(parts);
        var offset = getUtcOffset(zone);
        var offsetText = abbr;
        if (offset && offset !== abbr) {
            offsetText = abbr + " (" + offset + ")";
        }

        var metaText;
        if (state.nicknames[zone]) {
            // Nickname is set, so show zone region in meta for context
            metaText = dateText + " \u00b7 " + formatZoneLabel(zone) + " \u00b7 " + offsetText;
        } else {
            // Title already shows zone name, don't duplicate
            metaText = dateText + " \u00b7 " + offsetText;
        }
        card.querySelector(".tz-card-meta").textContent = metaText;
    }

    function renderCards() {
        // Clear existing cards
        while (clocksContainer.firstChild) {
            clocksContainer.removeChild(clocksContainer.firstChild);
        }

        // Create and populate cards
        for (var i = 0; i < state.zones.length; i++) {
            var card = createCard(state.zones[i], i);
            updateCard(card, state.zones[i]);
            clocksContainer.appendChild(card);
        }

        // Bind remove events
        var removeBtns = clocksContainer.querySelectorAll(".tz-card-remove");
        for (var j = 0; j < removeBtns.length; j++) {
            removeBtns[j].addEventListener("click", handleRemoveClick);
        }

        // Bind drag-and-drop events on cards
        var cards = clocksContainer.querySelectorAll(".tz-card");
        for (var k = 0; k < cards.length; k++) {
            cards[k].addEventListener("dragstart", handleDragStart);
            cards[k].addEventListener("dragend", handleDragEnd);
            cards[k].addEventListener("dragover", handleDragOver);
            cards[k].addEventListener("drop", handleDrop);
            cards[k].addEventListener("dragleave", handleDragLeave);
            // Touch support
            cards[k].addEventListener("touchstart", handleTouchStart, { passive: false });
            cards[k].addEventListener("touchmove", handleTouchMove, { passive: false });
            cards[k].addEventListener("touchend", handleTouchEnd);
            cards[k].addEventListener("touchcancel", handleTouchEnd);
            // Keyboard reorder
            cards[k].addEventListener("keydown", handleCardKeydown);
        }
    }

    function updateCardsInPlace() {
        var cards = clocksContainer.querySelectorAll(".tz-card");
        for (var i = 0; i < cards.length; i++) {
            var zone = cards[i].getAttribute("data-zone");
            if (zone) {
                updateCard(cards[i], zone);
            }
        }
    }

    function syncSliderAndTimeInput() {
        var refDate = state.referenceDate;
        // Get the local time components
        var localHours = refDate.getHours();
        var localMinutes = refDate.getMinutes();

        // Sync slider to current hour
        slider.value = localHours;

        // Sync time input
        var hh = String(localHours).padStart(2, "0");
        var mm = String(localMinutes).padStart(2, "0");
        timeInput.value = hh + ":" + mm;

        // Sync date input
        var year = refDate.getFullYear();
        var month = String(refDate.getMonth() + 1).padStart(2, "0");
        var day = String(refDate.getDate()).padStart(2, "0");
        dateInput.value = year + "-" + month + "-" + day;
    }

    function render() {
        updateCardsInPlace();
        syncSliderAndTimeInput();
        updateFormatButtons();
    }

    function fullRender() {
        renderCards();
        syncSliderAndTimeInput();
        updateFormatButtons();
    }

    function updateFormatButtons() {
        if (state.format === 12) {
            fmt12Btn.classList.add("active");
            fmt12Btn.setAttribute("aria-pressed", "true");
            fmt24Btn.classList.remove("active");
            fmt24Btn.setAttribute("aria-pressed", "false");
        } else {
            fmt24Btn.classList.add("active");
            fmt24Btn.setAttribute("aria-pressed", "true");
            fmt12Btn.classList.remove("active");
            fmt12Btn.setAttribute("aria-pressed", "false");
        }
    }

    // ================================================================== //
    //  Dropdown Rendering                                                 //
    // ================================================================== //

    var highlightedIndex = -1;

    function renderDropdown(results) {
        // Clear
        while (dropdown.firstChild) {
            dropdown.removeChild(dropdown.firstChild);
        }
        highlightedIndex = -1;

        if (results.length === 0) {
            hideDropdown();
            return;
        }

        var shown = results.slice(0, MAX_DROPDOWN_ITEMS);
        for (var i = 0; i < shown.length; i++) {
            var li = document.createElement("li");
            li.setAttribute("role", "option");
            li.setAttribute("id", "tz-option-" + i);
            li.setAttribute("data-zone", shown[i]);

            var citySpan = document.createElement("span");
            citySpan.className = "tz-dropdown-city";
            citySpan.textContent = formatZoneLabel(shown[i]);

            var metaSpan = document.createElement("span");
            metaSpan.className = "tz-dropdown-meta";
            metaSpan.textContent = shown[i] + " \u2014 " + getUtcOffset(shown[i]);

            li.appendChild(citySpan);
            li.appendChild(metaSpan);

            // Mark already-added zones
            if (state.zones.indexOf(shown[i]) !== -1) {
                li.classList.add("tz-dropdown-disabled");
                li.setAttribute("aria-disabled", "true");
            }

            dropdown.appendChild(li);
        }

        showDropdown();
    }

    function showDropdown() {
        dropdown.classList.add("tz-dropdown-visible");
        searchInput.setAttribute("aria-expanded", "true");
    }

    function hideDropdown() {
        dropdown.classList.remove("tz-dropdown-visible");
        searchInput.setAttribute("aria-expanded", "false");
        searchInput.setAttribute("aria-activedescendant", "");
        highlightedIndex = -1;
    }

    function highlightItem(index) {
        var items = dropdown.querySelectorAll("li");
        for (var i = 0; i < items.length; i++) {
            items[i].classList.remove("highlighted");
        }
        if (index >= 0 && index < items.length) {
            items[index].classList.add("highlighted");
            searchInput.setAttribute("aria-activedescendant", "tz-option-" + index);
            // Scroll into view
            items[index].scrollIntoView({ block: "nearest" });
        }
        highlightedIndex = index;
    }

    // ================================================================== //
    //  State Mutations                                                    //
    // ================================================================== //

    function getOffsetMinutes(zone) {
        var fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            timeZoneName: "shortOffset"
        });
        var parts = fmt.formatToParts(state.referenceDate || new Date());
        var offsetStr = "";
        for (var i = 0; i < parts.length; i++) {
            if (parts[i].type === "timeZoneName") {
                offsetStr = parts[i].value;
                break;
            }
        }
        if (offsetStr === "GMT" || offsetStr === "UTC") return 0;
        var match = offsetStr.replace("GMT", "").replace("UTC", "");
        var sign = match.charAt(0) === "-" ? -1 : 1;
        var numPart = match.substring(1);
        var hm = numPart.split(":");
        var hours = parseInt(hm[0], 10) || 0;
        var mins = parseInt(hm[1], 10) || 0;
        return sign * (hours * 60 + mins);
    }

    function addZone(iana) {
        if (state.zones.indexOf(iana) !== -1) {
            return;
        }
        var newOffset = getOffsetMinutes(iana);
        var insertIdx = state.zones.length;
        for (var i = 0; i < state.zones.length; i++) {
            if (getOffsetMinutes(state.zones[i]) > newOffset) {
                insertIdx = i;
                break;
            }
        }
        state.zones.splice(insertIdx, 0, iana);
        persist();
        fullRender();
        announce("Added " + formatZoneLabel(iana) + " time zone");
    }

    function removeZone(iana) {
        if (iana === state.localZone) {
            return; // Cannot remove local zone
        }
        var idx = state.zones.indexOf(iana);
        if (idx !== -1) {
            state.zones.splice(idx, 1);
            persist();
            fullRender();
            announce("Removed " + formatZoneLabel(iana) + " time zone");
        }
    }

    function moveZoneUp(iana) {
        var idx = state.zones.indexOf(iana);
        if (idx <= 0) return;
        var temp = state.zones[idx - 1];
        state.zones[idx - 1] = state.zones[idx];
        state.zones[idx] = temp;
        persist();
        fullRender();
        announce("Moved " + formatZoneLabel(iana) + " up");
    }

    function moveZoneDown(iana) {
        var idx = state.zones.indexOf(iana);
        if (idx === -1 || idx >= state.zones.length - 1) return;
        var temp = state.zones[idx + 1];
        state.zones[idx + 1] = state.zones[idx];
        state.zones[idx] = temp;
        persist();
        fullRender();
        announce("Moved " + formatZoneLabel(iana) + " down");
    }

    function setReferenceTime(date) {
        state.referenceDate = date;
        state.isLive = false;
        render();
        announce("Reference time set to " +
            getFormatter(state.localZone).format(date));
    }

    function resetToNow() {
        state.isLive = true;
        state.referenceDate = new Date();
        render();
        announce("Reset to current time");
    }

    function toggleFormat(fmt) {
        state.format = fmt;
        invalidateFormatterCache();
        persist();
        updateSliderLabels();
        fullRender();
        announce("Switched to " + fmt + "-hour format");
    }

    // ================================================================== //
    //  Nickname Editing                                                    //
    // ================================================================== //

    function startNicknameEdit(card, zone) {
        var labelWrap = card.querySelector(".tz-card-label-wrap");
        if (!labelWrap || labelWrap.querySelector(".tz-nickname-input")) {
            return; // Already editing
        }

        // Hide existing label content
        var label = labelWrap.querySelector(".tz-card-label");
        var originalLabel = labelWrap.querySelector(".tz-card-label-original");
        if (label) label.style.display = "none";
        if (originalLabel) originalLabel.style.display = "none";

        // Create input
        var input = document.createElement("input");
        input.type = "text";
        input.className = "tz-nickname-input";
        input.setAttribute("aria-label", "Nickname for " + formatZoneLabel(zone));
        input.setAttribute("maxlength", String(MAX_NICKNAME_LENGTH));
        input.value = state.nicknames[zone] || formatZoneLabel(zone);
        input.setAttribute("placeholder", formatZoneLabel(zone));

        labelWrap.appendChild(input);
        input.focus();
        input.select();

        function commitEdit() {
            var value = input.value.trim();
            // Remove input and restore display
            if (labelWrap.contains(input)) {
                labelWrap.removeChild(input);
            }

            if (value === "" || value === formatZoneLabel(zone)) {
                // Clear nickname
                if (state.nicknames[zone]) {
                    delete state.nicknames[zone];
                    persist();
                    announce("Cleared nickname for " + formatZoneLabel(zone));
                }
            } else {
                // Set nickname
                state.nicknames[zone] = value.substring(0, MAX_NICKNAME_LENGTH);
                persist();
                announce("Set nickname for " + formatZoneLabel(zone) + " to " + state.nicknames[zone]);
            }

            // Re-render cards to reflect changes
            fullRender();
        }

        function cancelEdit() {
            if (labelWrap.contains(input)) {
                labelWrap.removeChild(input);
            }
            if (label) label.style.display = "";
            if (originalLabel) originalLabel.style.display = "";
        }

        var committed = false;

        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                committed = true;
                commitEdit();
            } else if (e.key === "Escape") {
                e.preventDefault();
                committed = true;
                cancelEdit();
            }
        });

        input.addEventListener("blur", function () {
            if (!committed) {
                committed = true;
                commitEdit();
            }
        });
    }

    // ================================================================== //
    //  Event Handlers                                                     //
    // ================================================================== //

    function handleFormatClick(e) {
        var btn = e.currentTarget;
        if (btn === fmt12Btn) {
            toggleFormat(12);
        } else {
            toggleFormat(24);
        }
    }

    function handleSliderInput() {
        var hour = parseInt(slider.value, 10);
        var ref = new Date(state.referenceDate);
        ref.setHours(hour);
        ref.setMinutes(0);
        ref.setSeconds(0);
        setReferenceTime(ref);

        // Flash time displays to indicate minute-reset
        var timeEls = document.querySelectorAll(".tz-card-time");
        for (var i = 0; i < timeEls.length; i++) {
            timeEls[i].classList.add("tz-time-flash");
        }
        setTimeout(function() {
            var els = document.querySelectorAll(".tz-card-time.tz-time-flash");
            for (var i = 0; i < els.length; i++) {
                els[i].classList.remove("tz-time-flash");
            }
        }, 300);
    }

    function handleTimeChange() {
        var val = timeInput.value;
        if (!val) return;
        var parts = val.split(":");
        var hours = parseInt(parts[0], 10);
        var minutes = parseInt(parts[1], 10);
        if (isNaN(hours) || isNaN(minutes)) return;

        var ref = new Date(state.referenceDate);
        ref.setHours(hours, minutes, 0, 0);
        setReferenceTime(ref);
    }

    function handleDateChange() {
        var val = dateInput.value;
        if (!val) return;
        var parts = val.split("-");
        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10) - 1;
        var day = parseInt(parts[2], 10);
        if (isNaN(year) || isNaN(month) || isNaN(day)) return;

        var ref = new Date(state.referenceDate);
        ref.setFullYear(year, month, day);
        ref.setSeconds(0, 0);
        setReferenceTime(ref);
    }

    function handleNowClick() {
        resetToNow();
    }

    function handleSearchInput() {
        var query = searchInput.value.trim();
        if (query.length === 0) {
            hideDropdown();
            return;
        }
        var results = filterZones(query);
        renderDropdown(results);
    }

    function handleSearchKeydown(e) {
        var items = dropdown.querySelectorAll("li");
        var count = items.length;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (count === 0) return;
            var next = highlightedIndex + 1;
            if (next >= count) next = 0;
            highlightItem(next);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (count === 0) return;
            var prev = highlightedIndex - 1;
            if (prev < 0) prev = count - 1;
            highlightItem(prev);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < count) {
                var zone = items[highlightedIndex].getAttribute("data-zone");
                if (!items[highlightedIndex].classList.contains("tz-dropdown-disabled")) {
                    addZone(zone);
                    searchInput.value = "";
                    hideDropdown();
                }
            }
        } else if (e.key === "Escape") {
            hideDropdown();
            searchInput.value = "";
        }
    }

    function handleDropdownClick(e) {
        var li = e.target.closest("li");
        if (!li) return;
        if (li.classList.contains("tz-dropdown-disabled")) return;
        var zone = li.getAttribute("data-zone");
        if (zone) {
            addZone(zone);
            searchInput.value = "";
            hideDropdown();
        }
    }

    function handleRemoveClick(e) {
        var card = e.currentTarget.closest(".tz-card");
        if (card) {
            var zone = card.getAttribute("data-zone");
            removeZone(zone);
        }
    }

    // ================================================================== //
    //  Drag and Drop Handlers                                             //
    // ================================================================== //

    var dragSourceIndex = -1;

    function getCardIndex(card) {
        var zone = card.getAttribute("data-zone");
        return state.zones.indexOf(zone);
    }

    function handleDragStart(e) {
        var card = e.currentTarget;
        dragSourceIndex = getCardIndex(card);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(dragSourceIndex));
        card.classList.add("tz-dragging");
    }

    function handleDragEnd(e) {
        var card = e.currentTarget;
        card.classList.remove("tz-dragging");
        dragSourceIndex = -1;
        removeDropIndicators();
    }

    var dragRafPending = false;

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragRafPending) return;
        dragRafPending = true;
        var card = e.currentTarget;
        var clientY = e.clientY;
        requestAnimationFrame(function() {
            dragRafPending = false;
            if (card.classList.contains("tz-dragging")) return;

            var rect = card.getBoundingClientRect();
            var midY = rect.top + rect.height / 2;

            removeDropIndicators();

            var indicator = document.createElement("div");
            indicator.className = "tz-drop-indicator";

            if (clientY < midY) {
                clocksContainer.insertBefore(indicator, card);
            } else {
                var nextSibling = card.nextSibling;
                if (nextSibling) {
                    clocksContainer.insertBefore(indicator, nextSibling);
                } else {
                    clocksContainer.appendChild(indicator);
                }
            }
        });
    }

    function handleDragLeave(e) {
        // Only remove if leaving the card entirely
        var related = e.relatedTarget;
        if (related && e.currentTarget.contains(related)) return;
    }

    function handleDrop(e) {
        e.preventDefault();
        var card = e.currentTarget;
        var targetIndex = getCardIndex(card);

        if (dragSourceIndex === -1 || targetIndex === -1) {
            removeDropIndicators();
            return;
        }

        var rect = card.getBoundingClientRect();
        var midY = rect.top + rect.height / 2;
        var insertBefore = e.clientY < midY;

        reorderZone(dragSourceIndex, targetIndex, insertBefore);
        removeDropIndicators();
    }

    function removeDropIndicators() {
        var indicators = clocksContainer.querySelectorAll(".tz-drop-indicator");
        for (var i = 0; i < indicators.length; i++) {
            indicators[i].parentNode.removeChild(indicators[i]);
        }
    }

    function reorderZone(fromIndex, toIndex, insertBefore) {
        if (fromIndex === toIndex) return;

        var zone = state.zones[fromIndex];
        state.zones.splice(fromIndex, 1);

        var finalIndex = toIndex;
        if (fromIndex < toIndex) {
            finalIndex = insertBefore ? toIndex - 1 : toIndex;
        } else {
            finalIndex = insertBefore ? toIndex : toIndex + 1;
        }

        state.zones.splice(finalIndex, 0, zone);
        persist();
        fullRender();
        announce("Moved " + formatZoneLabel(zone) + " to position " + (finalIndex + 1));
    }

    // ================================================================== //
    //  Touch Drag Handlers                                                //
    // ================================================================== //

    var touchState = {
        active: false,
        card: null,
        startY: 0,
        currentY: 0,
        clone: null,
        sourceIndex: -1
    };

    function handleTouchStart(e) {
        // Only initiate drag from the drag handle
        var handle = e.target.closest(".tz-drag-handle");
        if (!handle) return;

        e.preventDefault();
        var card = e.currentTarget;
        var touch = e.touches[0];

        touchState.active = true;
        touchState.card = card;
        touchState.startY = touch.clientY;
        touchState.currentY = touch.clientY;
        touchState.sourceIndex = getCardIndex(card);

        card.classList.add("tz-dragging");
    }

    var touchRafPending = false;

    function handleTouchMove(e) {
        if (!touchState.active) return;
        e.preventDefault();

        var touch = e.touches[0];
        touchState.currentY = touch.clientY;

        if (touchRafPending) return;
        touchRafPending = true;
        var clientY = touch.clientY;
        requestAnimationFrame(function() {
            touchRafPending = false;
            // Show drop indicator
            removeDropIndicators();
            var cards = clocksContainer.querySelectorAll(".tz-card");
            for (var i = 0; i < cards.length; i++) {
                if (cards[i] === touchState.card) continue;
                var rect = cards[i].getBoundingClientRect();
                var midY = rect.top + rect.height / 2;

                if (clientY >= rect.top && clientY <= rect.bottom) {
                    var indicator = document.createElement("div");
                    indicator.className = "tz-drop-indicator";
                    if (clientY < midY) {
                        clocksContainer.insertBefore(indicator, cards[i]);
                    } else {
                        var nextSibling = cards[i].nextSibling;
                        if (nextSibling) {
                            clocksContainer.insertBefore(indicator, nextSibling);
                        } else {
                            clocksContainer.appendChild(indicator);
                        }
                    }
                    break;
                }
            }
        });
    }

    function handleTouchEnd(e) {
        if (!touchState.active) return;

        touchState.card.classList.remove("tz-dragging");

        // Determine target position
        var cards = clocksContainer.querySelectorAll(".tz-card");
        var targetIndex = -1;
        var insertBefore = true;

        for (var i = 0; i < cards.length; i++) {
            if (cards[i] === touchState.card) continue;
            var rect = cards[i].getBoundingClientRect();
            var midY = rect.top + rect.height / 2;

            if (touchState.currentY >= rect.top && touchState.currentY <= rect.bottom) {
                targetIndex = getCardIndex(cards[i]);
                insertBefore = touchState.currentY < midY;
                break;
            }
        }

        removeDropIndicators();

        if (targetIndex !== -1 && targetIndex !== touchState.sourceIndex) {
            reorderZone(touchState.sourceIndex, targetIndex, insertBefore);
        }

        touchState.active = false;
        touchState.card = null;
        touchState.sourceIndex = -1;
    }

    // ================================================================== //
    //  Keyboard Reorder Handler                                           //
    // ================================================================== //

    function handleCardKeydown(e) {
        if (!e.ctrlKey) return;

        var card = e.currentTarget;
        var zone = card.getAttribute("data-zone");

        if (e.key === "ArrowUp") {
            e.preventDefault();
            moveZoneUp(zone);
            // Re-focus the moved card
            setTimeout(function () {
                var movedCard = clocksContainer.querySelector("[data-zone=\"" + zone + "\"]");
                if (movedCard) movedCard.focus();
            }, 0);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            moveZoneDown(zone);
            // Re-focus the moved card
            setTimeout(function () {
                var movedCard = clocksContainer.querySelector("[data-zone=\"" + zone + "\"]");
                if (movedCard) movedCard.focus();
            }, 0);
        }
    }

    function handleSearchBlur() {
        // Delay to allow click on dropdown item to register
        setTimeout(function () {
            hideDropdown();
        }, 200);
    }

    // ================================================================== //
    //  Tick Loop                                                          //
    // ================================================================== //

    function tick() {
        if (state.isLive) {
            state.referenceDate = new Date();
            render();
        }
    }

    // ================================================================== //
    //  Slider Hour Labels                                                 //
    // ================================================================== //

    /**
     * Builds 24 tick marks and 24 hour labels below the slider.
     * Uses flex space-between with padding matching half the thumb width
     * so each tick/label aligns exactly with the slider thumb positions.
     */
    function buildSlider() {
        var ticksContainer = document.getElementById("tz-slider-ticks");
        var labelsContainer = document.getElementById("tz-slider-labels");
        if (!ticksContainer || !labelsContainer) { return; }

        // Clear any existing content
        while (ticksContainer.firstChild) ticksContainer.removeChild(ticksContainer.firstChild);
        while (labelsContainer.firstChild) labelsContainer.removeChild(labelsContainer.firstChild);

        // Create 24 ticks and 24 labels
        for (var h = 0; h < 24; h++) {
            var tick = document.createElement("span");
            ticksContainer.appendChild(tick);

            var label = document.createElement("span");
            label.textContent = formatSliderLabel(h);
            labelsContainer.appendChild(label);
        }
    }

    function formatSliderLabel(hour) {
        if (state.format === 24) {
            return hour < 10 ? "\u2007" + hour : String(hour);
        }
        // 12h format
        var h12 = hour % 12;
        if (h12 === 0) h12 = 12;
        var suffix = hour < 12 ? "a" : "p";
        var padded = h12 < 10 ? "\u2007" + h12 : String(h12);
        return padded + suffix;
    }

    function updateSliderLabels() {
        var labelsContainer = document.getElementById("tz-slider-labels");
        if (!labelsContainer) { return; }
        var labels = labelsContainer.children;
        for (var h = 0; h < 24; h++) {
            if (labels[h]) {
                labels[h].textContent = formatSliderLabel(h);
            }
        }
    }

    // ================================================================== //
    //  Initialization                                                     //
    // ================================================================== //

    function init() {
        // Check browser support
        if (typeof Intl === "undefined" ||
            typeof Intl.supportedValuesOf !== "function") {
            var container = document.getElementById("tz-clocks");
            var fallback = document.createElement("div");
            fallback.className = "box";
            var msg = document.createElement("p");
            msg.textContent = "Your browser does not support the required " +
                "Intl API. Please use a modern browser (Chrome 99+, Firefox 93+, " +
                "Safari 15.4+).";
            fallback.appendChild(msg);
            container.appendChild(fallback);
            return;
        }

        // Cache zone list
        getAllZones();

        // Build abbreviation cache for search
        buildAbbreviationCache();

        // Detect local zone
        state.localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        // Load persisted state
        loadPersisted();

        // Set initial reference time
        state.referenceDate = new Date();
        state.isLive = true;

        // Get DOM references
        fmt12Btn = document.getElementById("tz-fmt-12");
        fmt24Btn = document.getElementById("tz-fmt-24");
        timeInput = document.getElementById("tz-time-manual");
        dateInput = document.getElementById("tz-date-manual");
        nowBtn = document.getElementById("tz-now-btn");
        slider = document.getElementById("tz-slider");
        searchInput = document.getElementById("tz-search");
        dropdown = document.getElementById("tz-dropdown");
        clocksContainer = document.getElementById("tz-clocks");

        // Bind events
        fmt12Btn.addEventListener("click", handleFormatClick);
        fmt24Btn.addEventListener("click", handleFormatClick);
        slider.addEventListener("input", handleSliderInput);
        timeInput.addEventListener("change", handleTimeChange);
        dateInput.addEventListener("change", handleDateChange);
        nowBtn.addEventListener("click", handleNowClick);
        searchInput.addEventListener("input", handleSearchInput);
        searchInput.addEventListener("keydown", handleSearchKeydown);
        searchInput.addEventListener("blur", handleSearchBlur);
        dropdown.addEventListener("click", handleDropdownClick);

        // Generate slider ticks and labels
        buildSlider();

        // Initial render
        fullRender();

        // Start tick loop
        setInterval(tick, 1000);
    }

    // Run on DOM ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
