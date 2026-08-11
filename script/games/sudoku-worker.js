/**
 * Dedicated classic worker for one bounded Sudoku v1 generation request.
 */
"use strict";

importScripts("./sudoku-engine.js", "./sudoku-protocol.js");

/**
 * Sends only exact protocol messages with generic failure information.
 * @param {MessageEvent} event Incoming generate request.
 */
self.onmessage = function (event) {
    var request = event.data;
    var outcome;

    if (!self.SudokuProtocolV1.validateRequest(request)) {
        self.postMessage({
            protocol: 1,
            type: "error",
            requestId: request && Number.isSafeInteger(request.requestId) && request.requestId > 0
                ? request.requestId
                : 1,
            code: "INVALID_REQUEST"
        });
        return;
    }

    try {
        outcome = self.SudokuEngineV1.generate(request.identity.puzzleId, function (attempt, phase) {
            self.postMessage({
                protocol: 1,
                type: "progress",
                requestId: request.requestId,
                attempt: attempt,
                phase: phase
            });
        });
        if (outcome.status === "result") {
            self.postMessage({
                protocol: 1,
                type: "result",
                requestId: request.requestId,
                puzzle: outcome.puzzle
            });
        } else {
            self.postMessage({
                protocol: 1,
                type: "failure",
                requestId: request.requestId,
                code: "BUDGET_EXHAUSTED"
            });
        }
    } catch (_error) {
        self.postMessage({
            protocol: 1,
            type: "error",
            requestId: request.requestId,
            code: "ENGINE_ERROR"
        });
    }
};
