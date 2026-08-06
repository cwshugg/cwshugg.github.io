// Journaling — deterministic daily selection, persistence, and custom prompt management.
(function () {
    "use strict";

    var CATALOG_SCHEMA_VERSION = 1;
    var INSTALLATION_VERSION = 1;
    var STATE_VERSION = 2;
    var DEFAULT_RANDOM_COUNT = 3;
    var MIN_RANDOM_COUNT = 1;
    var MAX_RANDOM_COUNT = 20;
    var MAX_PROMPT_LENGTH = 500;
    var MAX_TAGS = 8;
    var MAX_TAG_LENGTH = 32;
    var MAX_PINNED_IDS = 500;
    var MAX_CUSTOM_PROMPTS = 200;
    var SELECTION_ALGORITHM = "jp-selection-v1";
    var TAG_COLOR_ALGORITHM = "jp-tag-color-v1";
    var INSTALLATION_KEY = "shugg.journalingPrompts.installation.v1";
    var STATE_KEY = "shugg.journalingPrompts.state.v1";
    var BUILTIN_ID_PATTERN = /^builtin-[a-z0-9-]+$/;
    var CUSTOM_ID_PATTERN = /^custom-[a-z0-9-]+$/;
    var BROWSER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    var app;
    var elements = {};
    var builtins = [];
    var state = defaultState();
    var browserId = "";
    var localDay = "";
    var mode = "daily";
    var moreIndex = 0;
    var moreExcludedIds = [];
    var currentRandomIds = [];
    var editingId = null;
    var storageWarning = "";
    var catalogWarning = "";
    var stateWritable = true;
    var storageBackend = null;
    var initialized = false;
    var customIdCounter = 0;
    var promptLayoutFrame = null;
    var dragState = {
        id: null,
        targetId: null,
        insertAfter: false,
        pointerId: null,
        surface: null,
        startX: 0,
        startY: 0,
        nativeBlocked: false,
        suppressClick: false
    };
    var POINTER_DRAG_THRESHOLD = 10;

    /** Return a new default persistent state. */
    function defaultState() {
        return {
            version: STATE_VERSION,
            randomCount: DEFAULT_RANDOM_COUNT,
            pinnedIds: [],
            pinnedOrder: [],
            customPrompts: []
        };
    }

    /** Test whether a value is a plain object. */
    function isPlainObject(value) {
        return Object.prototype.toString.call(value) === "[object Object]";
    }

    /** Return a number constrained to an inclusive range. */
    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    /** Return the smallest whole rule-row count that contains a measured height. */
    function quantizedRuleRows(contentHeight, ruleSpacing, minimumRows) {
        var minimum = Math.max(1, Math.ceil(Number(minimumRows) || 1));
        if (!Number.isFinite(contentHeight) || !Number.isFinite(ruleSpacing) ||
                contentHeight < 0 || ruleSpacing <= 0) {
            return minimum;
        }
        return Math.max(minimum, Math.ceil((contentHeight - 0.01) / ruleSpacing));
    }

    /** Normalize one textual tag without changing its internal characters. */
    function normalizeTag(value) {
        if (typeof value !== "string") {
            return null;
        }
        return value.trim().toLowerCase();
    }

    /** Normalize tags from an array or comma-separated string. */
    function normalizeTags(value) {
        var source = typeof value === "string" ? value.split(",") : value;
        var normalized = [];
        var seen = {};
        var i;
        var tag;

        if (!Array.isArray(source)) {
            return { valid: false, tags: [], error: "Tags must be a list." };
        }

        for (i = 0; i < source.length; i++) {
            tag = normalizeTag(source[i]);
            if (tag === null) {
                return { valid: false, tags: [], error: "Every tag must be text." };
            }
            if (!tag) {
                continue;
            }
            if (tag.length > MAX_TAG_LENGTH) {
                return { valid: false, tags: [], error: "Each tag must be 32 characters or fewer." };
            }
            if (!seen[tag]) {
                seen[tag] = true;
                normalized.push(tag);
            }
        }

        if (normalized.length > MAX_TAGS) {
            return { valid: false, tags: [], error: "Use no more than 8 tags." };
        }
        return { valid: true, tags: normalized, error: "" };
    }

    /** Validate and normalize one prompt record. */
    function normalizePrompt(value, source) {
        var expectedPattern = source === "builtin" ? BUILTIN_ID_PATTERN : CUSTOM_ID_PATTERN;
        var tags;
        var text;

        if (!isPlainObject(value) || typeof value.id !== "string" ||
                !expectedPattern.test(value.id) || typeof value.text !== "string") {
            return null;
        }
        text = value.text.trim();
        tags = normalizeTags(value.tags);
        if (!text || text.length > MAX_PROMPT_LENGTH || !tags.valid) {
            return null;
        }
        if (source === "builtin" && tags.tags.length === 0) {
            return null;
        }
        return { id: value.id, text: text, tags: tags.tags, source: source };
    }

    /** Validate a catalog while retaining independently valid records. */
    function normalizeCatalog(value) {
        var prompts = [];
        var rejected = 0;
        var seen = {};
        var i;
        var prompt;

        if (!isPlainObject(value) || value.schemaVersion !== CATALOG_SCHEMA_VERSION ||
                typeof value.catalogVersion !== "string" || !Array.isArray(value.prompts)) {
            throw new Error("The prompt catalog has an unsupported format.");
        }
        for (i = 0; i < value.prompts.length; i++) {
            prompt = normalizePrompt(value.prompts[i], "builtin");
            if (!prompt || seen[prompt && prompt.id]) {
                rejected++;
                continue;
            }
            seen[prompt.id] = true;
            prompts.push(prompt);
        }
        if (!prompts.length && value.prompts.length) {
            throw new Error("The prompt catalog contains no usable prompts.");
        }
        return { prompts: prompts, rejected: rejected };
    }

    /** Normalize an installation record and identify incompatible future versions. */
    function migrateInstallation(value) {
        if (!isPlainObject(value) || !Number.isInteger(value.version)) {
            return { browserId: null, warning: true, future: false };
        }
        if (value.version > INSTALLATION_VERSION) {
            return { browserId: null, warning: true, future: true };
        }
        if (value.version !== INSTALLATION_VERSION ||
                typeof value.browserId !== "string" ||
                !BROWSER_ID_PATTERN.test(value.browserId)) {
            return { browserId: null, warning: true, future: false };
        }
        return { browserId: value.browserId, warning: false, future: false };
    }

    /** Normalize a parsed persistent state and identify incompatible future versions. */
    function migrateState(value) {
        var result = defaultState();
        var seenPins = {};
        var seenOrder = {};
        var seenCustoms = {};
        var invalid = false;
        var i;
        var id;
        var prompt;

        if (!isPlainObject(value) || !Number.isInteger(value.version)) {
            return { state: result, warning: true, future: false };
        }
        if (value.version > STATE_VERSION) {
            return { state: result, warning: true, future: true };
        }
        if (value.version !== 1 && value.version !== STATE_VERSION) {
            return { state: result, warning: true, future: false };
        }

        if (Number.isInteger(value.randomCount) &&
                value.randomCount >= MIN_RANDOM_COUNT && value.randomCount <= MAX_RANDOM_COUNT) {
            result.randomCount = value.randomCount;
        } else {
            invalid = true;
        }

        if (!Array.isArray(value.pinnedIds)) {
            invalid = true;
        } else {
            if (value.pinnedIds.length > MAX_PINNED_IDS) {
                invalid = true;
            }

            for (i = 0; i < Math.min(value.pinnedIds.length, MAX_PINNED_IDS); i++) {
                id = value.pinnedIds[i];
                if (typeof id === "string" && (BUILTIN_ID_PATTERN.test(id) || CUSTOM_ID_PATTERN.test(id))) {
                    if (!seenPins[id]) {
                        seenPins[id] = true;
                        result.pinnedIds.push(id);
                    } else {
                        invalid = true;
                    }
                } else {
                    invalid = true;
                }
            }
            if (value.version === 1) {
                result.pinnedOrder = result.pinnedIds.slice();
            } else if (!Array.isArray(value.pinnedOrder)) {
                invalid = true;
                result.pinnedOrder = result.pinnedIds.slice();
            } else {
                if (value.pinnedOrder.length > MAX_PINNED_IDS) {
                    invalid = true;
                }
                for (i = 0; i < Math.min(value.pinnedOrder.length, MAX_PINNED_IDS); i++) {
                    id = value.pinnedOrder[i];
                    if (typeof id === "string" && seenPins[id] && !seenOrder[id]) {
                        seenOrder[id] = true;
                        result.pinnedOrder.push(id);
                    } else {
                        invalid = true;
                    }
                }
                result.pinnedIds.forEach(function (pinnedId) {
                    if (!seenOrder[pinnedId]) {
                        seenOrder[pinnedId] = true;
                        result.pinnedOrder.push(pinnedId);
                    }
                });
            }
        }

        if (!Array.isArray(value.customPrompts)) {
            invalid = true;
        } else {
            if (value.customPrompts.length > MAX_CUSTOM_PROMPTS) {
                invalid = true;
            }
            for (i = 0; i < Math.min(value.customPrompts.length, MAX_CUSTOM_PROMPTS); i++) {
                prompt = normalizePrompt(value.customPrompts[i], "custom");
                if (!prompt || seenCustoms[prompt && prompt.id]) {
                    invalid = true;
                    continue;
                }
                seenCustoms[prompt.id] = true;
                result.customPrompts.push({ id: prompt.id, text: prompt.text, tags: prompt.tags });
            }
        }
        result.pinnedIds = result.pinnedIds.filter(function (pinnedId) {
            if (BUILTIN_ID_PATTERN.test(pinnedId) || seenCustoms[pinnedId]) {
                return true;
            }
            invalid = true;
            return false;
        });
        result.pinnedOrder = result.pinnedOrder.filter(function (pinnedId) {
            return result.pinnedIds.indexOf(pinnedId) >= 0;
        });
        return { state: result, warning: invalid, future: false, changed: invalid ||
            JSON.stringify(result) !== JSON.stringify(value) };
    }

    /** Return the browser-local YYYY-MM-DD key for a date. */
    function localDateKey(date) {
        var month = String(date.getMonth() + 1);
        var day = String(date.getDate());
        return date.getFullYear() + "-" + (month.length < 2 ? "0" + month : month) +
            "-" + (day.length < 2 ? "0" + day : day);
    }

    /** Format a date in the visitor's locale using the full local calendar date. */
    function formatLocalDate(date) {
        return new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        }).format(date);
    }

    /** Compute stable FNV-1a over UTF-8 bytes. */
    function fnv1a(value) {
        var bytes = unescape(encodeURIComponent(String(value)));
        var hash = 2166136261;
        var i;
        for (i = 0; i < bytes.length; i++) {
            hash ^= bytes.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    /** Mix a 32-bit integer into a well-distributed unsigned result. */
    function mix32(value) {
        value = (value ^ (value >>> 16)) >>> 0;
        value = Math.imul(value, 2246822507) >>> 0;
        value = (value ^ (value >>> 13)) >>> 0;
        value = Math.imul(value, 3266489909) >>> 0;
        return (value ^ (value >>> 16)) >>> 0;
    }

    /** Compare ranked entries by unsigned rank and then stable ID. */
    function compareRankEntries(left, right) {
        if (left.rank !== right.rank) {
            return left.rank < right.rank ? -1 : 1;
        }
        return left.id < right.id ? -1 : (left.id > right.id ? 1 : 0);
    }

    /** Rank IDs independently using stable seed material and ID tie-breaking. */
    function rankIds(ids, seed) {
        return ids.map(function (id) {
            return { id: id, rank: mix32(fnv1a(seed + "|" + id)) };
        }).sort(compareRankEntries).map(function (entry) {
            return entry.id;
        });
    }

    /** Create a temporary ranked order that avoids the current set when possible. */
    function rankMoreIds(ids, seed, excludedIds) {
        var excluded = {};
        var fresh = [];
        var fallback = [];
        var ranked;
        var i;
        for (i = 0; i < excludedIds.length; i++) {
            excluded[excludedIds[i]] = true;
        }
        ranked = rankIds(ids, seed);
        for (i = 0; i < ranked.length; i++) {
            (excluded[ranked[i]] ? fallback : fresh).push(ranked[i]);
        }
        return fresh.concat(fallback);
    }

    /** Return pinned IDs first and random IDs second, keeping the first occurrence of each ID. */
    function orderedPromptIds(pinnedIds, randomIds) {
        var seen = {};
        return pinnedIds.concat(randomIds).filter(function (id) {
            if (seen[id]) {
                return false;
            }
            seen[id] = true;
            return true;
        });
    }

    /** Convert HSL channel values to an RGB object. */
    function hslToRgb(hue, saturation, lightness) {
        var c = (1 - Math.abs(2 * lightness - 1)) * saturation;
        var x = c * (1 - Math.abs((hue / 60) % 2 - 1));
        var m = lightness - c / 2;
        var channels;
        if (hue < 60) { channels = [c, x, 0]; }
        else if (hue < 120) { channels = [x, c, 0]; }
        else if (hue < 180) { channels = [0, c, x]; }
        else if (hue < 240) { channels = [0, x, c]; }
        else if (hue < 300) { channels = [x, 0, c]; }
        else { channels = [c, 0, x]; }
        return {
            r: Math.round((channels[0] + m) * 255),
            g: Math.round((channels[1] + m) * 255),
            b: Math.round((channels[2] + m) * 255)
        };
    }

    /** Calculate WCAG relative luminance for an RGB object. */
    function relativeLuminance(rgb) {
        function linear(channel) {
            channel /= 255;
            return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
    }

    /** Calculate the WCAG contrast ratio between two luminance values. */
    function contrastRatio(first, second) {
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }

    /** Derive a deterministic tag background and readable foreground. */
    function tagColor(tag) {
        var normalizedTag = normalizeTag(tag);
        var hash = fnv1a(TAG_COLOR_ALGORITHM + "|" + (normalizedTag === null ? "" : normalizedTag));
        var hue = hash % 360;
        var saturation = 28 + ((hash >>> 9) % 15);
        var lightness = 34 + ((hash >>> 17) % 35);
        var rgb;
        var luminance;
        var blackContrast;
        var whiteContrast;
        var foreground;
        var contrast;

        while (true) {
            rgb = hslToRgb(hue, saturation / 100, lightness / 100);
            luminance = relativeLuminance(rgb);
            blackContrast = contrastRatio(luminance, 0);
            whiteContrast = contrastRatio(luminance, 1);
            foreground = blackContrast >= whiteContrast ? "#000000" : "#ffffff";
            contrast = Math.max(blackContrast, whiteContrast);
            if (contrast >= 4.5) {
                break;
            }
            lightness = clamp(lightness + (foreground === "#000000" ? 1 : -1), 0, 100);
        }
        return {
            background: "hsl(" + hue + ", " + saturation + "%, " + lightness + "%)",
            foreground: foreground,
            contrast: contrast
        };
    }

    /** Generate a custom UUID-like ID using the strongest available browser source. */
    function createCustomId(cryptoObject, now, randomValue, counter) {
        var bytes;
        var i;
        var hex = "";
        if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
            return "custom-" + cryptoObject.randomUUID().toLowerCase();
        }
        if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
            bytes = new Uint8Array(16);
            cryptoObject.getRandomValues(bytes);
            bytes[6] = (bytes[6] & 15) | 64;
            bytes[8] = (bytes[8] & 63) | 128;
            for (i = 0; i < bytes.length; i++) {
                hex += (bytes[i] + 256).toString(16).slice(-2);
            }
            return "custom-" + hex;
        }
        return "custom-" + now.toString(36) + "-" + counter.toString(36) + "-" +
            Math.floor(randomValue * 0x100000000).toString(36);
    }

    /** Generate a canonical UUID-v4 browser installation identifier. */
    function createBrowserId(cryptoObject) {
        var bytes = new Uint8Array(16);
        var hex = "";
        var i;
        var randomUuid;
        if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
            randomUuid = cryptoObject.randomUUID().toLowerCase();
            if (BROWSER_ID_PATTERN.test(randomUuid)) {
                return randomUuid;
            }
        }
        if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
            cryptoObject.getRandomValues(bytes);
        } else {
            for (i = 0; i < bytes.length; i++) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
        }
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        for (i = 0; i < bytes.length; i++) {
            hex += (bytes[i] + 256).toString(16).slice(-2);
        }
        return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
            hex.slice(16, 20) + "-" + hex.slice(20);
    }

    /** Return a new state with an ID pinned once. */
    function pinPrompt(current, id) {
        var next = cloneState(current);
        if (next.pinnedIds.indexOf(id) < 0 && next.pinnedIds.length < MAX_PINNED_IDS) {
            next.pinnedIds.push(id);
            next.pinnedOrder.push(id);
        }
        return next;
    }

    /** Return a new state with an ID unpinned. */
    function unpinPrompt(current, id) {
        var next = cloneState(current);
        next.pinnedIds = next.pinnedIds.filter(function (candidate) { return candidate !== id; });
        next.pinnedOrder = next.pinnedOrder.filter(function (candidate) { return candidate !== id; });
        return next;
    }

    /** Move a pinned ID immediately before or after another pinned ID. */
    function movePinnedRelative(current, id, targetId, insertAfter) {
        var targetIndex;
        var next;
        if (id === targetId || current.pinnedOrder.indexOf(id) < 0 ||
                current.pinnedOrder.indexOf(targetId) < 0) {
            return cloneState(current);
        }
        next = cloneState(current);
        next.pinnedOrder = next.pinnedOrder.filter(function (candidate) { return candidate !== id; });
        targetIndex = next.pinnedOrder.indexOf(targetId) + (insertAfter ? 1 : 0);
        next.pinnedOrder.splice(targetIndex, 0, id);
        return next;
    }

    /** Return a deep-enough copy of persistent state. */
    function cloneState(current) {
        return {
            version: STATE_VERSION,
            randomCount: current.randomCount,
            pinnedIds: current.pinnedIds.slice(),
            pinnedOrder: current.pinnedOrder.slice(),
            customPrompts: current.customPrompts.map(function (prompt) {
                return { id: prompt.id, text: prompt.text, tags: prompt.tags.slice() };
            })
        };
    }

    /** Add a validated custom prompt to a copied state. */
    function addCustomPrompt(current, prompt) {
        var next = cloneState(current);
        next.customPrompts.push({ id: prompt.id, text: prompt.text, tags: prompt.tags.slice() });
        return next;
    }

    /** Edit custom prompt content while preserving its stable ID. */
    function editCustomPrompt(current, id, text, tags) {
        var next = cloneState(current);
        next.customPrompts = next.customPrompts.map(function (prompt) {
            return prompt.id === id ? { id: id, text: text, tags: tags.slice() } : prompt;
        });
        return next;
    }

    /** Delete a custom prompt and remove any pin to it. */
    function deleteCustomPrompt(current, id) {
        var next = cloneState(current);
        next.customPrompts = next.customPrompts.filter(function (prompt) { return prompt.id !== id; });
        next.pinnedIds = next.pinnedIds.filter(function (candidate) { return candidate !== id; });
        next.pinnedOrder = next.pinnedOrder.filter(function (candidate) { return candidate !== id; });
        return next;
    }

    /** Safely read and parse one localStorage key. */
    function readStorage(storage, key) {
        var raw;
        try {
            raw = storage.getItem(key);
        } catch (error) {
            return { value: null, error: true, reason: "access" };
        }
        try {
            return { value: raw === null ? null : JSON.parse(raw), error: false, reason: "" };
        } catch (error) {
            return { value: null, error: true, reason: "parse" };
        }
    }

    /** Safely serialize and write one localStorage key. */
    function writeStorage(storage, key, value) {
        try {
            storage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            return false;
        }
    }

    /** Build an ID-indexed map with built-ins taking precedence over customs. */
    function promptMap() {
        var map = {};
        builtins.forEach(function (prompt) { map[prompt.id] = prompt; });
        state.customPrompts.forEach(function (prompt) {
            if (!map[prompt.id]) {
                map[prompt.id] = { id: prompt.id, text: prompt.text, tags: prompt.tags, source: "custom" };
            }
        });
        return map;
    }

    /** Keep the visible human and machine-readable date synchronized. */
    function updateJournalDate(date) {
        elements.localDate.dateTime = localDateKey(date);
        elements.localDate.setAttribute("datetime", localDateKey(date));
        elements.localDate.textContent = formatLocalDate(date);
    }

    /** Re-check the local day and return to daily mode after rollover. */
    function checkLocalDay() {
        var now = new Date();
        var current = localDateKey(now);
        if (current !== localDay) {
            localDay = current;
            updateJournalDate(now);
            mode = "daily";
            moreIndex = 0;
            moreExcludedIds = [];
            announce("A new local day began. Today's prompt set is ready.");
            return true;
        }
        return false;
    }

    /** Calculate the full active eligible ID order. */
    function activeRankedIds(map) {
        var eligible = Object.keys(map).filter(function (id) {
            return state.pinnedIds.indexOf(id) < 0;
        });
        var seed = SELECTION_ALGORITHM + "|" + browserId + "|" + localDay;
        if (mode === "more") {
            return rankMoreIds(eligible, seed + "|more:" + moreIndex, moreExcludedIds);
        }
        return rankIds(eligible, seed);
    }

    /** Remove every child from a container without parsing HTML. */
    function clearElement(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    /** Toggle a CSS class used for hidden states. */
    function setHidden(element, hidden) {
        element.classList.toggle("jp-hidden", hidden);
    }

    /** Append normalized tag chips to a container. */
    function appendTags(container, tags) {
        var list;
        if (!tags.length) {
            return;
        }
        list = document.createElement("ul");
        list.className = "jp-tags";
        list.setAttribute("aria-label", "Tags");
        tags.forEach(function (tag) {
            var item = document.createElement("li");
            var color = tagColor(tag);
            item.className = "jp-tag";
            item.textContent = tag;
            item.style.setProperty("--jp-tag-background", color.background);
            item.style.setProperty("--jp-tag-foreground", color.foreground);
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    /** Create a rendered prompt card using text-only DOM operations. */
    function createPromptCard(prompt, pinned) {
        var item = document.createElement("li");
        var text = document.createElement("p");
        var pinButton = document.createElement("button");
        var pinIcon = document.createElement("i");
        var actionLabel = (pinned ? "Unpin: " : "Pin: ") + prompt.text;
        item.className = "jp-prompt-card" + (pinned ? " jp-pinned-card" : "");
        item.setAttribute("data-prompt-id", prompt.id);
        item.setAttribute("data-pinned", pinned ? "true" : "false");
        item.setAttribute("draggable", pinned ? "true" : "false");
        if (pinned) {
            item.setAttribute("tabindex", "0");
            item.setAttribute("aria-describedby", "jp-reorder-instructions");
            item.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown");
        }
        text.className = "jp-prompt-text";
        text.textContent = prompt.text;
        item.appendChild(text);
        appendTags(item, prompt.tags);
        pinButton.type = "button";
        pinButton.className = "button-nav jp-pin-button";
        pinButton.setAttribute("data-action", pinned ? "unpin" : "pin");
        pinButton.setAttribute("data-prompt-id", prompt.id);
        pinButton.setAttribute("aria-pressed", pinned ? "true" : "false");
        pinButton.setAttribute("aria-label", actionLabel);
        pinButton.setAttribute("title", actionLabel);
        pinIcon.className = pinned ? "fas fa-times" : "fas fa-thumbtack";
        pinIcon.setAttribute("aria-hidden", "true");
        pinButton.appendChild(pinIcon);
        item.appendChild(pinButton);
        return item;
    }

    /** Quantize every prompt's border-box height so following bullets retain rule phase. */
    function quantizePromptCards() {
        var cards;
        var measurements;
        var ruleSpacing;
        if (!elements.promptList || !window.getComputedStyle) {
            return;
        }
        ruleSpacing = parseFloat(window.getComputedStyle(elements.promptList)
            .getPropertyValue("--jp-rule-spacing"));
        if (!Number.isFinite(ruleSpacing) || ruleSpacing <= 0) {
            return;
        }
        cards = Array.prototype.slice.call(
            elements.promptList.querySelectorAll(".jp-prompt-card")
        );
        cards.forEach(function (card) {
            card.style.removeProperty("--jp-card-rows");
        });
        measurements = cards.map(function (card) {
            var cardTop = card.getBoundingClientRect().top;
            var flow = card.querySelectorAll(".jp-prompt-text, .jp-tags");
            var contentBottom = cardTop;
            var i;
            for (i = 0; i < flow.length; i++) {
                contentBottom = Math.max(contentBottom, flow[i].getBoundingClientRect().bottom);
            }
            return quantizedRuleRows(contentBottom - cardTop, ruleSpacing, 2);
        });
        cards.forEach(function (card, index) {
            card.style.setProperty("--jp-card-rows", String(measurements[index]));
        });
    }

    /** Coalesce render, resize, and font-load layout requests into one measurement pass. */
    function schedulePromptQuantization() {
        if (promptLayoutFrame !== null) {
            return;
        }
        if (!window.requestAnimationFrame) {
            quantizePromptCards();
            return;
        }
        promptLayoutFrame = window.requestAnimationFrame(function () {
            promptLayoutFrame = null;
            quantizePromptCards();
        });
    }

    /** Create a subordinate custom-management card. */
    function createCustomCard(prompt) {
        var item = document.createElement("li");
        var content = document.createElement("div");
        var text = document.createElement("p");
        var actions = document.createElement("div");
        var editButton = document.createElement("button");
        var deleteButton = document.createElement("button");
        item.className = "jp-custom-card";
        item.setAttribute("data-prompt-id", prompt.id);
        content.className = "jp-custom-content";
        text.textContent = prompt.text;
        content.appendChild(text);
        appendTags(content, prompt.tags);
        actions.className = "jp-custom-actions";
        editButton.type = "button";
        editButton.className = "button-nav";
        editButton.setAttribute("data-action", "edit");
        editButton.setAttribute("data-prompt-id", prompt.id);
        editButton.setAttribute("aria-label", "Edit: " + prompt.text);
        editButton.textContent = "Edit";
        actions.appendChild(editButton);
        var pinButton = document.createElement("button");
        var isPinned = state.pinnedIds.indexOf(prompt.id) >= 0;
        pinButton.type = "button";
        pinButton.className = "button-nav";
        pinButton.setAttribute("data-action", isPinned ? "unpin" : "pin");
        pinButton.setAttribute("data-prompt-id", prompt.id);
        pinButton.setAttribute("aria-pressed", isPinned ? "true" : "false");
        pinButton.setAttribute("aria-label", (isPinned ? "Unpin: " : "Pin: ") + prompt.text);
        pinButton.textContent = isPinned ? "Unpin" : "Pin";
        actions.appendChild(pinButton);
        deleteButton.type = "button";
        deleteButton.className = "button-nav";
        deleteButton.setAttribute("data-action", "delete");
        deleteButton.setAttribute("data-prompt-id", prompt.id);
        deleteButton.setAttribute("aria-label", "Delete: " + prompt.text);
        deleteButton.textContent = "Delete";
        actions.appendChild(deleteButton);
        item.appendChild(content);
        item.appendChild(actions);
        return item;
    }

    /** Render all result and management sections from normalized state. */
    function render() {
        var map = promptMap();
        var ranked = activeRankedIds(map);
        var pinned = state.pinnedOrder.filter(function (id) { return Boolean(map[id]); });
        var displayed;
        var customs = state.customPrompts.map(function (prompt) {
            return map[prompt.id];
        }).filter(Boolean);
        var availableCount;

        currentRandomIds = ranked.slice(0, state.randomCount);
        displayed = orderedPromptIds(pinned, currentRandomIds);
        availableCount = ranked.length;
        clearElement(elements.promptList);
        clearElement(elements.customList);
        cleanupDragState();
        displayed.forEach(function (id) {
            var pinnedIndex = pinned.indexOf(id);
            elements.promptList.appendChild(createPromptCard(map[id], pinnedIndex >= 0));
        });
        customs.forEach(function (prompt) {
            elements.customList.appendChild(createCustomCard(prompt));
        });

        elements.customCount.textContent = String(customs.length);
        setHidden(elements.promptsEmpty, displayed.length > 0);
        setHidden(elements.customEmpty, customs.length > 0);
        setHidden(elements.restoreToday, mode !== "more");
        elements.randomCount.value = String(state.randomCount);
        elements.generateMore.disabled = !initialized || availableCount === 0;
        elements.randomCount.disabled = !initialized;
        schedulePromptQuantization();
    }

    /** Set the shared polite status message, including durable warnings. */
    function announce(message) {
        var warnings = [catalogWarning, storageWarning].filter(Boolean);
        elements.announcer.textContent = message + (warnings.length ? " " + warnings.join(" ") : "");
    }

    /** Persist the current whole state while preserving an incompatible future value. */
    function persistState() {
        if (!stateWritable || !writeStorage(storageBackend, STATE_KEY, state)) {
            storageWarning = "Changes may not survive closing or reloading because browser storage is unavailable.";
            stateWritable = false;
            return false;
        }
        return true;
    }

    /** Find a custom prompt in normalized state. */
    function findCustom(id) {
        var i;
        for (i = 0; i < state.customPrompts.length; i++) {
            if (state.customPrompts[i].id === id) {
                return state.customPrompts[i];
            }
        }
        return null;
    }

    /** Focus an action button for a custom prompt after re-rendering. */
    function focusCustomAction(id, action) {
        var buttons = elements.customList.querySelectorAll("button[data-action]");
        var i;
        for (i = 0; i < buttons.length; i++) {
            if (buttons[i].getAttribute("data-prompt-id") === id &&
                    buttons[i].getAttribute("data-action") === action) {
                buttons[i].focus();
                return;
            }
        }
        elements.customHeading.focus();
    }

    /** Focus a pinned prompt card after it is recreated. */
    function focusPinnedCard(id) {
        var cards = elements.promptList.querySelectorAll(".jp-pinned-card");
        var i;
        for (i = 0; i < cards.length; i++) {
            if (cards[i].getAttribute("data-prompt-id") === id) {
                cards[i].focus();
                return;
            }
        }
    }

    /** Remove every transient drag marker and reset native/pointer drag state. */
    function cleanupDragState() {
        var marked;
        var i;
        if (dragState.surface && dragState.pointerId !== null &&
                dragState.surface.releasePointerCapture) {
            try {
                dragState.surface.releasePointerCapture(dragState.pointerId);
            } catch (error) {
                // Capture may already have ended after pointerup or pointercancel.
            }
        }
        if (elements.promptList) {
            marked = elements.promptList.querySelectorAll(
                ".jp-dragging, .jp-drop-before, .jp-drop-after"
            );
            for (i = 0; i < marked.length; i++) {
                marked[i].classList.remove("jp-dragging");
                marked[i].classList.remove("jp-drop-before");
                marked[i].classList.remove("jp-drop-after");
            }
        }
        dragState.id = null;
        dragState.targetId = null;
        dragState.insertAfter = false;
        dragState.pointerId = null;
        dragState.surface = null;
        dragState.startX = 0;
        dragState.startY = 0;
        dragState.nativeBlocked = false;
    }

    /** Return the pinned card containing a descendant, when one exists. */
    function pinnedCardFrom(target) {
        var card = target && target.closest ? target.closest(".jp-prompt-card") : null;
        return card && card.getAttribute("data-pinned") === "true" ? card : null;
    }

    /** Return whether a descendant should retain its normal click/selection behavior. */
    function isInteractiveDescendant(target, card) {
        var current = target;
        var tag;
        while (current && current !== card) {
            tag = current.tagName ? current.tagName.toLowerCase() : "";
            if (tag === "a" || tag === "button" || tag === "input" ||
                    tag === "textarea" || tag === "select" || tag === "option" ||
                    tag === "label" || current.getAttribute("contenteditable") === "true" ||
                    current.getAttribute("data-no-drag") !== null) {
                return true;
            }
            current = current.parentNode;
        }
        return false;
    }

    /** Update the sole visual drop target from a pointer or native drag position. */
    function markDropTarget(card, clientY) {
        var cards = elements.promptList.querySelectorAll(".jp-pinned-card");
        var rect;
        var i;
        for (i = 0; i < cards.length; i++) {
            cards[i].classList.remove("jp-drop-before");
            cards[i].classList.remove("jp-drop-after");
        }
        if (!card || card.getAttribute("data-prompt-id") === dragState.id) {
            dragState.targetId = null;
            return;
        }
        rect = card.getBoundingClientRect();
        dragState.targetId = card.getAttribute("data-prompt-id");
        dragState.insertAfter = clientY >= rect.top + rect.height / 2;
        card.classList.add(dragState.insertAfter ? "jp-drop-after" : "jp-drop-before");
    }

    /** Persist a completed drag and restore focus to the moved prompt. */
    function finishDrag(commit) {
        var id = dragState.id;
        var targetId = dragState.targetId;
        var insertAfter = dragState.insertAfter;
        var before = state.pinnedOrder.join("|");
        var position;
        cleanupDragState();
        if (!commit || !id || !targetId) {
            return;
        }
        state = movePinnedRelative(state, id, targetId, insertAfter);
        if (state.pinnedOrder.join("|") === before) {
            focusPinnedCard(id);
            return;
        }
        position = state.pinnedOrder.filter(function (pinnedId) {
            return Boolean(promptMap()[pinnedId]);
        }).indexOf(id) + 1;
        persistState();
        render();
        announce("Moved pinned prompt to position " + position + ": " + promptMap()[id].text);
        focusPinnedCard(id);
    }

    /** Begin a native desktop drag from a pinned card, excluding child controls. */
    function handleDragStart(event) {
        var card = pinnedCardFrom(event.target);
        var selection = window.getSelection ? window.getSelection() : null;
        if (!card || card.getAttribute("draggable") !== "true" ||
                dragState.nativeBlocked || isInteractiveDescendant(event.target, card) ||
                event.altKey || (selection && !selection.isCollapsed)) {
            event.preventDefault();
            cleanupDragState();
            return;
        }
        cleanupDragState();
        dragState.id = card.getAttribute("data-prompt-id");
        card.classList.add("jp-dragging");
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", dragState.id);
        }
    }

    /** Track a native desktop drag over pinned cards only. */
    function handleDragOver(event) {
        var card = pinnedCardFrom(event.target);
        if (!dragState.id) {
            return;
        }
        if (!card) {
            markDropTarget(null, event.clientY);
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
        markDropTarget(card, event.clientY);
    }

    /** Resolve and commit the native drop at its final nested event target. */
    function handleDrop(event) {
        var card;
        if (!dragState.id) {
            return;
        }
        event.preventDefault();
        card = pinnedCardFrom(event.target);
        if (!card) {
            finishDrag(false);
            return;
        }
        markDropTarget(card, event.clientY);
        finishDrag(true);
    }

    /** Remember a card press; touch/pen dragging starts only after a movement threshold. */
    function handlePointerDown(event) {
        var card = pinnedCardFrom(event.target);
        dragState.nativeBlocked = Boolean(card && isInteractiveDescendant(event.target, card));
        if (!card || dragState.nativeBlocked || card.getAttribute("draggable") !== "true" ||
                event.pointerType === "mouse") {
            return;
        }
        cleanupDragState();
        dragState.pointerId = event.pointerId;
        dragState.surface = card;
        dragState.startX = event.clientX;
        dragState.startY = event.clientY;
    }

    /** Activate and track a touch/pen drag once intentional movement is clear. */
    function handlePointerMove(event) {
        var target;
        var distance;
        if (dragState.pointerId !== event.pointerId) {
            return;
        }
        if (!dragState.id) {
            distance = Math.sqrt(
                Math.pow(event.clientX - dragState.startX, 2) +
                Math.pow(event.clientY - dragState.startY, 2)
            );
            if (distance < POINTER_DRAG_THRESHOLD) {
                return;
            }
            dragState.id = dragState.surface.getAttribute("data-prompt-id");
            if (dragState.surface.setPointerCapture) {
                dragState.surface.setPointerCapture(event.pointerId);
            }
            dragState.surface.classList.add("jp-dragging");
        }
        event.preventDefault();
        target = document.elementFromPoint ? document.elementFromPoint(event.clientX, event.clientY) : event.target;
        markDropTarget(pinnedCardFrom(target), event.clientY);
    }

    /** Complete or cancel the currently captured touch/pen drag. */
    function handlePointerFinish(event) {
        var wasActive;
        var target;
        if (dragState.pointerId !== event.pointerId) {
            return;
        }
        wasActive = Boolean(dragState.id);
        if (wasActive && event.type === "pointerup") {
            target = document.elementFromPoint ?
                document.elementFromPoint(event.clientX, event.clientY) : event.target;
            markDropTarget(pinnedCardFrom(target), event.clientY);
        }
        finishDrag(wasActive && event.type === "pointerup");
        dragState.suppressClick = wasActive && event.type === "pointerup";
    }

    /** Move a focused pinned card one visible position with the arrow keys. */
    function handleReorderKeydown(event) {
        var card = pinnedCardFrom(event.target);
        var direction;
        var id;
        var visiblePinned;
        var visibleIndex;
        var targetId;
        var text;
        if (!card || event.target !== card ||
                (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
            return;
        }
        event.preventDefault();
        direction = event.key === "ArrowUp" ? -1 : 1;
        id = card.getAttribute("data-prompt-id");
        visiblePinned = state.pinnedOrder.filter(function (pinnedId) {
            return Boolean(promptMap()[pinnedId]);
        });
        visibleIndex = visiblePinned.indexOf(id);
        targetId = visiblePinned[visibleIndex + direction];
        if (!targetId) {
            announce(direction < 0 ?
                "This pinned prompt is already first." :
                "This pinned prompt is already last.");
            card.focus();
            return;
        }
        text = promptMap()[id].text;
        state = movePinnedRelative(state, id, targetId, direction > 0);
        persistState();
        render();
        visibleIndex = state.pinnedOrder.filter(function (pinnedId) {
            return Boolean(promptMap()[pinnedId]);
        }).indexOf(id);
        announce("Moved pinned prompt to position " + (visibleIndex + 1) + ": " + text);
        focusPinnedCard(id);
    }

    /** Reset the shared custom form to add mode. */
    function resetForm() {
        editingId = null;
        elements.customForm.reset();
        elements.formHeading.textContent = "Add a custom prompt";
        elements.saveCustom.textContent = "Add Prompt";
        setHidden(elements.cancelEdit, true);
        elements.customText.removeAttribute("aria-invalid");
        elements.customTags.removeAttribute("aria-invalid");
        elements.textError.textContent = "";
        elements.tagsError.textContent = "";
    }

    /** Validate the custom form and return normalized fields. */
    function validateCustomForm() {
        var text = elements.customText.value.trim();
        var tags = normalizeTags(elements.customTags.value);
        var valid = true;
        elements.textError.textContent = "";
        elements.tagsError.textContent = "";
        elements.customText.removeAttribute("aria-invalid");
        elements.customTags.removeAttribute("aria-invalid");
        if (!text) {
            elements.textError.textContent = "Enter a prompt before saving.";
            elements.customText.setAttribute("aria-invalid", "true");
            valid = false;
        } else if (text.length > MAX_PROMPT_LENGTH) {
            elements.textError.textContent = "Keep the prompt to 500 characters or fewer.";
            elements.customText.setAttribute("aria-invalid", "true");
            valid = false;
        }
        if (!tags.valid) {
            elements.tagsError.textContent = tags.error;
            elements.customTags.setAttribute("aria-invalid", "true");
            valid = false;
        }
        return { valid: valid, text: text, tags: tags.tags };
    }

    /** Handle custom creation and editing. */
    function handleFormSubmit(event) {
        var fields;
        var id;
        event.preventDefault();
        if (checkLocalDay()) {
            render();
        }
        fields = validateCustomForm();
        if (!fields.valid) {
            announce("Please correct the custom prompt form.");
            (elements.customText.getAttribute("aria-invalid") ? elements.customText : elements.customTags).focus();
            return;
        }
        if (editingId) {
            id = editingId;
            state = editCustomPrompt(state, id, fields.text, fields.tags);
            persistState();
            resetForm();
            render();
            announce("Custom prompt updated.");
            focusCustomAction(id, "edit");
            return;
        }
        if (state.customPrompts.length >= MAX_CUSTOM_PROMPTS) {
            elements.textError.textContent = "You have reached the limit of 200 custom prompts.";
            elements.customText.setAttribute("aria-invalid", "true");
            announce("A custom prompt could not be added because the saved prompt limit was reached.");
            elements.customText.focus();
            return;
        }
        customIdCounter++;
        id = createCustomId(window.crypto, Date.now(), Math.random(), customIdCounter);
        state = addCustomPrompt(state, { id: id, text: fields.text, tags: fields.tags });
        persistState();
        resetForm();
        render();
        announce("Custom prompt added. It is eligible for prompt selections.");
    }

    /** Handle pin actions in the rendered prompt list. */
    function handlePromptAction(event) {
        var button = event.target.closest ? event.target.closest("button[data-action]") : event.target;
        var action;
        var id;
        if (dragState.suppressClick) {
            dragState.suppressClick = false;
            event.preventDefault();
            if (event.stopPropagation) {
                event.stopPropagation();
            }
            return;
        }
        if (!button || !button.getAttribute) {
            return;
        }
        action = button.getAttribute("data-action");
        id = button.getAttribute("data-prompt-id");
        if (!id || !promptMap()[id]) {
            return;
        }
        if (action !== "pin" && action !== "unpin") {
            return;
        }
        checkLocalDay();
        state = action === "pin" ? pinPrompt(state, id) : unpinPrompt(state, id);
        persistState();
        render();
        announce(action === "pin" ? "Prompt pinned." : "Prompt unpinned.");
    }

    /** Handle custom edit and inline deletion controls. */
    function handleCustomAction(event) {
        var button = event.target.closest ? event.target.closest("button[data-action]") : event.target;
        var action;
        var id;
        var prompt;
        if (!button || !button.getAttribute) {
            return;
        }
        action = button.getAttribute("data-action");
        id = button.getAttribute("data-prompt-id");
        prompt = findCustom(id);
        if (!prompt) {
            return;
        }
        checkLocalDay();
        if (action === "edit") {
            editingId = id;
            elements.formHeading.textContent = "Edit custom prompt";
            elements.customText.value = prompt.text;
            elements.customTags.value = prompt.tags.join(", ");
            elements.saveCustom.textContent = "Save Changes";
            setHidden(elements.cancelEdit, false);
            render();
            elements.customText.focus();
            announce("Editing custom prompt.");
        } else if (action === "pin" || action === "unpin") {
            state = action === "pin" ? pinPrompt(state, id) : unpinPrompt(state, id);
            persistState();
            render();
            announce(action === "pin" ? "Custom prompt pinned." : "Custom prompt unpinned.");
            focusCustomAction(id, action === "pin" ? "unpin" : "pin");
        } else if (action === "delete") {
            state = deleteCustomPrompt(state, id);
            if (editingId === id) {
                resetForm();
            }
            persistState();
            render();
            announce("Custom prompt deleted.");
            elements.customHeading.focus();
        }
    }

    /** Clamp, save, and render a requested random count. */
    function handleCountChange() {
        var requested;
        var corrected;
        checkLocalDay();
        requested = Number(elements.randomCount.value);
        corrected = Number.isFinite(requested) ? clamp(Math.round(requested), MIN_RANDOM_COUNT, MAX_RANDOM_COUNT) :
            DEFAULT_RANDOM_COUNT;
        state = cloneState(state);
        state.randomCount = corrected;
        elements.randomCount.value = String(corrected);
        persistState();
        render();
        announce(requested === corrected ? "Prompt count updated to " + corrected + "." :
            "Prompt count was corrected to " + corrected + ".");
    }

    /** Replace only the unpinned random set for the current page visit. */
    function generateMore() {
        checkLocalDay();
        moreExcludedIds = currentRandomIds.slice();
        moreIndex++;
        mode = "more";
        render();
        announce("Random prompts were replaced with temporary alternatives.");
    }

    /** Return from temporary mode to the deterministic daily set. */
    function restoreToday() {
        checkLocalDay();
        mode = "daily";
        moreIndex = 0;
        moreExcludedIds = [];
        render();
        announce("Today's stable prompt set was restored.");
    }

    /** Resolve all required DOM references. */
    function collectElements() {
        var ids = [
            "prompt-list", "custom-list", "custom-count", "prompts-empty", "custom-empty",
            "random-count", "generate-more", "local-date",
            "restore-today", "custom-form", "form-heading", "custom-text",
            "custom-tags", "text-error", "tags-error", "save-custom", "cancel-edit",
            "custom-heading", "announcer"
        ];
        ids.forEach(function (name) {
            var property = name.replace(/-([a-z])/g, function (_, letter) { return letter.toUpperCase(); });
            elements[property] = document.getElementById("jp-" + name);
        });
    }

    /** Load installation identity and persistent state through guarded storage. */
    function loadPersistence() {
        var installation;
        var migratedInstallation;
        var savedState;
        var migrated;
        try {
            storageBackend = window.localStorage;
        } catch (error) {
            storageBackend = null;
        }
        installation = readStorage(storageBackend, INSTALLATION_KEY);
        savedState = readStorage(storageBackend, STATE_KEY);
        migratedInstallation = installation.error || installation.value === null ?
            null : migrateInstallation(installation.value);
        if (migratedInstallation && migratedInstallation.browserId) {
            browserId = migratedInstallation.browserId;
        } else {
            browserId = createBrowserId(window.crypto);
            if (migratedInstallation && migratedInstallation.future) {
                storageWarning = "Browser identity data is from a newer version and was left unchanged; this visit uses a temporary identity.";
            } else if (!writeStorage(storageBackend, INSTALLATION_KEY,
                    { version: INSTALLATION_VERSION, browserId: browserId })) {
                storageWarning = "Browser storage is unavailable; this visit is usable but identity and changes may not persist.";
                stateWritable = false;
            } else if (installation.error || (migratedInstallation && migratedInstallation.warning)) {
                storageWarning = "Saved browser identity was invalid, so a new safe identity was created.";
            }
        }
        if (savedState.error) {
            storageWarning = savedState.reason === "parse" ?
                "Saved prompt data was corrupt, so safe defaults are in use." :
                "Saved prompts could not be read. Defaults are in use and changes may not persist.";
            if (savedState.reason === "access") {
                stateWritable = false;
            }
            return;
        }
        if (savedState.value !== null) {
            migrated = migrateState(savedState.value);
            state = migrated.state;
            if (migrated.warning) {
                storageWarning = migrated.future ?
                    "Saved data is from a newer version and was left unchanged; this visit uses defaults." :
                    "Some saved data was invalid, so safe defaults were used.";
            }
            if (migrated.future) {
                stateWritable = false;
            } else if (migrated.changed && !writeStorage(storageBackend, STATE_KEY, state)) {
                storageWarning = "Saved prompts were normalized for this visit, but browser storage could not be updated.";
                stateWritable = false;
            }
        }
    }

    /** Fetch, parse, and validate the static prompt catalog. */
    function loadCatalog(url) {
        return window.fetch(url, { credentials: "same-origin" }).then(function (response) {
            if (!response.ok) {
                throw new Error("Prompt catalog request failed with status " + response.status + ".");
            }
            return response.json();
        }).then(function (value) {
            var normalized = normalizeCatalog(value);
            if (normalized.rejected) {
                catalogWarning = normalized.rejected + " invalid catalog prompt" +
                    (normalized.rejected === 1 ? " was" : "s were") + " skipped.";
            }
            return normalized.prompts;
        });
    }

    /** Bind all interaction handlers after the page has been identified. */
    function bindEvents() {
        elements.customForm.addEventListener("submit", handleFormSubmit);
        elements.cancelEdit.addEventListener("click", function () {
            resetForm();
            announce("Editing cancelled.");
            elements.customText.focus();
        });
        elements.randomCount.addEventListener("change", handleCountChange);
        elements.randomCount.addEventListener("blur", function () {
            if (elements.randomCount.value === "" ||
                    Number(elements.randomCount.value) < MIN_RANDOM_COUNT ||
                    Number(elements.randomCount.value) > MAX_RANDOM_COUNT) {
                handleCountChange();
            }
        });
        elements.generateMore.addEventListener("click", generateMore);
        elements.restoreToday.addEventListener("click", restoreToday);
        elements.promptList.addEventListener("click", handlePromptAction);
        elements.promptList.addEventListener("keydown", handleReorderKeydown);
        elements.promptList.addEventListener("dragstart", handleDragStart);
        elements.promptList.addEventListener("dragover", handleDragOver);
        elements.promptList.addEventListener("drop", handleDrop);
        elements.promptList.addEventListener("dragend", function () {
            finishDrag(false);
        });
        elements.promptList.addEventListener("pointerdown", handlePointerDown);
        elements.promptList.addEventListener("pointermove", handlePointerMove);
        elements.promptList.addEventListener("pointerup", handlePointerFinish);
        elements.promptList.addEventListener("pointercancel", handlePointerFinish);
        elements.promptList.addEventListener("lostpointercapture", handlePointerFinish);
        elements.customList.addEventListener("click", handleCustomAction);
        if (window.addEventListener) {
            window.addEventListener("resize", schedulePromptQuantization);
        }
    }

    /** Initialize persistence, catalog loading, rendering, and interactions. */
    function init() {
        var now;
        app = document.getElementById("jp-app");
        if (!app) {
            return;
        }
        collectElements();
        now = new Date();
        localDay = localDateKey(now);
        updateJournalDate(now);
        loadPersistence();
        bindEvents();
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(schedulePromptQuantization);
        }
        loadCatalog(app.getAttribute("data-catalog-url")).then(function (prompts) {
            builtins = prompts;
            initialized = true;
            render();
            announce(prompts.length ? "Today's prompts are ready." :
                "The catalog is empty. Add a custom prompt to begin.");
        }, function () {
            builtins = [];
            initialized = true;
            catalogWarning = "Built-in prompts could not be loaded. Check your connection or reload; custom prompts remain available.";
            render();
            announce(state.customPrompts.length ?
                "Showing your custom prompts without the built-in catalog." :
                "No prompts are available. Add a custom prompt or reload to try the catalog again.");
        }).catch(function () {
            initialized = false;
            elements.generateMore.disabled = true;
            elements.randomCount.disabled = true;
            elements.announcer.textContent =
                "The prompt display could not be updated. Reload the page to try again.";
        });
    }

    document.addEventListener("DOMContentLoaded", init);
})();
