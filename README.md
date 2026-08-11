# Personal Website

This repository contains the source for the Jekyll/GitHub Pages website at
[shugg.dev](https://shugg.dev).

## Games and Sudoku

`/games` is the game catalog. `/games/sudoku` is a client-only Classic v1
Sudoku application with uniquely solvable, rotationally symmetric, 32–36 clue
puzzles. These properties are objective generation constraints, not a human
difficulty rating.

Daily identities use the UTC calendar day and canonical
`?v=1&day=YYYY-MM-DD` URL. An open daily puzzle stays on its loaded date after
midnight and becomes an archive; **Daily** selects the current UTC date. Custom
seeds use canonical `?v=1&seed=BASE64URL` URLs. The
`shugg-sudoku-v1` algorithm and `classic-v1` tier identifiers keep a given
canonical identity stable; a future algorithm must use a new version.

Select a cell by mouse or touch, then use the on-screen keypad or number keys.
Arrow keys move without wrapping; Home and End move to row edges;
Ctrl/Command+Home and End move to the first or last cell. `N` toggles Notes,
`U` undoes, and `0`, Backspace, or Delete erases. Notes can also be toggled
with the **Notes** button. **Check** marks entered mistakes, immutable clues
remain focusable, and duplicate or incorrect cells have text and shape cues in
addition to color. The named grid, roving focus, live status/error messages,
44-pixel keypad targets, reduced-motion handling, and completion focus support
keyboard, touch, zoom, and assistive-technology use.

Progress is local to the browser profile. At most 30 records and 64 KiB are
retained, so older progress may be evicted. **Reset**, after confirmation,
removes only the current puzzle's record and restores that puzzle.
**Clear all saved Sudoku progress**, also after confirmation, first bounds the
enumerated Sudoku namespace to 128 keys by removing excess non-current keys in
reverse lexical order, without validating those excess values. It then removes
every retained key whose value is a valid, key-matching Sudoku progress record,
including the current key when that record is valid, and resets the active
puzzle in memory. Invalid, oversized, or key-mismatched retained entries remain;
failed excess-key removals and entries that storage errors prevent it from
processing may also remain. Browser site-data controls are the fallback for
those entries or blocked storage. Undo history is session-only. Tabs
authoritatively reread the current stored record and use last-save-wins
semantics, so simultaneous edits may be lost.

Seeds are public, reversible, and included in shareable URLs and browser
history. Do not use personal or secret information; prefer the random opaque
seed action. Progress and its last-updated time may be visible to other users
of the browser profile.

Sudoku sends no telemetry and makes no remote runtime requests. The
games/Sudoku production runtime has no JavaScript package dependency: scripts,
worker code, CSS, fonts, and the reviewed Font Awesome 5.15.4 icons are local,
same-origin assets.

### Developer Architecture

Jekyll supplies the semantic page shell. `sudoku-engine.js` deterministically
generates and solves puzzles, while `sudoku-protocol.js` owns canonical
identity, state reduction, and strict worker/persistence validation. A fresh
classic `sudoku-worker.js` performs generation away from the main thread under
fixed node and 12-attempt limits; elapsed time and device speed never select a
puzzle. `sudoku.js` is the thin DOM, focus, history, clock, Worker, and guarded
`localStorage` controller. Stale or malformed worker messages are rejected,
and there is no synchronous generation fallback.

## Install, Build, and Test

From a clean checkout, install exact lockfile dependencies and Playwright's
three browser engines:

```sh
bundle config set --local path vendor/bundle
bundle install
npm ci
npx playwright install --with-deps chromium firefox webkit
```

Run the exact acceptance commands:

```sh
npm run test:unit
npm run test:worker
npm run test:e2e
npm test

npm audit --audit-level=high
bundle exec bundler-audit check --update
bundle exec jekyll build
```

The tracked wrappers hard-limit unit and real-worker integration suites to 60
seconds each, each Playwright project to 180 seconds, and the sequential
four-project browser job to 480 seconds. Each Playwright test is limited to 45
seconds. `npm test` runs unit, worker, and browser suites in that order. Audit
and Jekyll commands are intentionally shown separately so their exit codes can
be retained as release evidence.

For bounded nonempty-`baseurl` browser validation:

```sh
bundle exec jekyll build --baseurl /preview --destination _site-baseurl
TEST_BASEURL=/preview PLAYWRIGHT_PORT=4001 \
  E2E_EXTRA_ARGS='--grep @baseurl' \
  npm run test:e2e:baseurl
```

## Security and Dependencies

The games/Sudoku runtime has no remote runtime dependency, and its scripts,
worker code, CSS, fonts, icons, and data are same-origin assets. Sudoku uses an
early restrictive meta CSP and `no-referrer` policy. A meta CSP is defense in
depth: GitHub Pages does not provide repository-selected response headers, so
this project does not claim `frame-ancestors`, HSTS,
`X-Content-Type-Options`, or `Permissions-Policy`.

Lockfile changes require human review. Critical or high advisories block a
release unless an owner-named, time-bounded exception is approved.

The repository administrator runs the following from a clean checkout on the
first UTC business day of every month and before every release:

```sh
bundle config set --local path vendor/bundle
bundle install
npm ci
npm audit --audit-level=high
bundle exec bundler-audit check --update
```

Copy `tests/evidence/dependency-audit-template.md` to the dated monthly or
release evidence path and retain complete output and exit codes. The same
administrator verifies Dependabot alerts with:

```sh
gh api -i repos/cwshugg/cwshugg.github.io/vulnerability-alerts
```

Only HTTP 204 passes, and repository Settings must show Dependabot alerts
enabled.

## Manual Release Evidence

The implementation, unit tests, worker tests, build, and security audits pass
in the implementation environment. Release remains blocked on evidence that
was not available there:

* Run the tracked Playwright matrix on a properly provisioned host with
  Chromium, Firefox, desktop WebKit, and 360-pixel mobile WebKit dependencies.
  Test discovery alone is not browser execution.
* Collect exactly five passing runs on the designated physical Samsung Galaxy
  A13 4G. An emulator, device farm, or desktop throttle is not a substitute.
* Complete current mobile Safari/WebKit evidence on a physical iPhone.
* Complete the manual assistive-technology matrix, including NVDA with Firefox
  and VoiceOver with Safari.

Copy `tests/evidence/sudoku-manual-template.md` rather than editing it, complete
every row, and retain linked issues or owner-named, time-bounded exceptions.
See `tests/evidence/README.md` for collection and validation commands. Do not
claim a release pass until every external gate has evidence.
