// Generates one randomized email alias and applies it to the page's contact links.

(function () {
    "use strict";

    var ORIGINAL_ADDRESS = "connor@shugg.dev";
    var ALIAS_PREFIX = "hello-";
    var ALIAS_DOMAIN = "@bootscooter.net";
    var ALIAS_LENGTH = 10;
    var ALIAS_STORAGE_KEY = "email-alias";
    var CROCKFORD_BASE32 = "0123456789abcdefghjkmnpqrstvwxyz";
    var ALIAS_PATTERN = /^hello-[0123456789abcdefghjkmnpqrstvwxyz]{10}@bootscooter\.net$/;

    /**
     * Returns a random character index, preferring unbiased Web Crypto output.
     * @param {number} characterCount - Number of available characters.
     * @returns {number} A random index within the character set.
     */
    function randomIndex(characterCount) {
        try {
            if (window.crypto && typeof window.crypto.getRandomValues === "function") {
                var values = new Uint8Array(1);
                var unbiasedLimit = 256 - (256 % characterCount);

                do {
                    window.crypto.getRandomValues(values);
                } while (values[0] >= unbiasedLimit);

                return values[0] % characterCount;
            }
        } catch (error) {
            // Use the compatibility path when Web Crypto cannot provide randomness.
        }

        return Math.floor(Math.random() * characterCount);
    }

    /**
     * Generates an alias containing exactly 10 lowercase Crockford Base32 characters.
     * @returns {string} The generated email address.
     */
    function generateAlias() {
        var randomPart = "";

        while (randomPart.length < ALIAS_LENGTH) {
            randomPart += CROCKFORD_BASE32.charAt(randomIndex(CROCKFORD_BASE32.length));
        }

        return ALIAS_PREFIX + randomPart + ALIAS_DOMAIN;
    }

    /**
     * Determines whether a value exactly matches the supported alias format.
     * @param {*} alias - Stored value to validate.
     * @returns {boolean} Whether the value is a valid alias.
     */
    function isValidAlias(alias) {
        return typeof alias === "string" && ALIAS_PATTERN.test(alias);
    }

    /**
     * Reuses a valid stored alias or creates and persists a replacement.
     * @returns {string} A valid alias, even when storage is unavailable.
     */
    function getAlias() {
        var generatedAlias;

        try {
            var storedAlias = window.localStorage.getItem(ALIAS_STORAGE_KEY);

            if (isValidAlias(storedAlias)) {
                return storedAlias;
            }

            generatedAlias = generateAlias();
            window.localStorage.setItem(ALIAS_STORAGE_KEY, generatedAlias);
            return generatedAlias;
        } catch (error) {
            return generatedAlias || generateAlias();
        }
    }

    /**
     * Replaces matching mail links while retaining their query parameters.
     * @param {HTMLAnchorElement[]} links - Mail links targeting the original address.
     * @param {string} alias - The generated address to use for every link.
     */
    function applyAlias(links, alias) {
        links.forEach(function (link) {
            var href = link.getAttribute("href");
            var queryStart = href.indexOf("?");
            var query = queryStart === -1 ? "" : href.slice(queryStart);

            link.setAttribute("href", "mailto:" + alias + query);

            if (link.textContent.trim().toLowerCase() === ORIGINAL_ADDRESS) {
                link.textContent = alias;
            }
        });
    }

    /**
     * Finds original mail links and applies the browser profile's shared alias.
     */
    function initializeEmailAlias() {
        var links = Array.prototype.filter.call(
            document.querySelectorAll('a[href^="mailto:"]'),
            function (link) {
                var href = link.getAttribute("href");
                var address = href.slice("mailto:".length).split("?")[0];
                return address.toLowerCase() === ORIGINAL_ADDRESS;
            }
        );

        if (links.length === 0) return;

        applyAlias(links, getAlias());
    }

    document.addEventListener("DOMContentLoaded", initializeEmailAlias);
})();
