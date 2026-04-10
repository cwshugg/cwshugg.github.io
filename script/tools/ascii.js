// ASCII Table Tool — script/tools/ascii.js
// Builds an interactive ASCII converter and full reference table.

(function () {
    "use strict";

    // Standard abbreviations for control characters 0-31 and DEL (127).
    var CONTROL_CHARS = [
        "NUL", "SOH", "STX", "ETX", "EOT", "ENQ", "ACK", "BEL",
        "BS",  "TAB", "LF",  "VT",  "FF",  "CR",  "SO",  "SI",
        "DLE", "DC1", "DC2", "DC3", "DC4", "NAK", "SYN", "ETB",
        "CAN", "EM",  "SUB", "ESC", "FS",  "GS",  "RS",  "US"
    ];

    /**
     * Returns the display character for a given ASCII code point.
     * Control characters get their abbreviation; space becomes "SP";
     * DEL (127) becomes "DEL"; everything else is the literal character.
     */
    function charLabel(code) {
        if (code >= 0 && code <= 31) return CONTROL_CHARS[code];
        if (code === 32) return "SP";
        if (code === 127) return "DEL";
        return String.fromCharCode(code);
    }

    /**
     * Formats a number as a zero-padded binary string (7 digits for ASCII).
     */
    function toBin(n) {
        return n.toString(2).padStart(7, "0");
    }

    /**
     * Formats a number as a zero-padded hex string (2 digits).
     */
    function toHex(n) {
        return n.toString(16).toUpperCase().padStart(2, "0");
    }

    /**
     * Formats a number as a zero-padded octal string (3 digits).
     */
    function toOct(n) {
        return n.toString(8).padStart(3, "0");
    }

    // ------------------------------------------------------------------ //
    //  Converter                                                          //
    // ------------------------------------------------------------------ //

    var converterInput = document.getElementById("ascii-converter-input");
    var converterResult = document.getElementById("ascii-converter-result");

    if (converterInput && converterResult) {
        converterInput.addEventListener("input", function () {
            var raw = converterInput.value.trim();
            if (raw === "") {
                converterResult.innerHTML = "";
                return;
            }

            var code = parseInput(raw);

            if (code === null || code < 0 || code > 127) {
                converterResult.innerHTML =
                    '<p style="color: var(--color-accent3);">Not a valid ASCII value (0–127).</p>';
                return;
            }

            var label = charLabel(code);
            var isPrintable = code >= 33 && code <= 126;

            var html = '<table>' +
                '<thead><tr>' +
                '<th>Dec</th><th>Hex</th><th>Oct</th><th>Bin</th><th>Char</th>' +
                '</tr></thead>' +
                '<tbody><tr>' +
                '<td>' + code + '</td>' +
                '<td>0x' + toHex(code) + '</td>' +
                '<td>0o' + toOct(code) + '</td>' +
                '<td>0b' + toBin(code) + '</td>' +
                '<td><strong>' + escapeHtml(label) + '</strong>' +
                (isPrintable ? '' : ' <span style="color:var(--color-text-muted);font-size:0.85em;">(' + (code <= 31 ? 'control' : code === 32 ? 'space' : 'delete') + ')</span>') +
                '</td>' +
                '</tr></tbody></table>';

            converterResult.innerHTML = html;
        });
    }

    /**
     * Parses user input and returns an integer code point, or null.
     * Supports: 0x (hex), 0o (octal), 0b (binary), plain decimal, or a
     * single printable character.
     */
    function parseInput(raw) {
        // Hex prefix
        if (/^0x[0-9a-fA-F]+$/.test(raw)) {
            return parseInt(raw.slice(2), 16);
        }
        // Octal prefix
        if (/^0o[0-7]+$/.test(raw)) {
            return parseInt(raw.slice(2), 8);
        }
        // Binary prefix
        if (/^0b[01]+$/.test(raw)) {
            return parseInt(raw.slice(2), 2);
        }
        // Plain decimal number
        if (/^\d+$/.test(raw)) {
            return parseInt(raw, 10);
        }
        // Single character — return its code
        if (raw.length === 1) {
            var c = raw.charCodeAt(0);
            return (c >= 0 && c <= 127) ? c : null;
        }

        return null;
    }

    /**
     * Escapes HTML special characters to prevent injection.
     */
    function escapeHtml(str) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ------------------------------------------------------------------ //
    //  Full ASCII Table                                                   //
    // ------------------------------------------------------------------ //

    var tableContainer = document.getElementById("ascii-table-container");

    if (tableContainer) {
        // Search / filter input
        var filterLabel = document.createElement("label");
        filterLabel.setAttribute("for", "ascii-table-filter");
        filterLabel.textContent = "Filter rows:";
        tableContainer.appendChild(filterLabel);

        var filterInput = document.createElement("input");
        filterInput.type = "text";
        filterInput.id = "ascii-table-filter";
        filterInput.placeholder = "Search by decimal, hex, octal, binary, or character…";
        filterInput.autocomplete = "off";
        tableContainer.appendChild(filterInput);

        // Wrap the table in a box
        var tableWrap = document.createElement("div");
        tableWrap.className = "box";
        tableWrap.style.overflowX = "auto";

        var table = document.createElement("table");

        // Header — two sets of columns side by side
        var thead = document.createElement("thead");
        var headerRow = document.createElement("tr");
        var cols = ["Dec", "Hex", "Oct", "Bin", "Char"];
        // Left half
        cols.forEach(function (col) {
            var th = document.createElement("th");
            th.textContent = col;
            headerRow.appendChild(th);
        });
        // Spacer
        var thSpacer = document.createElement("th");
        thSpacer.style.width = "0.5rem";
        thSpacer.style.borderBottom = "none";
        thSpacer.className = "ascii-right";
        headerRow.appendChild(thSpacer);
        // Right half
        cols.forEach(function (col) {
            var th = document.createElement("th");
            th.textContent = col;
            th.className = "ascii-right";
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body — 64 rows, each row shows code i (left) and code i+64 (right)
        var tbody = document.createElement("tbody");
        for (var i = 0; i <= 63; i++) {
            var tr = document.createElement("tr");

            // Left half: codes 0-63
            appendCharCells(tr, i, false);

            // Spacer cell
            var tdSpacer = document.createElement("td");
            tdSpacer.style.borderLeft = "none";
            tdSpacer.style.borderRight = "none";
            tdSpacer.className = "ascii-right";
            tr.appendChild(tdSpacer);

            // Right half: codes 64-127
            appendCharCells(tr, i + 64, true);

            tbody.appendChild(tr);
        }

        /**
         * Appends Dec, Hex, Oct, Bin, Char cells for a given code to a row.
         * If isRight is true, adds the "ascii-right" class for mobile hiding.
         */
        function appendCharCells(row, code, isRight) {
            var cls = isRight ? "ascii-right" : "";

            var tdDec = document.createElement("td");
            tdDec.textContent = code;
            if (cls) tdDec.className = cls;
            row.appendChild(tdDec);

            var tdHex = document.createElement("td");
            tdHex.textContent = "0x" + toHex(code);
            if (cls) tdHex.className = cls;
            row.appendChild(tdHex);

            var tdOct = document.createElement("td");
            tdOct.textContent = "0o" + toOct(code);
            if (cls) tdOct.className = cls;
            row.appendChild(tdOct);

            var tdBin = document.createElement("td");
            tdBin.textContent = "0b" + toBin(code);
            tdBin.style.fontFamily = "var(--font-code)";
            if (cls) tdBin.className = cls;
            row.appendChild(tdBin);

            var tdChar = document.createElement("td");
            var label = charLabel(code);
            if (code <= 31 || code === 127 || code === 32) {
                var span = document.createElement("span");
                span.textContent = label;
                span.className = "ascii-ctrl";
                tdChar.appendChild(span);
            } else {
                var strong = document.createElement("strong");
                strong.textContent = label;
                tdChar.appendChild(strong);
            }
            if (cls) tdChar.className = cls;
            row.appendChild(tdChar);
        }
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        tableContainer.appendChild(tableWrap);

        // Filter functionality
        filterInput.addEventListener("input", function () {
            var query = filterInput.value.trim().toLowerCase();
            var rows = tbody.getElementsByTagName("tr");
            for (var r = 0; r < rows.length; r++) {
                var cells = rows[r].getElementsByTagName("td");
                var match = false;
                for (var c = 0; c < cells.length; c++) {
                    if (cells[c].textContent.toLowerCase().indexOf(query) !== -1) {
                        match = true;
                        break;
                    }
                }
                rows[r].style.display = (query === "" || match) ? "" : "none";
            }
        });
    }
})();
