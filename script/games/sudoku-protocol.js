/**
 * Pure Sudoku v1 identity, protocol, state, and persistence contracts.
 *
 * This module performs no DOM, URL navigation, storage, clock, or worker I/O.
 */
(function (root, factory) {
    "use strict";

    var engine = typeof module === "object" && module.exports
        ? require("./sudoku-engine.js")
        : root.SudokuEngineV1;
    var api = factory(engine);

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        Object.defineProperty(root, "SudokuProtocolV1", {
            configurable: false,
            enumerable: true,
            value: api,
            writable: false
        });
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function (engine) {
    "use strict";

    var ALGORITHM_ID = "shugg-sudoku-v1";
    var TIER_ID = "classic-v1";
    var PROTOCOL_VERSION = 1;
    var CELL_COUNT = 81;
    var MAX_QUERY_LENGTH = 512;
    var MAX_QUERY_PAIRS = 3;
    var MAX_SEED_TOKEN = 342;
    var MAX_SEED_CODE_POINTS = 64;
    var MAX_SEED_BYTES = 256;
    var NOTE_MASK = 0x1ff;
    var UNDO_LIMIT = 100;
    var STORAGE_PREFIX = "shugg.sudoku.progress.v1.";
    var MAX_STORAGE_KEY = 380;
    var MAX_RECORD_BYTES = 4096;
    var MAX_NAMESPACE_BYTES = 65536;
    var MAX_RECORDS = 30;
    var MAX_SCAN_KEYS = 128;
    var DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
    var SEED_PATTERN = /^[A-Za-z0-9_-]{1,342}$/;
    var TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

    /**
     * Checks an object's exact own enumerable key set and ordinary prototype.
     * @param {*} value Candidate value.
     * @param {string[]} keys Required keys.
     * @returns {boolean} Whether the shape is exact.
     */
    function exactObject(value, keys) {
        var prototype;
        var actual;

        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            return false;
        }
        prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            return false;
        }
        actual = Object.keys(value).sort();
        return actual.length === keys.length && actual.every(function (key, index) {
            return key === keys.slice().sort()[index];
        });
    }

    /**
     * Applies the proleptic Gregorian leap-year rule.
     * @param {number} year Year.
     * @returns {boolean} Whether February has 29 days.
     */
    function isLeapYear(year) {
        return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }

    /**
     * Validates a strict Gregorian date without `Date` parsing.
     * @param {string} day `YYYY-MM-DD`.
     * @returns {boolean} Whether the date exists in years 0001 through 9999.
     */
    function isValidDay(day) {
        var year;
        var month;
        var date;
        var monthLengths;

        if (typeof day !== "string" || !DAY_PATTERN.test(day)) {
            return false;
        }
        year = Number(day.slice(0, 4));
        month = Number(day.slice(5, 7));
        date = Number(day.slice(8, 10));
        if (year < 1 || month < 1 || month > 12) {
            return false;
        }
        monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return date >= 1 && date <= monthLengths[month - 1];
    }

    /**
     * Normalizes and bounds a manually entered seed.
     * @param {*} seed Candidate seed.
     * @returns {{ok: boolean, value?: string, error?: string}} Result.
     */
    function normalizeSeed(seed) {
        var value;
        var bytes;
        var codePoints;

        if (typeof seed !== "string") {
            return {ok: false, error: "invalid"};
        }
        value = seed.trim().normalize("NFC");
        codePoints = Array.from(value);
        bytes = new TextEncoder().encode(value);
        if (codePoints.length < 1 || codePoints.length > MAX_SEED_CODE_POINTS ||
                bytes.length > MAX_SEED_BYTES) {
            return {ok: false, error: "invalid"};
        }
        return {ok: true, value: value};
    }

    /**
     * Encodes bytes as canonical unpadded base64url.
     * @param {Uint8Array} bytes Bytes to encode.
     * @returns {string} Base64url token.
     */
    function bytesToBase64Url(bytes) {
        var binary = "";
        var index;
        var encoded;

        for (index = 0; index < bytes.length; index += 1) {
            binary += String.fromCharCode(bytes[index]);
        }
        if (typeof btoa === "function") {
            encoded = btoa(binary);
        } else {
            encoded = Buffer.from(bytes).toString("base64");
        }
        return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
    }

    /**
     * Encodes a normalized custom seed.
     * @param {string} seed Manual seed.
     * @returns {{ok: boolean, value?: string, token?: string}} Result.
     */
    function encodeSeed(seed) {
        var normalized = normalizeSeed(seed);

        if (!normalized.ok) {
            return normalized;
        }
        return {
            ok: true,
            value: normalized.value,
            token: bytesToBase64Url(new TextEncoder().encode(normalized.value))
        };
    }

    /**
     * Decodes only canonical, bounded, fatal-UTF-8 base64url.
     * @param {*} token Candidate URL token.
     * @returns {{ok: boolean, value?: string, token?: string}} Result.
     */
    function decodeSeed(token) {
        var standard;
        var binary;
        var bytes;
        var index;
        var decoded;
        var normalized;
        var canonical;

        if (typeof token !== "string" || token.length > MAX_SEED_TOKEN ||
                !SEED_PATTERN.test(token) || token.length % 4 === 1) {
            return {ok: false};
        }
        standard = token.replace(/-/g, "+").replace(/_/g, "/");
        standard += "=".repeat((4 - (standard.length % 4)) % 4);
        try {
            if (typeof atob === "function") {
                binary = atob(standard);
                bytes = new Uint8Array(binary.length);
                for (index = 0; index < binary.length; index += 1) {
                    bytes[index] = binary.charCodeAt(index);
                }
            } else {
                bytes = new Uint8Array(Buffer.from(standard, "base64"));
            }
        } catch (_error) {
            return {ok: false};
        }
        if (bytes.length > MAX_SEED_BYTES) {
            return {ok: false};
        }
        try {
            decoded = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes);
        } catch (_error) {
            return {ok: false};
        }
        normalized = normalizeSeed(decoded);
        if (!normalized.ok) {
            return {ok: false};
        }
        canonical = bytesToBase64Url(new TextEncoder().encode(normalized.value));
        if (canonical !== token) {
            return {ok: false};
        }
        return {ok: true, value: normalized.value, token: token};
    }

    /**
     * Produces an identity and exact stable puzzle ID.
     * @param {"day"|"seed"} kind Identity kind.
     * @param {string} value Valid day or token.
     * @returns {Object} Frozen-compatible identity data.
     */
    function makeIdentity(kind, value) {
        var segment = kind === "day" ? "daily" : "seed";

        return {
            kind: kind,
            value: value,
            puzzleId: ALGORITHM_ID + "|" + TIER_ID + "|" + segment + "|" + value
        };
    }

    /**
     * Parses bounded query text with an injected current UTC day.
     * @param {string} search Raw location search.
     * @param {string} today Current UTC day read by the controller once.
     * @returns {{ok: boolean, identity?: Object}} Parse result.
     */
    function parseIdentity(search, today) {
        var raw = search || "";
        var params;
        var pairs;
        var versions;
        var seeds;
        var days;
        var decoded;

        if (typeof raw !== "string" || raw.length > MAX_QUERY_LENGTH || !isValidDay(today)) {
            return {ok: false};
        }
        if (raw === "" || raw === "?") {
            return {ok: true, identity: makeIdentity("day", today)};
        }
        try {
            params = new URLSearchParams(raw.charAt(0) === "?" ? raw.slice(1) : raw);
            pairs = Array.from(params.entries());
        } catch (_error) {
            return {ok: false};
        }
        if (pairs.length > MAX_QUERY_PAIRS) {
            return {ok: false};
        }
        versions = params.getAll("v");
        seeds = params.getAll("seed");
        days = params.getAll("day");
        if (versions.length !== 1 || versions[0] !== "1" ||
                seeds.length > 1 || days.length > 1) {
            return {ok: false};
        }
        if (seeds.length === 1) {
            decoded = decodeSeed(seeds[0]);
            return decoded.ok
                ? {ok: true, identity: makeIdentity("seed", decoded.token)}
                : {ok: false};
        }
        if (days.length === 1) {
            return isValidDay(days[0])
                ? {ok: true, identity: makeIdentity("day", days[0])}
                : {ok: false};
        }
        return {ok: true, identity: makeIdentity("day", today)};
    }

    /**
     * Builds a fixed-route same-origin canonical pathname and query.
     * @param {string} origin Trusted current origin.
     * @param {string} route Trusted Jekyll-relative route.
     * @param {Object} identity Valid identity.
     * @returns {string} Canonical pathname and search.
     */
    function canonicalUrl(origin, route, identity) {
        var url;

        if (typeof origin !== "string" || typeof route !== "string" || route.charAt(0) !== "/" ||
                !validateIdentity(identity)) {
            throw new TypeError("Invalid canonical URL input");
        }
        url = new URL(route, origin);
        if (url.origin !== origin || url.pathname !== route || url.search || url.hash) {
            throw new TypeError("Unsafe Sudoku route");
        }
        url.searchParams.set("v", "1");
        url.searchParams.set(identity.kind === "day" ? "day" : "seed", identity.value);
        return url.pathname + url.search;
    }

    /**
     * Validates identity consistency and controlled value syntax.
     * @param {*} identity Candidate identity.
     * @returns {boolean} Whether identity fields are exact and consistent.
     */
    function validateIdentity(identity) {
        var expected;

        if (!exactObject(identity, ["kind", "value", "puzzleId"]) ||
                (identity.kind !== "day" && identity.kind !== "seed") ||
                typeof identity.value !== "string" || typeof identity.puzzleId !== "string") {
            return false;
        }
        if (identity.kind === "day" && !isValidDay(identity.value)) {
            return false;
        }
        if (identity.kind === "seed" && !decodeSeed(identity.value).ok) {
            return false;
        }
        expected = makeIdentity(identity.kind, identity.value);
        return expected.puzzleId === identity.puzzleId;
    }

    /**
     * Validates a generation request's exact tagged shape.
     * @param {*} message Candidate request.
     * @returns {boolean} Whether it is valid.
     */
    function validateRequest(message) {
        return exactObject(message, ["protocol", "type", "requestId", "identity"]) &&
            message.protocol === PROTOCOL_VERSION &&
            message.type === "generate" &&
            Number.isSafeInteger(message.requestId) &&
            message.requestId >= 1 &&
            validateIdentity(message.identity);
    }

    /**
     * Checks an exact 81-element integer array.
     * @param {*} values Candidate array.
     * @param {number} minimum Minimum digit.
     * @param {number} maximum Maximum digit.
     * @returns {boolean} Whether all cells are in range.
     */
    function integerCells(values, minimum, maximum) {
        return Array.isArray(values) && values.length === CELL_COUNT &&
            values.every(function (value) {
                return Number.isInteger(value) && value >= minimum && value <= maximum;
            });
    }

    /**
     * Performs inexpensive independent validation of a generated puzzle.
     * @param {*} puzzle Candidate puzzle.
     * @param {string} expectedPuzzleId Current expected identity.
     * @returns {boolean} Whether all public result invariants hold.
     */
    function validateGeneratedPuzzle(puzzle, expectedPuzzleId) {
        var count;

        if (!exactObject(puzzle, ["puzzleId", "clues", "solution", "attempt", "clueCount"]) ||
                puzzle.puzzleId !== expectedPuzzleId ||
                !integerCells(puzzle.clues, 0, 9) ||
                !integerCells(puzzle.solution, 1, 9) ||
                !Number.isInteger(puzzle.attempt) || puzzle.attempt < 0 || puzzle.attempt > 11 ||
                !Number.isInteger(puzzle.clueCount)) {
            return false;
        }
        count = puzzle.clues.filter(function (value) {
            return value !== 0;
        }).length;
        return count === puzzle.clueCount && count >= 32 && count <= 36 &&
            engine.validatePuzzle(puzzle.clues, puzzle.solution);
    }

    /**
     * Validates a worker response union and optional expected puzzle ID.
     * @param {*} message Candidate worker response.
     * @param {string} [expectedPuzzleId] Current puzzle ID.
     * @returns {boolean} Whether the response is exact.
     */
    function validateResponse(message, expectedPuzzleId) {
        if (message === null || typeof message !== "object" ||
                message.protocol !== PROTOCOL_VERSION ||
                !Number.isSafeInteger(message.requestId) || message.requestId < 1) {
            return false;
        }
        if (message.type === "progress") {
            return exactObject(message, ["protocol", "type", "requestId", "attempt", "phase"]) &&
                Number.isInteger(message.attempt) && message.attempt >= 0 && message.attempt <= 11 &&
                (message.phase === "started" || message.phase === "rejected");
        }
        if (message.type === "result") {
            return exactObject(message, ["protocol", "type", "requestId", "puzzle"]) &&
                validateGeneratedPuzzle(message.puzzle, expectedPuzzleId || message.puzzle.puzzleId);
        }
        if (message.type === "failure") {
            return exactObject(message, ["protocol", "type", "requestId", "code"]) &&
                message.code === "BUDGET_EXHAUSTED";
        }
        if (message.type === "error") {
            return exactObject(message, ["protocol", "type", "requestId", "code"]) &&
                (message.code === "INVALID_REQUEST" || message.code === "ENGINE_ERROR");
        }
        return false;
    }

    /**
     * Computes every duplicate answer participant.
     * @param {Object} state Runtime state.
     * @returns {boolean[]} Conflict flags.
     */
    function deriveConflicts(state) {
        var values = state.clues.map(function (clue, index) {
            return clue || state.entries[index];
        });
        var conflicts = new Array(CELL_COUNT).fill(false);
        var units = [];
        var row;
        var column;
        var boxRow;
        var boxColumn;

        for (row = 0; row < 9; row += 1) {
            units.push(Array.from({length: 9}, function (_unused, offset) {
                return row * 9 + offset;
            }));
        }
        for (column = 0; column < 9; column += 1) {
            units.push(Array.from({length: 9}, function (_unused, offset) {
                return offset * 9 + column;
            }));
        }
        for (boxRow = 0; boxRow < 3; boxRow += 1) {
            for (boxColumn = 0; boxColumn < 3; boxColumn += 1) {
                units.push(Array.from({length: 9}, function (_unused, offset) {
                    return ((boxRow * 3 + Math.floor(offset / 3)) * 9) +
                        (boxColumn * 3) + (offset % 3);
                }));
            }
        }
        units.forEach(function (unit) {
            var seen = {};

            unit.forEach(function (index) {
                var value = values[index];

                if (!value) {
                    return;
                }
                if (Object.prototype.hasOwnProperty.call(seen, value)) {
                    conflicts[index] = true;
                    seen[value].forEach(function (duplicateIndex) {
                        conflicts[duplicateIndex] = true;
                    });
                    seen[value].push(index);
                } else {
                    seen[value] = [index];
                }
            });
        });
        return conflicts;
    }

    /**
     * Creates fresh runtime state from a validated generated puzzle.
     * @param {Object} puzzle Valid generated puzzle.
     * @param {Object} [progress] Valid stored progress.
     * @returns {Object} Runtime state.
     */
    function createState(puzzle, progress) {
        var entries = progress ? progress.entries.slice() : new Array(CELL_COUNT).fill(0);
        var notes = progress ? progress.notes.slice() : new Array(CELL_COUNT).fill(0);

        return {
            puzzleId: puzzle.puzzleId,
            clues: puzzle.clues.slice(),
            solution: puzzle.solution.slice(),
            entries: entries,
            notes: notes,
            selected: 0,
            notesMode: false,
            checkedErrors: new Array(CELL_COUNT).fill(false),
            completed: progress ? progress.completed : false,
            undoStack: []
        };
    }

    /**
     * Clones the mutable user portion for bounded undo.
     * @param {Object} state Runtime state.
     * @returns {Object} Undo snapshot.
     */
    function userSnapshot(state) {
        return {entries: state.entries.slice(), notes: state.notes.slice()};
    }

    /**
     * Applies one pure game action while enforcing immutable clues and locks.
     * @param {Object} state Runtime state.
     * @param {Object} action Action object.
     * @returns {{state: Object, changed: boolean, persist: boolean, remove: boolean}}
     * Reducer outcome.
     */
    function reduce(state, action) {
        var next;
        var index;
        var digit;
        var snapshot;
        var completed;

        if (!state || !action || typeof action.type !== "string") {
            return {state: state, changed: false, persist: false, remove: false};
        }
        if (action.type === "select" && Number.isInteger(action.index) &&
                action.index >= 0 && action.index < CELL_COUNT) {
            next = Object.assign({}, state, {selected: action.index});
            return {state: next, changed: true, persist: false, remove: false};
        }
        if (action.type === "toggleNotes" && !state.completed) {
            next = Object.assign({}, state, {notesMode: !state.notesMode});
            return {state: next, changed: true, persist: false, remove: false};
        }
        if (action.type === "check" && !state.completed) {
            next = Object.assign({}, state, {
                checkedErrors: state.entries.map(function (value, cellIndex) {
                    return state.clues[cellIndex] === 0 && value !== 0 &&
                        value !== state.solution[cellIndex];
                })
            });
            return {state: next, changed: true, persist: false, remove: false};
        }
        if (action.type === "reset") {
            next = Object.assign({}, state, {
                entries: new Array(CELL_COUNT).fill(0),
                notes: new Array(CELL_COUNT).fill(0),
                checkedErrors: new Array(CELL_COUNT).fill(false),
                completed: false,
                notesMode: false,
                undoStack: []
            });
            return {state: next, changed: true, persist: false, remove: true};
        }
        if (action.type === "externalReset") {
            return reduce(state, {type: "reset"});
        }
        if (action.type === "externalReplace") {
            next = Object.assign({}, state, {
                entries: action.record.entries.slice(),
                notes: action.record.notes.slice(),
                completed: action.record.completed,
                checkedErrors: new Array(CELL_COUNT).fill(false),
                undoStack: []
            });
            return {state: next, changed: true, persist: false, remove: false};
        }
        if (state.completed) {
            return {state: state, changed: false, persist: false, remove: false};
        }
        if (action.type === "undo") {
            if (state.undoStack.length === 0) {
                return {state: state, changed: false, persist: false, remove: false};
            }
            snapshot = state.undoStack[state.undoStack.length - 1];
            next = Object.assign({}, state, {
                entries: snapshot.entries.slice(),
                notes: snapshot.notes.slice(),
                checkedErrors: new Array(CELL_COUNT).fill(false),
                undoStack: state.undoStack.slice(0, -1)
            });
            return {state: next, changed: true, persist: true, remove: false};
        }
        if (action.type !== "digit" && action.type !== "erase") {
            return {state: state, changed: false, persist: false, remove: false};
        }
        index = Number.isInteger(action.index) ? action.index : state.selected;
        digit = action.type === "erase" ? 0 : action.digit;
        if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT ||
                state.clues[index] !== 0 || !Number.isInteger(digit) ||
                digit < 0 || digit > 9) {
            return {state: state, changed: false, persist: false, remove: false};
        }
        next = Object.assign({}, state, {
            entries: state.entries.slice(),
            notes: state.notes.slice(),
            checkedErrors: state.checkedErrors.slice(),
            undoStack: state.undoStack.concat([userSnapshot(state)]).slice(-UNDO_LIMIT)
        });
        if (state.notesMode && digit !== 0) {
            next.entries[index] = 0;
            next.notes[index] ^= 1 << (digit - 1);
        } else {
            next.entries[index] = digit;
            next.notes[index] = 0;
        }
        next.checkedErrors[index] = false;
        completed = next.solution.every(function (value, cellIndex) {
            return next.clues[cellIndex] === value || next.entries[cellIndex] === value;
        });
        if (completed) {
            next.completed = true;
            next.checkedErrors = new Array(CELL_COUNT).fill(false);
            next.undoStack = [];
        }
        return {state: next, changed: true, persist: true, remove: false};
    }

    /**
     * Creates the exact storage key for an identity.
     * @param {Object} identity Valid identity.
     * @returns {string} Storage key.
     */
    function storageKey(identity) {
        if (!validateIdentity(identity)) {
            throw new TypeError("Invalid storage identity");
        }
        return STORAGE_PREFIX + identity.kind + "." + identity.value;
    }

    /**
     * Validates a storage key and derives its expected puzzle ID.
     * @param {*} key Candidate key.
     * @returns {{ok: boolean, identity?: Object}} Key result.
     */
    function parseStorageKey(key) {
        var suffix;
        var separator;
        var kind;
        var value;
        var identity;

        if (typeof key !== "string" || key.length > MAX_STORAGE_KEY ||
                !/^[\x20-\x7e]+$/u.test(key) || key.indexOf(STORAGE_PREFIX) !== 0) {
            return {ok: false};
        }
        suffix = key.slice(STORAGE_PREFIX.length);
        separator = suffix.indexOf(".");
        if (separator < 0) {
            return {ok: false};
        }
        kind = suffix.slice(0, separator);
        value = suffix.slice(separator + 1);
        if (kind === "day" && isValidDay(value)) {
            identity = makeIdentity("day", value);
        } else if (kind === "seed" && decodeSeed(value).ok) {
            identity = makeIdentity("seed", value);
        } else {
            return {ok: false};
        }
        return {ok: true, identity: identity};
    }

    /**
     * Manually validates an exact canonical UTC timestamp.
     * @param {*} value Candidate timestamp.
     * @returns {boolean} Whether the timestamp is real and canonical.
     */
    function isValidTimestamp(value) {
        var match;
        var day;
        var hour;
        var minute;
        var second;

        if (typeof value !== "string") {
            return false;
        }
        match = TIMESTAMP_PATTERN.exec(value);
        if (!match) {
            return false;
        }
        day = match[1] + "-" + match[2] + "-" + match[3];
        hour = Number(match[4]);
        minute = Number(match[5]);
        second = Number(match[6]);
        return isValidDay(day) && hour <= 23 && minute <= 59 && second <= 59;
    }

    /**
     * Validates and copies an exact persistence record.
     * @param {*} record Candidate parsed record.
     * @param {string} key Exact storage key.
     * @param {number[]} clues Current generated clues.
     * @param {number[]} solution Current generated solution.
     * @returns {{ok: boolean, record?: Object}} Validation result.
     */
    function validateEnvelope(record, key) {
        var parsedKey = parseStorageKey(key);
        var index;

        if (!parsedKey.ok ||
                !exactObject(record, ["version", "puzzleId", "entries", "notes", "completed", "updatedAt"]) ||
                record.version !== 1 ||
                record.puzzleId !== parsedKey.identity.puzzleId ||
                !integerCells(record.entries, 0, 9) ||
                !integerCells(record.notes, 0, NOTE_MASK) ||
                typeof record.completed !== "boolean" ||
                !isValidTimestamp(record.updatedAt)) {
            return {ok: false};
        }
        for (index = 0; index < CELL_COUNT; index += 1) {
            if (record.entries[index] !== 0 && record.notes[index] !== 0) {
                return {ok: false};
            }
        }
        return {ok: true};
    }

    /**
     * Validates and copies an exact persistence record against its puzzle.
     * @param {*} record Candidate parsed record.
     * @param {string} key Exact storage key.
     * @param {number[]} clues Current generated clues.
     * @param {number[]} solution Current generated solution.
     * @returns {{ok: boolean, record?: Object}} Validation result.
     */
    function validateRecord(record, key, clues, solution) {
        var completed;
        var index;

        if (!validateEnvelope(record, key).ok ||
                !integerCells(clues, 0, 9) || !integerCells(solution, 1, 9)) {
            return {ok: false};
        }
        for (index = 0; index < CELL_COUNT; index += 1) {
            if (clues[index] !== 0 && (record.entries[index] !== 0 || record.notes[index] !== 0)) {
                return {ok: false};
            }
        }
        completed = solution.every(function (value, cellIndex) {
            return clues[cellIndex] === value || record.entries[cellIndex] === value;
        });
        if (record.completed !== completed) {
            return {ok: false};
        }
        return {
            ok: true,
            record: {
                version: 1,
                puzzleId: record.puzzleId,
                entries: record.entries.slice(),
                notes: record.notes.slice(),
                completed: record.completed,
                updatedAt: record.updatedAt
            }
        };
    }

    /**
     * Parses a size-bounded JSON persistence record.
     * @param {*} text Candidate serialized value.
     * @param {string} key Storage key.
     * @param {number[]} clues Current clues.
     * @param {number[]} solution Current solution.
     * @returns {{ok: boolean, record?: Object}} Parse result.
     */
    function parseRecord(text, key, clues, solution) {
        var parsed;

        if (typeof text !== "string" ||
                new TextEncoder().encode(text).length > MAX_RECORD_BYTES) {
            return {ok: false};
        }
        try {
            parsed = JSON.parse(text);
        } catch (_error) {
            return {ok: false};
        }
        return validateRecord(parsed, key, clues, solution);
    }

    /**
     * Serializes current user progress into the exact record shape.
     * @param {Object} state Runtime state.
     * @param {string} updatedAt Canonical current timestamp.
     * @returns {string} JSON record.
     */
    function serializeRecord(state, updatedAt) {
        var text;
        var record;

        if (!isValidTimestamp(updatedAt)) {
            throw new TypeError("Invalid update timestamp");
        }
        record = {
            version: 1,
            puzzleId: state.puzzleId,
            entries: state.entries.slice(),
            notes: state.notes.slice(),
            completed: state.completed,
            updatedAt: updatedAt
        };
        text = JSON.stringify(record);
        if (new TextEncoder().encode(text).length > MAX_RECORD_BYTES) {
            throw new RangeError("Progress record is too large");
        }
        return text;
    }

    /**
     * Plans deterministic bounded namespace removals from supplied envelopes.
     * @param {Array<{key:string,value:string,updatedAt?:string,valid?:boolean}>} items
     * Namespace items.
     * @param {string} activeKey Protected active key.
     * @returns {string[]} Keys to remove.
     */
    function planRetention(items, activeKey) {
        var ordered = items.slice().sort(function (left, right) {
            return left.key.localeCompare(right.key);
        });
        var removals = [];
        var survivors;
        var totalBytes;

        if (ordered.length > MAX_SCAN_KEYS) {
            ordered.slice().reverse().some(function (item) {
                if (ordered.length - removals.length <= MAX_SCAN_KEYS) {
                    return true;
                }
                if (item.key !== activeKey) {
                    removals.push(item.key);
                }
                return false;
            });
        }
        survivors = ordered.filter(function (item) {
            if (removals.indexOf(item.key) !== -1) {
                return false;
            }
            if (!item.valid || !parseStorageKey(item.key).ok ||
                    typeof item.value !== "string" ||
                    new TextEncoder().encode(item.value).length > MAX_RECORD_BYTES) {
                removals.push(item.key);
                return false;
            }
            return true;
        });
        totalBytes = survivors.reduce(function (total, item) {
            return total + new TextEncoder().encode(item.key + item.value).length;
        }, 0);
        survivors.sort(function (left, right) {
            return left.updatedAt === right.updatedAt
                ? left.key.localeCompare(right.key)
                : left.updatedAt.localeCompare(right.updatedAt);
        });
        while (survivors.length > MAX_RECORDS || totalBytes > MAX_NAMESPACE_BYTES) {
            var candidateIndex = survivors.findIndex(function (item) {
                return item.key !== activeKey;
            });
            var candidate;

            if (candidateIndex === -1) {
                break;
            }
            candidate = survivors.splice(candidateIndex, 1)[0];
            totalBytes -= new TextEncoder().encode(candidate.key + candidate.value).length;
            removals.push(candidate.key);
        }
        return Array.from(new Set(removals));
    }

    return Object.freeze({
        constants: Object.freeze({
            algorithmId: ALGORITHM_ID,
            tierId: TIER_ID,
            protocol: PROTOCOL_VERSION,
            storagePrefix: STORAGE_PREFIX
        }),
        exactObject: exactObject,
        isLeapYear: isLeapYear,
        isValidDay: isValidDay,
        normalizeSeed: normalizeSeed,
        encodeSeed: encodeSeed,
        decodeSeed: decodeSeed,
        makeIdentity: makeIdentity,
        parseIdentity: parseIdentity,
        canonicalUrl: canonicalUrl,
        validateIdentity: validateIdentity,
        validateRequest: validateRequest,
        validateResponse: validateResponse,
        validateGeneratedPuzzle: validateGeneratedPuzzle,
        deriveConflicts: deriveConflicts,
        createState: createState,
        reduce: reduce,
        storageKey: storageKey,
        parseStorageKey: parseStorageKey,
        isValidTimestamp: isValidTimestamp,
        validateEnvelope: validateEnvelope,
        validateRecord: validateRecord,
        parseRecord: parseRecord,
        serializeRecord: serializeRecord,
        planRetention: planRetention
    });
}));
