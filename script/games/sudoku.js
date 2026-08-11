/**
 * Browser controller for Sudoku v1 DOM, focus, history, workers, and storage.
 */
(function () {
    "use strict";

    var protocol = window.SudokuProtocolV1;
    var INITIAL_LOADING = "Loading Sudoku puzzle.";
    var SELECTED_LOADING = "Loading the selected Sudoku puzzle.";
    var READY_MESSAGE = "Sudoku puzzle ready.";
    var COMPLETE_MESSAGE = "Puzzle complete.";
    var STORAGE_WARNING = "Sudoku progress could not be saved in this browser.";
    var CORRUPTION_WARNING = "Saved Sudoku progress was invalid and was not loaded.";
    var EXTERNAL_UPDATE = "Sudoku progress was updated in another tab.";
    var EXTERNAL_RESET = "Sudoku progress was reset in another tab.";
    var ROLLOVER_MESSAGE = "A new UTC daily puzzle is available.";
    var ERROR_INVALID = "This Sudoku link is invalid.";
    var ERROR_START = "This browser could not start Sudoku generation.";
    var ERROR_GENERATION = "Sudoku generation stopped because of an error.";
    var ERROR_BUDGET = "This puzzle could not be generated under Sudoku v1 limits.";
    var RECOVERY_DAILY = "Go to today's daily puzzle";
    var RECOVERY_RANDOM = "Create a new random puzzle";
    var RETRY = "Retry loading this puzzle";
    var RETRYING = "Retrying\u2026";
    var CELL_COUNT = 81;
    var elements;
    var identity;
    var state;
    var worker;
    var requestId = 0;
    var activeKey;
    var conflicts = new Array(CELL_COUNT).fill(false);
    var retryButton;
    var retryPending = false;
    var rolloverTimer;

    /**
     * Reads the injectable test clock or the platform clock.
     * @returns {Date} Fresh current instant.
     */
    function nowDate() {
        var supplied = typeof window.__SHUGG_SUDOKU_NOW__ === "function"
            ? window.__SHUGG_SUDOKU_NOW__()
            : undefined;
        var date = supplied === undefined ? new Date() : new Date(supplied);

        return Number.isNaN(date.getTime()) ? new Date() : date;
    }

    /**
     * Returns the current UTC calendar day.
     * @returns {string} `YYYY-MM-DD`.
     */
    function utcDay() {
        return nowDate().toISOString().slice(0, 10);
    }

    /**
     * Collects the application elements by fixed trusted IDs.
     * @returns {Object} Element map.
     */
    function collectElements() {
        return {
            app: document.getElementById("sdk-app"),
            title: document.getElementById("sdk-title"),
            kind: document.getElementById("sdk-kind"),
            identityValue: document.getElementById("sdk-identity-value"),
            daily: document.getElementById("sdk-daily"),
            random: document.getElementById("sdk-random"),
            seedForm: document.getElementById("sdk-seed-form"),
            seed: document.getElementById("sdk-seed"),
            status: document.getElementById("sdk-status"),
            alert: document.getElementById("sdk-alert"),
            progress: document.getElementById("sdk-progress"),
            loading: document.getElementById("sdk-loading"),
            recovery: document.getElementById("sdk-recovery"),
            grid: document.getElementById("sdk-grid"),
            keypad: document.getElementById("sdk-keypad"),
            notes: document.getElementById("sdk-notes"),
            check: document.getElementById("sdk-check"),
            undo: document.getElementById("sdk-undo"),
            reset: document.getElementById("sdk-reset"),
            completion: document.getElementById("sdk-completion"),
            completionHeading: document.getElementById("sdk-completion-heading"),
            storageWarning: document.getElementById("sdk-storage-warning"),
            clearAll: document.getElementById("sdk-clear-all")
        };
    }

    /**
     * Replaces a live region with one complete message.
     * @param {HTMLElement} region Live region.
     * @param {string} message Fixed message.
     */
    function announce(region, message) {
        region.textContent = message;
    }

    /**
     * Reports one persistent nonblocking storage warning.
     * @param {string} message Fixed generic warning.
     */
    function warnStorage(message) {
        elements.storageWarning.hidden = false;
        elements.storageWarning.textContent = message;
    }

    /**
     * Terminates and detaches the sole generation worker.
     */
    function stopWorker() {
        if (!worker) {
            return;
        }
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
        worker = null;
    }

    /**
     * Sets all gameplay controls to their ready/locked state.
     */
    function updateControls() {
        var unavailable = !state || state.completed;
        var cells = elements.grid.querySelectorAll(".sdk-cell");

        elements.notes.disabled = unavailable;
        elements.check.disabled = unavailable;
        elements.undo.disabled = unavailable || state.undoStack.length === 0;
        elements.reset.disabled = !state;
        elements.notes.setAttribute("aria-pressed", state && state.notesMode ? "true" : "false");
        elements.notes.textContent = state && state.notesMode ? "Notes on" : "Notes";
        elements.keypad.querySelectorAll("button").forEach(function (button) {
            button.disabled = unavailable;
        });
        cells.forEach(function (cell) {
            cell.disabled = unavailable;
        });
    }

    /**
     * Produces a complete accessible cell label.
     * @param {number} index Cell index.
     * @returns {string} Cell label.
     */
    function cellLabel(index) {
        var row = Math.floor(index / 9) + 1;
        var column = (index % 9) + 1;
        var clue = state.clues[index];
        var entry = state.entries[index];
        var labels = ["Row " + row, "column " + column];
        var notes;

        if (clue) {
            labels.push("Clue", "value " + clue);
        } else {
            labels.push("Editable");
            if (entry) {
                labels.push("value " + entry);
            } else {
                notes = [];
                for (var digit = 1; digit <= 9; digit += 1) {
                    if (state.notes[index] & (1 << (digit - 1))) {
                        notes.push(digit);
                    }
                }
                labels.push(notes.length ? "candidates " + notes.join(", ") : "empty");
            }
        }
        if (conflicts[index]) {
            labels.push("Conflict");
        }
        if (state.checkedErrors[index]) {
            labels.push("Incorrect");
        }
        return labels.join(", ");
    }

    /**
     * Appends candidate digit spans using fixed DOM operations.
     * @param {HTMLButtonElement} cell Cell button.
     * @param {number} mask Candidate mask.
     */
    function appendNotes(cell, mask) {
        var notes = document.createElement("span");

        notes.classList.add("sdk-notes");
        for (var digit = 1; digit <= 9; digit += 1) {
            var note = document.createElement("span");

            note.classList.add("sdk-note");
            note.textContent = mask & (1 << (digit - 1)) ? String(digit) : "";
            notes.appendChild(note);
        }
        cell.appendChild(notes);
    }

    /**
     * Projects the entire runtime state onto the fixed board and controls.
     */
    function render() {
        var fragment = document.createDocumentFragment();

        if (!state) {
            return;
        }
        conflicts = state.completed
            ? new Array(CELL_COUNT).fill(false)
            : protocol.deriveConflicts(state);
        for (var index = 0; index < CELL_COUNT; index += 1) {
            var cell = document.createElement("button");
            var value = state.clues[index] || state.entries[index];

            cell.type = "button";
            cell.classList.add("sdk-cell");
            cell.dataset.index = String(index);
            cell.setAttribute("role", "gridcell");
            cell.setAttribute("aria-rowindex", String(Math.floor(index / 9) + 1));
            cell.setAttribute("aria-colindex", String((index % 9) + 1));
            cell.setAttribute("aria-selected", index === state.selected ? "true" : "false");
            cell.setAttribute("tabindex", index === state.selected ? "0" : "-1");
            if (state.clues[index]) {
                cell.classList.add("sdk-cell--clue");
                cell.setAttribute("aria-readonly", "true");
            } else {
                cell.setAttribute("aria-readonly", "false");
            }
            if (conflicts[index]) {
                cell.classList.add("sdk-cell--conflict");
            }
            if (state.checkedErrors[index]) {
                cell.classList.add("sdk-cell--incorrect");
            }
            if (value) {
                cell.appendChild(document.createTextNode(String(value)));
            } else if (state.notes[index]) {
                appendNotes(cell, state.notes[index]);
            }
            if (conflicts[index] || state.checkedErrors[index]) {
                var marker = document.createElement("span");

                marker.classList.add("sdk-cell-marker");
                marker.setAttribute("aria-hidden", "true");
                marker.textContent = "!";
                cell.appendChild(marker);
            }
            cell.setAttribute("aria-label", cellLabel(index));
            fragment.appendChild(cell);
        }
        elements.grid.replaceChildren(fragment);
        elements.completion.hidden = !state.completed;
        updateControls();
    }

    /**
     * Focuses the selected ready gridcell if it exists.
     */
    function focusSelected() {
        var selected = elements.grid.querySelector('[data-index="' + String(state.selected) + '"]');

        if (selected) {
            selected.focus();
        }
    }

    /**
     * Creates the fixed keypad once.
     */
    function buildKeypad() {
        var fragment = document.createDocumentFragment();

        for (var digit = 1; digit <= 9; digit += 1) {
            var button = document.createElement("button");

            button.type = "button";
            button.classList.add("sdk-key");
            button.dataset.digit = String(digit);
            button.textContent = String(digit);
            button.disabled = true;
            fragment.appendChild(button);
        }
        var erase = document.createElement("button");

        erase.type = "button";
        erase.classList.add("sdk-key");
        erase.dataset.digit = "0";
        erase.textContent = "Erase";
        erase.disabled = true;
        fragment.appendChild(erase);
        elements.keypad.appendChild(fragment);
    }

    /**
     * Applies a reducer action, persistence, rendering, and completion focus.
     * @param {Object} action Pure reducer action.
     */
    function dispatch(action) {
        var wasCompleted;
        var restoreGridFocus;
        var outcome;

        if (!state) {
            return;
        }
        wasCompleted = state.completed;
        restoreGridFocus = Boolean(
            document.activeElement &&
            document.activeElement.classList.contains("sdk-cell")
        );
        outcome = protocol.reduce(state, action);
        if (!outcome.changed) {
            return;
        }
        state = outcome.state;
        if (outcome.remove) {
            removeActiveRecord();
        } else if (outcome.persist) {
            saveProgress();
        }
        render();
        if (restoreGridFocus && !state.completed) {
            focusSelected();
        }
        if (!wasCompleted && state.completed) {
            saveProgress();
            announce(elements.status, COMPLETE_MESSAGE);
            elements.completionHeading.focus();
        }
    }

    /**
     * Safely enumerates Sudoku namespace keys in lexical order.
     * @returns {string[]|null} Keys or null on blocked storage.
     */
    function namespaceKeys() {
        var keys = [];

        try {
            for (var index = 0; index < window.localStorage.length; index += 1) {
                var key = window.localStorage.key(index);

                if (typeof key === "string" &&
                        key.indexOf(protocol.constants.storagePrefix) === 0) {
                    keys.push(key);
                }
            }
        } catch (_error) {
            warnStorage(STORAGE_WARNING);
            return null;
        }
        return keys.sort();
    }

    /**
     * Removes a key while preserving in-memory gameplay on failure.
     * @param {string} key Exact storage key.
     * @returns {boolean} Whether removal succeeded.
     */
    function safeRemove(key) {
        try {
            window.localStorage.removeItem(key);
            return true;
        } catch (_error) {
            warnStorage(STORAGE_WARNING);
            return false;
        }
    }

    /**
     * Cleans malformed/oversized namespace entries and applies retention.
     */
    function cleanupStorage() {
        var keys = namespaceKeys();
        var items = [];

        if (!keys) {
            return;
        }
        if (keys.length > 128) {
            keys.slice().reverse().forEach(function (key) {
                if (keys.length > 128 && key !== activeKey && safeRemove(key)) {
                    keys.splice(keys.indexOf(key), 1);
                }
            });
        }
        keys.forEach(function (key) {
            var value;
            var parsedKey = protocol.parseStorageKey(key);
            var envelope;

            try {
                value = window.localStorage.getItem(key);
            } catch (_error) {
                warnStorage(STORAGE_WARNING);
                return;
            }
            if (!parsedKey.ok || typeof value !== "string" ||
                    new TextEncoder().encode(value).length > 4096) {
                safeRemove(key);
                return;
            }
            try {
                envelope = JSON.parse(value);
            } catch (_error) {
                safeRemove(key);
                return;
            }
            items.push({
                key: key,
                value: value,
                updatedAt: envelope && typeof envelope.updatedAt === "string"
                    ? envelope.updatedAt
                    : "",
                valid: protocol.validateEnvelope(envelope, key).ok
            });
        });
        protocol.planRetention(items, activeKey).forEach(function (key) {
            safeRemove(key);
        });
    }

    /**
     * Persists one exact progress record and then enforces retention.
     */
    function saveProgress() {
        var text;

        try {
            text = protocol.serializeRecord(state, nowDate().toISOString());
            window.localStorage.setItem(activeKey, text);
        } catch (_error) {
            warnStorage(STORAGE_WARNING);
            return;
        }
        cleanupStorage();
    }

    /**
     * Removes the active record for Reset semantics.
     */
    function removeActiveRecord() {
        safeRemove(activeKey);
    }

    /**
     * Loads and validates active progress only after puzzle generation.
     * @param {Object} puzzle Valid generated puzzle.
     * @returns {Object|undefined} Fresh validated record.
     */
    function loadProgress(puzzle) {
        var text;
        var parsed;

        try {
            text = window.localStorage.getItem(activeKey);
        } catch (_error) {
            warnStorage(STORAGE_WARNING);
            return undefined;
        }
        if (text === null) {
            cleanupStorage();
            return undefined;
        }
        parsed = protocol.parseRecord(text, activeKey, puzzle.clues, puzzle.solution);
        if (!parsed.ok) {
            safeRemove(activeKey);
            warnStorage(CORRUPTION_WARNING);
            return undefined;
        }
        cleanupStorage();
        return parsed.record;
    }

    /**
     * Re-reads authoritative active storage for a same-key invalidation.
     */
    function reconcileStorage() {
        var text;
        var parsed;

        if (!state) {
            return;
        }
        try {
            text = window.localStorage.getItem(activeKey);
        } catch (_error) {
            warnStorage(STORAGE_WARNING);
            return;
        }
        if (text === null) {
            state = protocol.reduce(state, {type: "externalReset"}).state;
            render();
            announce(elements.status, EXTERNAL_RESET);
            return;
        }
        parsed = protocol.parseRecord(text, activeKey, state.clues, state.solution);
        if (!parsed.ok) {
            warnStorage(CORRUPTION_WARNING);
            return;
        }
        state = protocol.reduce(state, {type: "externalReplace", record: parsed.record}).state;
        render();
        announce(elements.status, EXTERNAL_UPDATE);
    }

    /**
     * Replaces current browser history with the safe canonical identity URL.
     * @param {Object} nextIdentity Valid identity.
     */
    function canonicalize(nextIdentity) {
        var route = elements.app.dataset.route;
        var target = protocol.canonicalUrl(window.location.origin, route, nextIdentity);

        window.history.replaceState(null, "", target);
    }

    /**
     * Adds a native fixed-label recovery button.
     * @param {string} label Accessible button name.
     * @param {function(): void} handler Click handler.
     * @returns {HTMLButtonElement} Mounted button.
     */
    function recoveryButton(label, handler) {
        var button = document.createElement("button");

        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", handler);
        elements.recovery.appendChild(button);
        return button;
    }

    /**
     * Shows one terminal state with deterministic recovery and focus.
     * @param {"invalid"|"start"|"generation"|"budget"} kind Error kind.
     */
    function showError(kind) {
        var message;
        var heading = document.createElement("h2");
        var explanation = document.createElement("p");
        var focused = document.activeElement;

        stopWorker();
        state = null;
        elements.grid.replaceChildren();
        elements.grid.setAttribute("aria-busy", "false");
        elements.loading.hidden = true;
        elements.progress.textContent = "";
        if (retryPending && retryButton && retryButton.isConnected) {
            Array.from(elements.recovery.children).forEach(function (child) {
                if (child !== retryButton) {
                    child.remove();
                }
            });
        } else {
            elements.recovery.replaceChildren();
        }
        elements.recovery.hidden = false;
        heading.textContent = "Error";
        heading.setAttribute("tabindex", "-1");
        message = kind === "invalid" ? ERROR_INVALID
            : kind === "start" ? ERROR_START
                : kind === "budget" ? ERROR_BUDGET : ERROR_GENERATION;
        explanation.textContent = message;
        elements.recovery.prepend(explanation);
        elements.recovery.prepend(heading);
        if (retryPending && retryButton && (kind === "start" || kind === "generation")) {
            retryButton.disabled = false;
            retryButton.textContent = RETRY;
        } else if (kind === "start" || kind === "generation") {
            retryButton = recoveryButton(RETRY, retryGeneration);
        }
        recoveryButton(RECOVERY_DAILY, selectDaily);
        if (kind === "budget" && cryptoAvailable()) {
            recoveryButton(RECOVERY_RANDOM, selectRandom);
        }
        announce(elements.alert, message);
        if (retryPending && retryButton) {
            retryPending = false;
            retryButton.focus();
        } else if (!focused || !focused.isConnected || focused.disabled) {
            heading.focus();
        }
    }

    /**
     * Enters the named busy-grid state before starting a worker.
     * @param {boolean} initial Whether this is initial page loading.
     */
    function showLoading(initial) {
        var focused = document.activeElement;

        state = null;
        elements.alert.textContent = "";
        if (retryPending && retryButton && retryButton.isConnected) {
            elements.recovery.hidden = false;
        } else {
            elements.recovery.hidden = true;
            elements.recovery.replaceChildren();
        }
        elements.grid.replaceChildren();
        elements.grid.setAttribute("aria-busy", "true");
        elements.loading.hidden = false;
        elements.loading.textContent = initial ? INITIAL_LOADING : SELECTED_LOADING;
        elements.progress.textContent = "";
        elements.completion.hidden = true;
        announce(elements.status, initial ? INITIAL_LOADING : SELECTED_LOADING);
        elements.notes.disabled = true;
        elements.check.disabled = true;
        elements.undo.disabled = true;
        elements.reset.disabled = true;
        elements.keypad.querySelectorAll("button").forEach(function (button) {
            button.disabled = true;
        });
        if (focused && (!focused.isConnected || focused.disabled) && focused !== retryButton) {
            elements.loading.focus();
        }
    }

    /**
     * Starts a fresh worker for the current identity at attempt zero.
     * @param {boolean} initial Whether this is the initial page request.
     */
    function startGeneration(initial) {
        var currentWorker;
        var currentRequest;

        stopWorker();
        showLoading(initial);
        requestId += 1;
        currentRequest = requestId;
        try {
            if (typeof window.Worker !== "function") {
                showError("start");
                return;
            }
            currentWorker = new Worker(elements.app.dataset.workerUrl);
            worker = currentWorker;
        } catch (_error) {
            showError("start");
            return;
        }
        currentWorker.onmessage = function (event) {
            var message = event.data;

            if (worker !== currentWorker || !message || message.requestId !== currentRequest) {
                return;
            }
            if (!protocol.validateResponse(message, identity.puzzleId)) {
                showError("generation");
                return;
            }
            if (message.type === "progress") {
                elements.progress.textContent = "Generation attempt " + (message.attempt + 1) + " of 12.";
                return;
            }
            stopWorker();
            if (message.type === "failure") {
                showError("budget");
                return;
            }
            if (message.type === "error") {
                showError("generation");
                return;
            }
            activeKey = protocol.storageKey(identity);
            state = protocol.createState(message.puzzle, loadProgress(message.puzzle));
            elements.recovery.hidden = true;
            elements.recovery.replaceChildren();
            elements.grid.setAttribute("aria-busy", "false");
            elements.loading.hidden = true;
            elements.progress.textContent = "";
            render();
            announce(elements.status, state.completed ? COMPLETE_MESSAGE : READY_MESSAGE);
            if (retryPending) {
                retryPending = false;
                focusSelected();
            }
        };
        currentWorker.onerror = function () {
            if (worker === currentWorker) {
                showError("generation");
            }
        };
        currentWorker.onmessageerror = currentWorker.onerror;
        currentWorker.postMessage({
            protocol: 1,
            type: "generate",
            requestId: currentRequest,
            identity: identity
        });
    }

    /**
     * Selects and canonicalizes an identity without a page reload.
     * @param {Object} nextIdentity Valid identity.
     */
    function selectIdentity(nextIdentity) {
        identity = nextIdentity;
        canonicalize(identity);
        elements.kind.textContent = identity.kind === "day" ? "Daily puzzle \u00b7 UTC" : "Custom seed";
        elements.identityValue.textContent = identity.kind === "day" ? identity.value : "";
        scheduleRollover();
        startGeneration(false);
    }

    /**
     * Selects today's current UTC daily puzzle.
     */
    function selectDaily() {
        selectIdentity(protocol.makeIdentity("day", utcDay()));
    }

    /**
     * Reports whether secure opaque random seed generation is available.
     * @returns {boolean} Whether Web Crypto is available.
     */
    function cryptoAvailable() {
        return Boolean(window.crypto && typeof window.crypto.getRandomValues === "function");
    }

    /**
     * Generates and selects a 16-byte lowercase hexadecimal seed.
     */
    function selectRandom() {
        var bytes;
        var seed;
        var encoded;

        if (!cryptoAvailable()) {
            return;
        }
        bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        seed = Array.from(bytes).map(function (byte) {
            return byte.toString(16).padStart(2, "0");
        }).join("");
        encoded = protocol.encodeSeed(seed);
        selectIdentity(protocol.makeIdentity("seed", encoded.token));
    }

    /**
     * Retries the same identity in a fresh worker while keeping focus mounted.
     */
    function retryGeneration() {
        retryPending = true;
        retryButton.disabled = true;
        retryButton.textContent = RETRYING;
        startGeneration(false);
    }

    /**
     * Moves selection without wrapping and optionally focuses the cell.
     * @param {number} index Target cell.
     * @param {boolean} focus Whether to focus after rendering.
     */
    function selectCell(index, focus) {
        if (!state || index < 0 || index >= CELL_COUNT) {
            return;
        }
        dispatch({type: "select", index: index});
        if (focus) {
            focusSelected();
        }
    }

    /**
     * Handles exact grid keyboard commands.
     * @param {KeyboardEvent} event Grid key event.
     */
    function handleGridKey(event) {
        var index;
        var row;
        var target;
        var handled = true;

        if (!state) {
            return;
        }
        index = Number(event.target.dataset.index);
        row = Math.floor(index / 9);
        switch (event.key) {
        case "ArrowLeft": target = Math.max(row * 9, index - 1); break;
        case "ArrowRight": target = Math.min(row * 9 + 8, index + 1); break;
        case "ArrowUp": target = Math.max(index - 9, index % 9); break;
        case "ArrowDown": target = Math.min(index + 9, 72 + (index % 9)); break;
        case "Home": target = event.ctrlKey || event.metaKey ? 0 : row * 9; break;
        case "End": target = event.ctrlKey || event.metaKey ? 80 : row * 9 + 8; break;
        case "Backspace":
        case "Delete":
        case "0": dispatch({type: "erase", index: index}); break;
        case "n":
        case "N": dispatch({type: "toggleNotes"}); break;
        case "u":
        case "U": dispatch({type: "undo"}); break;
        default:
            if (/^[1-9]$/u.test(event.key)) {
                dispatch({type: "digit", index: index, digit: Number(event.key)});
            } else {
                handled = false;
            }
        }
        if (!handled) {
            return;
        }
        event.preventDefault();
        if (target !== undefined) {
            selectCell(target, true);
        } else if (document.activeElement && document.activeElement.classList.contains("sdk-cell")) {
            focusSelected();
        }
    }

    /**
     * Schedules detection of the next UTC day without replacing open puzzles.
     */
    function scheduleRollover() {
        var now = nowDate();
        var next = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1
        );
        var delay = Math.min(next - now.getTime() + 50, 0x7fffffff);

        window.clearTimeout(rolloverTimer);
        rolloverTimer = window.setTimeout(checkRollover, Math.max(delay, 50));
    }

    /**
     * Announces availability when an open daily identity becomes archived.
     */
    function checkRollover() {
        if (identity && identity.kind === "day" && identity.value !== utcDay()) {
            announce(elements.status, ROLLOVER_MESSAGE);
        }
        scheduleRollover();
    }

    /**
     * Deletes bounded valid namespace keys and resets active in-memory progress.
     */
    function clearAllProgress() {
        var keys;

        if (!window.confirm("Clear all saved Sudoku progress?")) {
            return;
        }
        keys = namespaceKeys();
        if (keys) {
            if (keys.length > 128) {
                keys.slice().reverse().forEach(function (key) {
                    if (keys.length > 128 && key !== activeKey && safeRemove(key)) {
                        keys.splice(keys.indexOf(key), 1);
                    }
                });
            }
            keys.forEach(function (key) {
                var value;
                var envelope;

                try {
                    value = window.localStorage.getItem(key);
                    envelope = typeof value === "string" &&
                        new TextEncoder().encode(value).length <= 4096
                        ? JSON.parse(value)
                        : null;
                } catch (_error) {
                    warnStorage(STORAGE_WARNING);
                    return;
                }
                if (protocol.validateEnvelope(envelope, key).ok) {
                    safeRemove(key);
                }
            });
        }
        if (state) {
            state = protocol.reduce(state, {type: "reset"}).state;
            render();
        }
    }

    /**
     * Binds application events to pure state actions and fixed identity flows.
     */
    function bindEvents() {
        elements.daily.addEventListener("click", selectDaily);
        elements.random.addEventListener("click", selectRandom);
        elements.random.disabled = !cryptoAvailable();
        elements.seedForm.addEventListener("submit", function (event) {
            var encoded;

            event.preventDefault();
            encoded = protocol.encodeSeed(elements.seed.value);
            if (!encoded.ok) {
                elements.seed.setCustomValidity("Enter 1\u201364 Unicode characters and no more than 256 UTF-8 bytes.");
                elements.seed.reportValidity();
                return;
            }
            elements.seed.setCustomValidity("");
            selectIdentity(protocol.makeIdentity("seed", encoded.token));
        });
        elements.grid.addEventListener("click", function (event) {
            var cell = event.target.closest(".sdk-cell");

            if (cell && elements.grid.contains(cell)) {
                selectCell(Number(cell.dataset.index), true);
            }
        });
        elements.grid.addEventListener("keydown", handleGridKey);
        elements.keypad.addEventListener("click", function (event) {
            var button = event.target.closest(".sdk-key");

            if (button && state) {
                var digit = Number(button.dataset.digit);

                dispatch(digit === 0
                    ? {type: "erase", index: state.selected}
                    : {type: "digit", index: state.selected, digit: digit});
                focusSelected();
            }
        });
        elements.notes.addEventListener("click", function () {
            dispatch({type: "toggleNotes"});
        });
        elements.check.addEventListener("click", function () {
            var wrong;
            var empty;

            dispatch({type: "check"});
            wrong = state.checkedErrors.filter(Boolean).length;
            empty = state.entries.filter(function (value, index) {
                return state.clues[index] === 0 && value === 0;
            }).length;
            announce(elements.status, "Check complete: " + wrong + " wrong, " + empty + " empty.");
        });
        elements.undo.addEventListener("click", function () {
            dispatch({type: "undo"});
        });
        elements.reset.addEventListener("click", function () {
            if (window.confirm("Reset this Sudoku puzzle?")) {
                dispatch({type: "reset"});
            }
        });
        elements.clearAll.addEventListener("click", clearAllProgress);
        window.addEventListener("storage", function (event) {
            if (event.storageArea === window.localStorage && event.key === activeKey) {
                reconcileStorage();
            }
        });
        window.addEventListener("beforeunload", stopWorker);
        window.addEventListener("focus", checkRollover);
        document.addEventListener("visibilitychange", function () {
            if (!document.hidden) {
                checkRollover();
            }
        });
    }

    /**
     * Parses/canonicalizes initial identity and starts the application.
     */
    function initialize() {
        var parsed;

        if (!protocol) {
            return;
        }
        elements = collectElements();
        if (!elements.app) {
            return;
        }
        buildKeypad();
        bindEvents();
        parsed = protocol.parseIdentity(window.location.search, utcDay());
        if (!parsed.ok) {
            showError("invalid");
            return;
        }
        identity = parsed.identity;
        try {
            canonicalize(identity);
        } catch (_error) {
            showError("invalid");
            return;
        }
        elements.kind.textContent = identity.kind === "day" ? "Daily puzzle \u00b7 UTC" : "Custom seed";
        elements.identityValue.textContent = identity.kind === "day" ? identity.value : "";
        scheduleRollover();
        startGeneration(true);
    }

    document.addEventListener("DOMContentLoaded", initialize);
}());
