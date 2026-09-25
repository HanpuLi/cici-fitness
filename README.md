# Cici Fitness

A static, installable fitness-planning PWA. It runs directly in the browser, works offline after the first successful load, keeps local snapshots for recovery, and can optionally sync an authenticated user's data through Firebase.

Live app: https://hanpuli.github.io/cici-fitness/

## Architecture

- **Static client:** `index.html`, `training-model.js`, `core.js`, `app.js`, `style.css` and local assets. `training-model.js` is a small pure-logic layer for session budgeting, duration estimation and exercise-count constraints; it is loaded as a classic script before `core.js`.
- **Offline support:** `sw.js` pre-caches the application shell, including `training-model.js`, and uses best-effort CDN caching / stale-while-revalidate for web fonts and icon assets.
- **Local persistence:** application state and recovery snapshots use browser storage, namespaced to the signed-in user where appropriate.
- **Optional cloud sync:** Firebase Authentication + Firestore.
- **Access boundary:** `firestore.rules` keeps `/users/{uid}` owner-only. The partner-facing `shared/profile` subdocument is separately gated by an explicit `allowedReaders` list and is populated from a whitelist in the client.

The Firebase web configuration in `core.js` is client configuration, not an administrative credential. Security depends on Firebase Authentication and the deployed Firestore rules; service-account keys and other privileged credentials do not belong in this repository.

## Development

No build system is required.

```sh
python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

Run the same static checks as CI:

```sh
node --check training-model.js
node --check core.js
node --check app.js
node --check dev.js
node --check sw.js
node tools/check-static.mjs
node --test tests/training-model.test.mjs
```

Firestore rules have emulator-backed access-control tests:

```sh
npm ci
npm run test:rules
```

The training-model tests use Node's built-in test runner and do not need Firebase. The Firestore rules test remains emulator-backed and requires a Java runtime because the Firebase Firestore emulator is a JVM process. `tests/firestore-rules.test.mjs` is the access-control regression suite and should not be weakened or replaced by client-side checks.

The repository intentionally does not track local operator notes, Finder metadata, scratch work or unrelated personal pages.

## Privacy and security

Fitness/planning data can be sensitive. See [PRIVACY.md](PRIVACY.md) for the current client-side data flow and [SECURITY.md](SECURITY.md) for reporting security issues.

This repository currently has no open-source licence grant. Public source availability should not be interpreted as permission to redistribute or relicense the application.
