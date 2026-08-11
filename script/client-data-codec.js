// Generic, dependency-free encoding for portable client-owned JSON data.
(function () {
    "use strict";

    var FORMAT = "shugg-client-data";
    var FORMAT_VERSION = 1;
    var TOKEN_PREFIX = "SHUGGDATA";
    var DEFAULT_MAX_ENCODED_BYTES = 524288;
    var DEFAULT_MAX_DECODED_BYTES = 393216;
    var HARD_MAX_BYTES = 2097152;
    var MAX_APP_ID_BYTES = 128;
    var CRC_POLYNOMIAL = 0xEDB88320;
    var CRC_TABLE = createCrcTable();
    var OBJECT_PROTOTYPE = Object.prototype;
    var FUNCTION_TO_STRING = Function.prototype.toString;
    var NATIVE_OBJECT_SOURCE = FUNCTION_TO_STRING.call(Object);

    /** Create a typed error whose code is safe for application-level message mapping. */
    function codecError(code) {
        var error = new Error(code);
        error.name = "ShuggClientDataCodecError";
        error.code = code;
        return error;
    }

    /** Return whether a value is an ordinary cross-realm-safe plain object. */
    function isPlainObject(value) {
        var prototype;
        var constructorDescriptor;
        var constructorPrototypeDescriptor;

        if (value === null || typeof value !== "object") {
            return false;
        }
        prototype = Object.getPrototypeOf(value);
        if (prototype === null || prototype === OBJECT_PROTOTYPE) {
            return true;
        }

        /*
         * A foreign realm's Object.prototype has a different identity. Prove that
         * relationship through its native Object constructor rather than accepting
         * every user-created null-root prototype.
         */
        if (Object.getPrototypeOf(prototype) !== null) {
            return false;
        }
        constructorDescriptor = Object.getOwnPropertyDescriptor(prototype, "constructor");
        if (!constructorDescriptor ||
                !Object.prototype.hasOwnProperty.call(constructorDescriptor, "value") ||
                typeof constructorDescriptor.value !== "function") {
            return false;
        }
        constructorPrototypeDescriptor = Object.getOwnPropertyDescriptor(
            constructorDescriptor.value, "prototype"
        );
        return Boolean(constructorPrototypeDescriptor &&
            Object.prototype.hasOwnProperty.call(constructorPrototypeDescriptor, "value") &&
            constructorPrototypeDescriptor.value === prototype &&
            FUNCTION_TO_STRING.call(constructorDescriptor.value) === NATIVE_OBJECT_SOURCE);
    }

    /** Return whether a string contains only complete Unicode scalar sequences. */
    function isWellFormedString(value) {
        var index;
        var code;
        var next;
        for (index = 0; index < value.length; index++) {
            code = value.charCodeAt(index);
            if (code >= 0xD800 && code <= 0xDBFF) {
                if (index + 1 >= value.length) {
                    return false;
                }
                next = value.charCodeAt(index + 1);
                if (next < 0xDC00 || next > 0xDFFF) {
                    return false;
                }
                index++;
            } else if (code >= 0xDC00 && code <= 0xDFFF) {
                return false;
            }
        }
        return true;
    }

    /** Parse and validate an optional codec size profile. */
    function normalizeOptions(options) {
        var names;
        var normalized = {
            maxEncodedBytes: DEFAULT_MAX_ENCODED_BYTES,
            maxDecodedBytes: DEFAULT_MAX_DECODED_BYTES
        };
        var index;
        var name;
        var descriptor;

        if (typeof options === "undefined") {
            return normalized;
        }
        if (!isPlainObject(options) || Object.getOwnPropertySymbols(options).length !== 0) {
            throw codecError("INVALID_ARGUMENT");
        }
        names = Object.getOwnPropertyNames(options);
        for (index = 0; index < names.length; index++) {
            name = names[index];
            if (name !== "maxEncodedBytes" && name !== "maxDecodedBytes") {
                throw codecError("INVALID_ARGUMENT");
            }
            descriptor = Object.getOwnPropertyDescriptor(options, name);
            if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
                    !Number.isSafeInteger(descriptor.value) || descriptor.value < 1 ||
                    descriptor.value > HARD_MAX_BYTES) {
                throw codecError("INVALID_ARGUMENT");
            }
            normalized[name] = descriptor.value;
        }
        return normalized;
    }

    /** Validate recursively that a payload can be serialized without coercion or loss. */
    function validatePayload(payload) {
        var active = typeof WeakSet === "function" ? new WeakSet() : [];
        var stack = [{value: payload, exiting: false, parent: null, key: null}];
        var frame;
        var value;
        var type;
        var names;
        var symbols;
        var descriptor;
        var index;
        var expected;
        var sanitized;
        var sanitizedRoot;
        var arrayLength;

        function assignSanitized(targetFrame, sanitizedValue) {
            if (targetFrame.parent === null) {
                sanitizedRoot = sanitizedValue;
            } else {
                targetFrame.parent[targetFrame.key] = sanitizedValue;
            }
        }

        function containsActive(candidate) {
            return active instanceof Array ?
                active.indexOf(candidate) !== -1 : active.has(candidate);
        }

        function addActive(candidate) {
            if (active instanceof Array) {
                active.push(candidate);
            } else {
                active.add(candidate);
            }
        }

        function removeActive(candidate) {
            if (active instanceof Array) {
                active.splice(active.indexOf(candidate), 1);
            } else {
                active.delete(candidate);
            }
        }

        while (stack.length) {
            frame = stack.pop();
            value = frame.value;
            if (frame.exiting) {
                removeActive(value);
                continue;
            }

            if (value === null || typeof value === "boolean") {
                assignSanitized(frame, value);
                continue;
            }
            type = typeof value;
            if (type === "string") {
                if (!isWellFormedString(value)) {
                    throw codecError("INVALID_PAYLOAD");
                }
                assignSanitized(frame, value);
                continue;
            }
            if (type === "number") {
                if (!Number.isFinite(value) || Object.is(value, -0)) {
                    throw codecError("INVALID_PAYLOAD");
                }
                assignSanitized(frame, value);
                continue;
            }
            if (type !== "object" || (!Array.isArray(value) && !isPlainObject(value))) {
                throw codecError("INVALID_PAYLOAD");
            }
            if (containsActive(value)) {
                throw codecError("INVALID_PAYLOAD");
            }

            symbols = Object.getOwnPropertySymbols(value);
            if (symbols.length !== 0) {
                throw codecError("INVALID_PAYLOAD");
            }
            names = Object.getOwnPropertyNames(value);
            addActive(value);
            stack.push({value: value, exiting: true});

            if (Array.isArray(value)) {
                descriptor = Object.getOwnPropertyDescriptor(value, "length");
                if (!descriptor ||
                        !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
                        !Number.isSafeInteger(descriptor.value)) {
                    throw codecError("INVALID_PAYLOAD");
                }
                arrayLength = descriptor.value;
                if (names.length !== arrayLength + 1 ||
                        names[names.length - 1] !== "length") {
                    throw codecError("INVALID_PAYLOAD");
                }
                sanitized = [];
                Object.setPrototypeOf(sanitized, null);
                assignSanitized(frame, sanitized);
                for (index = arrayLength - 1; index >= 0; index--) {
                    expected = String(index);
                    if (names[index] !== expected) {
                        throw codecError("INVALID_PAYLOAD");
                    }
                    descriptor = Object.getOwnPropertyDescriptor(value, expected);
                    if (!descriptor.enumerable ||
                            !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
                        throw codecError("INVALID_PAYLOAD");
                    }
                    stack.push({
                        value: descriptor.value,
                        exiting: false,
                        parent: sanitized,
                        key: expected
                    });
                }
                continue;
            }

            sanitized = Object.create(null);
            assignSanitized(frame, sanitized);
            for (index = names.length - 1; index >= 0; index--) {
                if (!isWellFormedString(names[index])) {
                    throw codecError("INVALID_PAYLOAD");
                }
                descriptor = Object.getOwnPropertyDescriptor(value, names[index]);
                if (!descriptor.enumerable ||
                        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
                    throw codecError("INVALID_PAYLOAD");
                }
                stack.push({
                    value: descriptor.value,
                    exiting: false,
                    parent: sanitized,
                    key: names[index]
                });
            }
        }
        return sanitizedRoot;
    }

    /** Validate an exact packet envelope and return its descriptor values. */
    function validateEnvelope(packet) {
        var required = ["format", "formatVersion", "appId", "schemaVersion", "payload"];
        var values = {};
        var names;
        var symbols;
        var descriptor;
        var index;
        var appIdBytes;

        if (!isPlainObject(packet)) {
            throw codecError("INVALID_ENVELOPE");
        }
        names = Object.getOwnPropertyNames(packet);
        symbols = Object.getOwnPropertySymbols(packet);
        if (symbols.length !== 0 || names.length !== required.length) {
            throw codecError("INVALID_ENVELOPE");
        }
        for (index = 0; index < required.length; index++) {
            if (names.indexOf(required[index]) === -1) {
                throw codecError("INVALID_ENVELOPE");
            }
            descriptor = Object.getOwnPropertyDescriptor(packet, required[index]);
            if (!descriptor.enumerable ||
                    !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
                throw codecError("INVALID_ENVELOPE");
            }
            values[required[index]] = descriptor.value;
        }
        if (values.format !== FORMAT) {
            throw codecError("INVALID_ENVELOPE");
        }
        if (!Number.isSafeInteger(values.formatVersion) || values.formatVersion < 1) {
            throw codecError("INVALID_ENVELOPE");
        }
        if (values.formatVersion !== FORMAT_VERSION) {
            throw codecError("UNSUPPORTED_FORMAT_VERSION");
        }
        if (typeof values.appId !== "string" || !values.appId ||
                !isWellFormedString(values.appId)) {
            throw codecError("INVALID_ENVELOPE");
        }
        appIdBytes = new TextEncoder().encode(values.appId).length;
        if (appIdBytes > MAX_APP_ID_BYTES) {
            throw codecError("INVALID_ENVELOPE");
        }
        if (!Number.isSafeInteger(values.schemaVersion) || values.schemaVersion < 1) {
            throw codecError("INVALID_ENVELOPE");
        }
        values.payload = validatePayload(values.payload);
        return values;
    }

    /** Build the CRC-32/IEEE lookup table. */
    function createCrcTable() {
        var table = [];
        var index;
        var bit;
        var value;
        for (index = 0; index < 256; index++) {
            value = index;
            for (bit = 0; bit < 8; bit++) {
                value = (value >>> 1) ^ ((value & 1) ? CRC_POLYNOMIAL : 0);
            }
            table[index] = value >>> 0;
        }
        return table;
    }

    /** Return the lowercase eight-digit CRC-32/IEEE checksum for bytes. */
    function crc32Hex(bytes) {
        var checksum = 0xFFFFFFFF;
        var index;
        for (index = 0; index < bytes.length; index++) {
            checksum = (checksum >>> 8) ^ CRC_TABLE[(checksum ^ bytes[index]) & 0xFF];
        }
        return ((checksum ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, "0");
    }

    /** Encode bytes as canonical unpadded base64url text. */
    function encodeBase64Url(bytes) {
        var binary = "";
        var chunkSize = 0x8000;
        var index;
        for (index = 0; index < bytes.length; index += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
        }
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    /** Decode canonical unpadded base64url text to bytes. */
    function decodeBase64Url(text) {
        var padded;
        var binary;
        var bytes;
        var index;

        if (!text || !/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) {
            throw codecError("INVALID_BASE64URL");
        }
        padded = text.replace(/-/g, "+").replace(/_/g, "/");
        padded += "===".slice((padded.length + 3) % 4);
        try {
            binary = atob(padded);
        } catch (error) {
            throw codecError("INVALID_BASE64URL");
        }
        bytes = new Uint8Array(binary.length);
        for (index = 0; index < binary.length; index++) {
            bytes[index] = binary.charCodeAt(index);
        }
        if (encodeBase64Url(bytes) !== text) {
            throw codecError("INVALID_BASE64URL");
        }
        return bytes;
    }

    /** Encode one validated client-data packet as a canonical portable token. */
    function encode(packet, options) {
        var limits = normalizeOptions(options);
        var values = validateEnvelope(packet);
        var envelope = Object.create(null);
        var json;
        var bytes;
        var token;

        envelope.format = values.format;
        envelope.formatVersion = values.formatVersion;
        envelope.appId = values.appId;
        envelope.schemaVersion = values.schemaVersion;
        envelope.payload = values.payload;

        try {
            json = JSON.stringify(envelope);
        } catch (error) {
            throw codecError("INVALID_PAYLOAD");
        }
        bytes = new TextEncoder().encode(json);
        if (bytes.length > limits.maxDecodedBytes) {
            throw codecError("DECODED_SIZE_EXCEEDED");
        }
        token = TOKEN_PREFIX + FORMAT_VERSION + "." + encodeBase64Url(bytes) +
            "." + crc32Hex(bytes);
        if (token.length > limits.maxEncodedBytes) {
            throw codecError("ENCODED_SIZE_EXCEEDED");
        }
        return token;
    }

    /** Decode, verify, and validate one canonical portable token. */
    function decode(token, options) {
        var limits = normalizeOptions(options);
        var trimmed;
        var encodedBytes;
        var parts;
        var versionMatch;
        var version;
        var bytes;
        var json;
        var packet;

        if (typeof token !== "string") {
            throw codecError("INVALID_ARGUMENT");
        }
        trimmed = token.trim();
        encodedBytes = new TextEncoder().encode(trimmed).length;
        if (encodedBytes > limits.maxEncodedBytes) {
            throw codecError("ENCODED_SIZE_EXCEEDED");
        }
        if (!trimmed || /\s/.test(trimmed)) {
            throw codecError("MALFORMED_FRAMING");
        }
        parts = trimmed.split(".");
        if (parts.length !== 3 || !/^[0-9a-f]{8}$/.test(parts[2])) {
            throw codecError("MALFORMED_FRAMING");
        }
        versionMatch = /^SHUGGDATA([0-9]+)$/.exec(parts[0]);
        if (!versionMatch) {
            throw codecError("MALFORMED_FRAMING");
        }
        version = Number(versionMatch[1]);
        if (version !== FORMAT_VERSION) {
            throw codecError("UNSUPPORTED_FORMAT_VERSION");
        }
        if (parts[0] !== TOKEN_PREFIX + FORMAT_VERSION) {
            throw codecError("MALFORMED_FRAMING");
        }
        bytes = decodeBase64Url(parts[1]);
        if (bytes.length > limits.maxDecodedBytes) {
            throw codecError("DECODED_SIZE_EXCEEDED");
        }
        if (crc32Hex(bytes) !== parts[2]) {
            throw codecError("CHECKSUM_MISMATCH");
        }
        try {
            json = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
        } catch (error) {
            throw codecError("INVALID_UTF8");
        }
        try {
            packet = JSON.parse(json);
        } catch (error) {
            throw codecError("INVALID_JSON");
        }
        validateEnvelope(packet);
        return packet;
    }

    window.ShuggClientDataCodec = Object.freeze({
        encode: encode,
        decode: decode
    });
}());
