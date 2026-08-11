/**
 * Cross-engine browser acceptance configuration for the built Jekyll site.
 */
"use strict";

const {defineConfig, devices} = require("@playwright/test");

const port = process.env.PLAYWRIGHT_PORT || "4000";
const baseurl = process.env.TEST_BASEURL || "";

module.exports = defineConfig({
    testDir: "./tests/e2e",
    timeout: 45000,
    expect: {timeout: 5000},
    fullyParallel: false,
    workers: 1,
    reporter: "line",
    use: {
        baseURL: "http://127.0.0.1:" + port + baseurl + "/",
        trace: "retain-on-failure"
    },
    webServer: {
        command: "node tests/support/serve-jekyll.js",
        url: "http://127.0.0.1:" + port + baseurl + "/",
        reuseExistingServer: false,
        timeout: 120000
    },
    projects: [
        {
            name: "chromium-desktop",
            use: {...devices["Desktop Chrome"]}
        },
        {
            name: "firefox-desktop",
            use: {...devices["Desktop Firefox"]}
        },
        {
            name: "webkit-desktop",
            use: {...devices["Desktop Safari"]}
        },
        {
            name: "webkit-mobile-360",
            use: {
                ...devices["iPhone 13"],
                viewport: {width: 360, height: 800}
            }
        }
    ]
});
