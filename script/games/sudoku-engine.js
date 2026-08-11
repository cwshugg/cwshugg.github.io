/**
 * Deterministic Classic v1 Sudoku generation and exact bounded solving.
 *
 * The algorithm identifier, random-consumption order, and node semantics are
 * compatibility contracts. Any change requires a new query/algorithm version.
 */
(function (root, factory) {
    "use strict";

    var api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        Object.defineProperty(root, "SudokuEngineV1", {
            configurable: false,
            enumerable: true,
            value: api,
            writable: false
        });
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    var CELL_COUNT = 81;
    var GRID_WIDTH = 9;
    var FULL_MASK = 0x1ff;
    var FNV_OFFSET = 0x811c9dc5;
    var FNV_PRIME = 0x01000193;
    var MULBERRY_INCREMENT = 0x6d2b79f5;
    var DEFAULT_CHECK_LIMIT = 100000;
    var DEFAULT_ATTEMPT_LIMIT = 1000000;
    var ATTEMPT_COUNT = 12;
    var MIN_CLUES = 32;
    var MAX_CLUES = 36;
    var UNKNOWN = "unknown";

    /**
     * Hashes UTF-8 bytes with the versioned 32-bit FNV-1a procedure.
     * @param {string} text Text to hash.
     * @returns {number} Unsigned 32-bit hash.
     */
    function fnv1a(text) {
        var bytes = new TextEncoder().encode(text);
        var hash = FNV_OFFSET;
        var index;

        for (index = 0; index < bytes.length; index += 1) {
            hash ^= bytes[index];
            hash = Math.imul(hash, FNV_PRIME) >>> 0;
        }
        return hash >>> 0;
    }

    /**
     * Creates the exact stateful Mulberry32 stream used by Classic v1.
     * @param {number} seed Unsigned initial state.
     * @returns {{nextU32: function(): number}} Random word stream.
     */
    function createPrng(seed) {
        var state = seed >>> 0;

        return {
            nextU32: function () {
                var value;

                state = (state + MULBERRY_INCREMENT) >>> 0;
                value = state;
                value = Math.imul(value ^ (value >>> 15), value | 1);
                value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
                return (value ^ (value >>> 14)) >>> 0;
            }
        };
    }

    /**
     * Draws an unbiased integer in `[0, upperBound)`.
     * @param {{nextU32: function(): number}} stream Random stream.
     * @param {number} upperBound Exclusive positive bound.
     * @returns {number} Bounded integer.
     */
    function boundedDraw(stream, upperBound) {
        var limit;
        var word;

        if (!Number.isInteger(upperBound) || upperBound < 1 || upperBound > 0x100000000) {
            throw new RangeError("Invalid random bound");
        }

        limit = Math.floor(0x100000000 / upperBound) * upperBound;
        do {
            word = stream.nextU32();
        } while (word >= limit);
        return word % upperBound;
    }

    /**
     * Shuffles an array in place with descending Fisher-Yates.
     * @param {Array<*>} values Values to shuffle.
     * @param {{nextU32: function(): number}} stream Random stream.
     * @returns {Array<*>} The same array.
     */
    function shuffle(values, stream) {
        var index;
        var other;
        var temporary;

        for (index = values.length - 1; index > 0; index -= 1) {
            other = boundedDraw(stream, index + 1);
            temporary = values[index];
            values[index] = values[other];
            values[other] = temporary;
        }
        return values;
    }

    /**
     * Returns `[0, ..., count - 1]`.
     * @param {number} count Item count.
     * @returns {number[]} Sequential values.
     */
    function sequence(count) {
        return Array.from({length: count}, function (_unused, index) {
            return index;
        });
    }

    /**
     * Creates a solved grid while consuming randomness in the v1 order.
     * @param {{nextU32: function(): number}} stream Random stream.
     * @returns {number[]} A solved 81-cell board.
     */
    function createSolvedGrid(stream) {
        var digits = shuffle(sequence(GRID_WIDTH), stream).map(function (value) {
            return value + 1;
        });
        var bands = shuffle(sequence(3), stream);
        var rows = [];
        var stacks;
        var columns = [];
        var transpose;
        var board = new Array(CELL_COUNT);
        var bandIndex;
        var offsets;
        var stackIndex;
        var row;
        var column;
        var sourceRow;
        var sourceColumn;
        var baseValue;

        for (bandIndex = 0; bandIndex < bands.length; bandIndex += 1) {
            offsets = shuffle(sequence(3), stream);
            offsets.forEach(function (offset) {
                rows.push((bands[bandIndex] * 3) + offset);
            });
        }

        stacks = shuffle(sequence(3), stream);
        for (stackIndex = 0; stackIndex < stacks.length; stackIndex += 1) {
            offsets = shuffle(sequence(3), stream);
            offsets.forEach(function (offset) {
                columns.push((stacks[stackIndex] * 3) + offset);
            });
        }

        transpose = (stream.nextU32() & 1) === 1;
        for (row = 0; row < GRID_WIDTH; row += 1) {
            for (column = 0; column < GRID_WIDTH; column += 1) {
                sourceRow = transpose ? rows[column] : rows[row];
                sourceColumn = transpose ? columns[row] : columns[column];
                baseValue = ((sourceRow * 3 + Math.floor(sourceRow / 3) + sourceColumn) % 9);
                board[(row * GRID_WIDTH) + column] = digits[baseValue];
            }
        }

        if (!isSolvedGrid(board)) {
            throw new Error("Solved grid invariant failed");
        }
        return board;
    }

    /**
     * Verifies every row, column, and box contains digits one through nine.
     * @param {number[]} board Board to inspect.
     * @returns {boolean} Whether the board is solved.
     */
    function isSolvedGrid(board) {
        var unit;
        var offset;
        var rowMask;
        var columnMask;
        var boxMask;
        var boxRow;
        var boxColumn;
        var row;
        var column;
        var value;

        if (!Array.isArray(board) || board.length !== CELL_COUNT) {
            return false;
        }

        for (unit = 0; unit < GRID_WIDTH; unit += 1) {
            rowMask = 0;
            columnMask = 0;
            for (offset = 0; offset < GRID_WIDTH; offset += 1) {
                value = board[(unit * GRID_WIDTH) + offset];
                if (!Number.isInteger(value) || value < 1 || value > 9) {
                    return false;
                }
                rowMask |= 1 << (value - 1);
                value = board[(offset * GRID_WIDTH) + unit];
                if (!Number.isInteger(value) || value < 1 || value > 9) {
                    return false;
                }
                columnMask |= 1 << (value - 1);
            }
            if (rowMask !== FULL_MASK || columnMask !== FULL_MASK) {
                return false;
            }
        }

        for (boxRow = 0; boxRow < 3; boxRow += 1) {
            for (boxColumn = 0; boxColumn < 3; boxColumn += 1) {
                boxMask = 0;
                for (row = 0; row < 3; row += 1) {
                    for (column = 0; column < 3; column += 1) {
                        value = board[((boxRow * 3 + row) * GRID_WIDTH) + (boxColumn * 3 + column)];
                        boxMask |= 1 << (value - 1);
                    }
                }
                if (boxMask !== FULL_MASK) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Computes legal candidate bits or `0` for a contradiction.
     * @param {number[]} board Mutable search board.
     * @param {number} index Empty cell index.
     * @returns {number} Candidate mask.
     */
    function candidateMask(board, index) {
        var row = Math.floor(index / GRID_WIDTH);
        var column = index % GRID_WIDTH;
        var boxRow = Math.floor(row / 3) * 3;
        var boxColumn = Math.floor(column / 3) * 3;
        var used = 0;
        var offset;
        var value;

        for (offset = 0; offset < GRID_WIDTH; offset += 1) {
            value = board[(row * GRID_WIDTH) + offset];
            if (value) {
                used |= 1 << (value - 1);
            }
            value = board[(offset * GRID_WIDTH) + column];
            if (value) {
                used |= 1 << (value - 1);
            }
        }
        for (offset = 0; offset < GRID_WIDTH; offset += 1) {
            value = board[((boxRow + Math.floor(offset / 3)) * GRID_WIDTH) + boxColumn + (offset % 3)];
            if (value) {
                used |= 1 << (value - 1);
            }
        }
        return FULL_MASK & ~used;
    }

    /**
     * Counts set bits in a nine-bit candidate mask.
     * @param {number} mask Candidate mask.
     * @returns {number} Bit count.
     */
    function bitCount(mask) {
        var value = mask;
        var count = 0;

        while (value) {
            value &= value - 1;
            count += 1;
        }
        return count;
    }

    /**
     * Rejects duplicate filled digits before treating a state as complete.
     * @param {number[]} board Search board.
     * @returns {boolean} Whether every filled row, column, and box is consistent.
     */
    function isConsistentBoard(board) {
        var units = new Array(GRID_WIDTH * 3).fill(0);

        for (var index = 0; index < CELL_COUNT; index += 1) {
            var digit = board[index];
            var bit;
            var row;
            var column;
            var box;

            if (digit === 0) {
                continue;
            }
            bit = 1 << (digit - 1);
            row = Math.floor(index / GRID_WIDTH);
            column = index % GRID_WIDTH;
            box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
            if ((units[row] & bit) || (units[9 + column] & bit) ||
                    (units[18 + box] & bit)) {
                return false;
            }
            units[row] |= bit;
            units[9 + column] |= bit;
            units[18 + box] |= bit;
        }
        return true;
    }

    /**
     * Runs one admitted recursive search node.
     * @param {number[]} board Mutable search board.
     * @param {Object} counters Shared counters and caps.
     * @returns {number|string} Zero, one, two, or `unknown`.
     */
    function search(board, counters) {
        var bestIndex = -1;
        var bestMask = 0;
        var bestCount = 10;
        var index;
        var mask;
        var count;
        var digit;
        var result;
        var total = 0;

        if (counters.checkNodes === counters.checkLimit) {
            return UNKNOWN;
        }
        if (counters.attemptNodes === counters.attemptLimit) {
            return UNKNOWN;
        }
        counters.checkNodes += 1;
        counters.attemptNodes += 1;

        if (!isConsistentBoard(board)) {
            return 0;
        }
        for (index = 0; index < CELL_COUNT; index += 1) {
            if (board[index] !== 0) {
                continue;
            }

            mask = candidateMask(board, index);
            if (mask === 0) {
                return 0;
            }
            count = bitCount(mask);
            if (count < bestCount) {
                bestCount = count;
                bestIndex = index;
                bestMask = mask;
            }
        }

        if (bestIndex === -1) {
            return 1;
        }

        for (digit = 1; digit <= GRID_WIDTH; digit += 1) {
            if ((bestMask & (1 << (digit - 1))) === 0) {
                continue;
            }
            board[bestIndex] = digit;
            result = search(board, counters);
            board[bestIndex] = 0;
            if (result === UNKNOWN) {
                return UNKNOWN;
            }
            total += result;
            if (total >= 2) {
                return 2;
            }
        }
        return total;
    }

    /**
     * Counts solutions up to two under exact pre-entry node caps.
     * @param {number[]} board Puzzle digits.
     * @param {Object} [options] Optional counters/caps for tests and generation.
     * @returns {{status: number|string, checkNodes: number, attemptNodes: number}}
     * Search outcome and counters.
     */
    function countSolutions(board, options) {
        var settings = options || {};
        var counters = {
            checkNodes: 0,
            attemptNodes: Number.isInteger(settings.attemptNodes) ? settings.attemptNodes : 0,
            checkLimit: Number.isInteger(settings.checkLimit) ? settings.checkLimit : DEFAULT_CHECK_LIMIT,
            attemptLimit: Number.isInteger(settings.attemptLimit) ? settings.attemptLimit : DEFAULT_ATTEMPT_LIMIT
        };
        var status;

        if (!Array.isArray(board) || board.length !== CELL_COUNT ||
                board.some(function (value) {
                    return !Number.isInteger(value) || value < 0 || value > 9;
                })) {
            throw new TypeError("Invalid Sudoku board");
        }

        status = search(board.slice(), counters);
        return {
            status: status,
            checkNodes: counters.checkNodes,
            attemptNodes: counters.attemptNodes
        };
    }

    /**
     * Generates one deterministic puzzle attempt.
     * @param {string} puzzleId Stable versioned identity.
     * @param {number} attempt Attempt number.
     * @returns {Object|null} Accepted puzzle or null.
     */
    function generateAttempt(puzzleId, attempt) {
        var stream = createPrng(fnv1a(puzzleId + "|attempt=" + String(attempt)));
        var solution = createSolvedGrid(stream);
        var clues = solution.slice();
        var groups = sequence(41).map(function (index) {
            return index === 40 ? [40] : [index, 80 - index];
        });
        var attemptNodes = 0;
        var clueCount = CELL_COUNT;
        var groupIndex;
        var group;
        var removed;
        var result;
        var finalResult;

        shuffle(groups, stream);
        for (groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
            group = groups[groupIndex];
            removed = group.map(function (index) {
                return clues[index];
            });
            group.forEach(function (index) {
                clues[index] = 0;
            });

            result = countSolutions(clues, {attemptNodes: attemptNodes});
            attemptNodes = result.attemptNodes;
            if (result.status !== 1) {
                group.forEach(function (index, offset) {
                    clues[index] = removed[offset];
                });
                if (result.status === UNKNOWN && attemptNodes === DEFAULT_ATTEMPT_LIMIT) {
                    return null;
                }
                continue;
            }

            clueCount -= group.length;
            if (clueCount >= MIN_CLUES && clueCount <= MAX_CLUES) {
                finalResult = countSolutions(clues, {attemptNodes: attemptNodes});
                if (finalResult.status === 1 && validatePuzzle(clues, solution)) {
                    return {
                        puzzleId: puzzleId,
                        clues: clues.slice(),
                        solution: solution.slice(),
                        attempt: attempt,
                        clueCount: clueCount
                    };
                }
                return null;
            }
        }
        return null;
    }

    /**
     * Validates clue range, symmetry, agreement, and solution invariants.
     * @param {number[]} clues Puzzle clues.
     * @param {number[]} solution Solved board.
     * @returns {boolean} Whether inexpensive invariants hold.
     */
    function validatePuzzle(clues, solution) {
        var clueCount;
        var index;

        if (!Array.isArray(clues) || clues.length !== CELL_COUNT || !isSolvedGrid(solution)) {
            return false;
        }
        clueCount = 0;
        for (index = 0; index < CELL_COUNT; index += 1) {
            if (!Number.isInteger(clues[index]) || clues[index] < 0 || clues[index] > 9) {
                return false;
            }
            if ((clues[index] === 0) !== (clues[80 - index] === 0)) {
                return false;
            }
            if (clues[index] !== 0) {
                clueCount += 1;
                if (clues[index] !== solution[index]) {
                    return false;
                }
            }
        }
        return clueCount >= MIN_CLUES && clueCount <= MAX_CLUES;
    }

    /**
     * Selects the first accepted attempt from exactly attempts zero through 11.
     * @param {string} puzzleId Stable versioned identity.
     * @param {function(number, string): void} [progress] Progress callback.
     * @returns {{status: string, puzzle?: Object}} Generation outcome.
     */
    function generate(puzzleId, progress) {
        var attempt;
        var puzzle;

        if (typeof puzzleId !== "string" || puzzleId.length === 0) {
            throw new TypeError("Invalid puzzle identity");
        }

        for (attempt = 0; attempt < ATTEMPT_COUNT; attempt += 1) {
            if (typeof progress === "function") {
                progress(attempt, "started");
            }
            puzzle = generateAttempt(puzzleId, attempt);
            if (puzzle) {
                return {status: "result", puzzle: puzzle};
            }
            if (typeof progress === "function") {
                progress(attempt, "rejected");
            }
        }
        return {status: "failure"};
    }

    return Object.freeze({
        constants: Object.freeze({
            algorithmId: "shugg-sudoku-v1",
            tierId: "classic-v1",
            checkNodeLimit: DEFAULT_CHECK_LIMIT,
            attemptNodeLimit: DEFAULT_ATTEMPT_LIMIT,
            attemptCount: ATTEMPT_COUNT
        }),
        fnv1a: fnv1a,
        createPrng: createPrng,
        boundedDraw: boundedDraw,
        shuffle: shuffle,
        createSolvedGrid: createSolvedGrid,
        isSolvedGrid: isSolvedGrid,
        countSolutions: countSolutions,
        validatePuzzle: validatePuzzle,
        generateAttempt: generateAttempt,
        generate: generate
    });
}));
