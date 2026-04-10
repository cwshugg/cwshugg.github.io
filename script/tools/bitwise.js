// Bitwise Calculator — script/tools/bitwise.js
// Evaluates bitwise expressions with a recursive-descent parser.
// Displays results in decimal, hex, octal, and binary with endianness toggle.

(function () {
    "use strict";

    // ------------------------------------------------------------------ //
    //  Tokenizer                                                          //
    // ------------------------------------------------------------------ //

    /**
     * Token types produced by the tokenizer.
     */
    var TOKEN = {
        NUMBER: "NUMBER",
        AND:    "&",
        OR:     "|",
        XOR:    "^",
        NOT:    "~",
        LSHIFT: "<<",
        RSHIFT: ">>",
        LPAREN: "(",
        RPAREN: ")",
        EOF:    "EOF"
    };

    /**
     * Tokenizes a bitwise expression string into an array of token objects.
     * Each token has { type, value } where value is meaningful for NUMBER tokens.
     *
     * Supported number literals:
     *   - Decimal:     123
     *   - Hexadecimal: 0xFF or 0XFF
     *   - Octal:       0o77 or 0O77
     *   - Binary:      0b1010 or 0B1010
     *
     * Throws an error on unexpected characters.
     */
    function tokenize(expr) {
        var tokens = [];
        var i = 0;
        var len = expr.length;

        while (i < len) {
            var ch = expr[i];

            // Skip whitespace
            if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
                i++;
                continue;
            }

            // Two-character operators: << and >>
            if (ch === "<" && i + 1 < len && expr[i + 1] === "<") {
                tokens.push({ type: TOKEN.LSHIFT, value: "<<" });
                i += 2;
                continue;
            }
            if (ch === ">" && i + 1 < len && expr[i + 1] === ">") {
                tokens.push({ type: TOKEN.RSHIFT, value: ">>" });
                i += 2;
                continue;
            }

            // Single-character operators and parens
            if (ch === "&") { tokens.push({ type: TOKEN.AND,    value: ch }); i++; continue; }
            if (ch === "|") { tokens.push({ type: TOKEN.OR,     value: ch }); i++; continue; }
            if (ch === "^") { tokens.push({ type: TOKEN.XOR,    value: ch }); i++; continue; }
            if (ch === "~") { tokens.push({ type: TOKEN.NOT,    value: ch }); i++; continue; }
            if (ch === "(") { tokens.push({ type: TOKEN.LPAREN, value: ch }); i++; continue; }
            if (ch === ")") { tokens.push({ type: TOKEN.RPAREN, value: ch }); i++; continue; }

            // Number literals
            if (isDigit(ch)) {
                var start = i;

                // Check for prefix: 0x, 0o, 0b
                if (ch === "0" && i + 1 < len) {
                    var prefix = expr[i + 1].toLowerCase();
                    if (prefix === "x") {
                        // Hexadecimal
                        i += 2;
                        if (i >= len || !isHexDigit(expr[i])) {
                            throw new Error("Invalid hex literal");
                        }
                        while (i < len && isHexDigit(expr[i])) { i++; }
                        tokens.push({ type: TOKEN.NUMBER, value: parseInt(expr.slice(start + 2, i), 16) });
                        continue;
                    }
                    if (prefix === "o") {
                        // Octal
                        i += 2;
                        if (i >= len || !isOctDigit(expr[i])) {
                            throw new Error("Invalid octal literal");
                        }
                        while (i < len && isOctDigit(expr[i])) { i++; }
                        tokens.push({ type: TOKEN.NUMBER, value: parseInt(expr.slice(start + 2, i), 8) });
                        continue;
                    }
                    if (prefix === "b") {
                        // Binary
                        i += 2;
                        if (i >= len || !isBinDigit(expr[i])) {
                            throw new Error("Invalid binary literal");
                        }
                        while (i < len && isBinDigit(expr[i])) { i++; }
                        tokens.push({ type: TOKEN.NUMBER, value: parseInt(expr.slice(start + 2, i), 2) });
                        continue;
                    }
                }

                // Plain decimal
                while (i < len && isDigit(expr[i])) { i++; }
                tokens.push({ type: TOKEN.NUMBER, value: parseInt(expr.slice(start, i), 10) });
                continue;
            }

            throw new Error("Unexpected character: '" + ch + "'");
        }

        tokens.push({ type: TOKEN.EOF, value: null });
        return tokens;
    }

    function isDigit(ch)    { return ch >= "0" && ch <= "9"; }
    function isHexDigit(ch) { return isDigit(ch) || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F"); }
    function isOctDigit(ch) { return ch >= "0" && ch <= "7"; }
    function isBinDigit(ch) { return ch === "0" || ch === "1"; }

    // ------------------------------------------------------------------ //
    //  Recursive-Descent Parser                                           //
    // ------------------------------------------------------------------ //
    //
    //  Grammar (lowest to highest precedence):
    //
    //    expr       → orExpr
    //    orExpr     → xorExpr ( '|' xorExpr )*
    //    xorExpr    → andExpr ( '^' andExpr )*
    //    andExpr    → shiftExpr ( '&' shiftExpr )*
    //    shiftExpr  → unaryExpr ( ('<<' | '>>') unaryExpr )*
    //    unaryExpr  → '~' unaryExpr | primary
    //    primary    → NUMBER | '(' expr ')'
    //

    /**
     * Parses a token array and returns the evaluated integer result.
     * Uses a simple recursive-descent approach with correct C operator precedence.
     */
    function parse(tokens) {
        var pos = 0;

        function peek()    { return tokens[pos]; }
        function advance() { return tokens[pos++]; }

        function expect(type) {
            var tok = advance();
            if (tok.type !== type) {
                throw new Error("Expected " + type + " but got " + tok.type);
            }
            return tok;
        }

        // orExpr → xorExpr ( '|' xorExpr )*
        function orExpr() {
            var left = xorExpr();
            while (peek().type === TOKEN.OR) {
                advance();
                left = (left | xorExpr()) >>> 0;
            }
            return left;
        }

        // xorExpr → andExpr ( '^' andExpr )*
        function xorExpr() {
            var left = andExpr();
            while (peek().type === TOKEN.XOR) {
                advance();
                left = (left ^ andExpr()) >>> 0;
            }
            return left;
        }

        // andExpr → shiftExpr ( '&' shiftExpr )*
        function andExpr() {
            var left = shiftExpr();
            while (peek().type === TOKEN.AND) {
                advance();
                left = (left & shiftExpr()) >>> 0;
            }
            return left;
        }

        // shiftExpr → unaryExpr ( ('<<' | '>>') unaryExpr )*
        function shiftExpr() {
            var left = unaryExpr();
            while (peek().type === TOKEN.LSHIFT || peek().type === TOKEN.RSHIFT) {
                var op = advance().type;
                var right = unaryExpr();
                if (op === TOKEN.LSHIFT) {
                    left = (left << right) >>> 0;
                } else {
                    left = (left >>> right) >>> 0;
                }
            }
            return left;
        }

        // unaryExpr → '~' unaryExpr | primary
        function unaryExpr() {
            if (peek().type === TOKEN.NOT) {
                advance();
                var val = unaryExpr();
                return (~val) >>> 0;
            }
            return primary();
        }

        // primary → NUMBER | '(' expr ')'
        function primary() {
            var tok = peek();

            if (tok.type === TOKEN.NUMBER) {
                advance();
                return tok.value >>> 0;   // treat as unsigned 32-bit
            }

            if (tok.type === TOKEN.LPAREN) {
                advance();
                var val = orExpr();
                expect(TOKEN.RPAREN);
                return val;
            }

            throw new Error("Unexpected token: " + tok.type);
        }

        var result = orExpr();

        // Make sure we consumed everything
        if (peek().type !== TOKEN.EOF) {
            throw new Error("Unexpected token after expression: " + peek().type);
        }

        return result;
    }

    // ------------------------------------------------------------------ //
    //  Formatting Helpers                                                 //
    // ------------------------------------------------------------------ //

    /**
     * Returns the number of bytes needed to represent a value,
     * rounded up to a standard width (1, 2, or 4 bytes).
     */
    function byteCount(val) {
        if (val === 0) return 1;
        var bits = 0;
        var v = val;
        while (v > 0) {
            bits++;
            v = v >>> 1;
        }
        var raw = Math.ceil(bits / 8);
        // Round up to standard widths: 1, 2, or 4
        if (raw <= 1) return 1;
        if (raw <= 2) return 2;
        return 4;
    }

    /**
     * Returns the display byte width — for endianness reversal we need
     * at least 2 bytes for it to be meaningful.
     */
    function displayByteCount(val) {
        var n = byteCount(val);
        return n < 2 ? 2 : n;
    }

    /**
     * Formats a 32-bit unsigned integer as a hex string with 0x prefix.
     * Pads to the nearest even number of hex digits (byte-aligned).
     */
    function formatHex(val) {
        var nBytes = byteCount(val);
        return "0x" + val.toString(16).toUpperCase().padStart(nBytes * 2, "0");
    }

    /**
     * Formats a 32-bit unsigned integer as an octal string with 0o prefix.
     */
    function formatOct(val) {
        return "0o" + val.toString(8);
    }

    /**
     * Formats a value as a 32-bit binary string with 0b prefix.
     * Nibbles (4-bit groups) are separated by spaces for readability.
     */
    function formatBin(val) {
        var bits = val.toString(2).padStart(32, "0");
        var nibbles = [];
        for (var i = 0; i < bits.length; i += 4) {
            nibbles.push(bits.slice(i, i + 4));
        }
        return "0b" + nibbles.join(" ");
    }

    /**
     * Formats a 32-bit unsigned integer as a decimal string.
     */
    function formatDec(val) {
        return val.toString(10);
    }

    // ------------------------------------------------------------------ //
    //  Endianness                                                         //
    // ------------------------------------------------------------------ //

    /**
     * Reverses the byte order of a 32-bit unsigned integer.
     * Only reverses the bytes that are "significant" (i.e. byteCount bytes).
     * The value is packed into byteCount(val) bytes, reversed, then read back.
     */
    function reverseBytes(val) {
        var nBytes = displayByteCount(val);
        var bytes = [];
        var v = val;
        for (var i = 0; i < nBytes; i++) {
            bytes.push(v & 0xFF);
            v = v >>> 8;
        }
        // bytes[] is already in little-endian order (LSB first),
        // so to display as little-endian we just reconstruct from this order.
        var result = 0;
        for (var j = 0; j < bytes.length; j++) {
            result = (result << 8) | bytes[j];
        }
        return result >>> 0;
    }

    // ------------------------------------------------------------------ //
    //  UI Logic                                                           //
    // ------------------------------------------------------------------ //

    var inputEl   = document.getElementById("bitwise-input");
    var resultEl  = document.getElementById("bitwise-result");
    var toggleBtn = document.getElementById("bitwise-endian-toggle");
    var labelEl   = document.getElementById("bitwise-endian-label");

    // Current endianness: true = big endian (default), false = little endian
    var isBigEndian = true;

    // Restore preference from localStorage
    try {
        var stored = localStorage.getItem("bitwise-endian");
        if (stored === "LE") {
            isBigEndian = false;
        }
    } catch (e) {
        // localStorage unavailable — ignore
    }

    /**
     * Updates the toggle button and label to reflect the current endianness.
     */
    function updateEndianUI() {
        if (toggleBtn) {
            toggleBtn.textContent = isBigEndian ? "[BE]" : "[LE]";
        }
        if (labelEl) {
            labelEl.textContent = isBigEndian ? "Big Endian" : "Little Endian";
        }
    }

    /**
     * Saves the current endianness preference to localStorage.
     */
    function saveEndianPref() {
        try {
            localStorage.setItem("bitwise-endian", isBigEndian ? "BE" : "LE");
        } catch (e) {
            // localStorage unavailable — ignore
        }
    }

    /**
     * Evaluates the current expression and renders the result.
     */
    function evaluate() {
        if (!inputEl || !resultEl) return;

        var raw = inputEl.value.trim();

        // Empty input — clear result
        if (raw === "") {
            resultEl.innerHTML = "";
            return;
        }

        try {
            var tokens = tokenize(raw);
            var val = parse(tokens);     // unsigned 32-bit result

            // Apply endianness only to hex and binary display
            var endianVal = isBigEndian ? val : reverseBytes(val);
            var endianNote = isBigEndian ? '' : ' <span style="color:var(--color-text-muted);font-size:0.8em;">(byte-reversed)</span>';

            var html =
                '<table>' +
                '<thead><tr>' +
                '<th>Format</th><th>Value</th>' +
                '</tr></thead>' +
                '<tbody>' +
                '<tr><td>Decimal</td><td>' + formatDec(val) + '</td></tr>' +
                '<tr><td>Hex</td><td>' + formatHex(endianVal) + endianNote + '</td></tr>' +
                '<tr><td>Octal</td><td>' + formatOct(val) + '</td></tr>' +
                '<tr><td>Binary</td><td style="font-family:var(--font-code);word-break:break-all;">' + formatBin(endianVal) + endianNote + '</td></tr>' +
                '</tbody></table>';

            resultEl.innerHTML = html;
        } catch (err) {
            var msg = err.message || "Invalid expression.";
            var safe = document.createElement("p");
            safe.style.color = "var(--color-accent3)";
            safe.textContent = msg;
            resultEl.innerHTML = "";
            resultEl.appendChild(safe);
        }
    }

    // Initialize endianness UI on load
    updateEndianUI();

    // Wire up event listeners
    if (inputEl) {
        inputEl.addEventListener("input", evaluate);
    }

    if (toggleBtn) {
        toggleBtn.addEventListener("click", function () {
            isBigEndian = !isBigEndian;
            updateEndianUI();
            saveEndianPref();
            evaluate();
        });
    }

    // Run initial evaluation in case there's a pre-filled value
    evaluate();
})();
