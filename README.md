# Cici Fitness

A static, installable fitness-planning PWA. It runs directly in the browser, works offline after the first successful load, keeps local snapshots for recovery, and can optionally sync an authenticated user's data through Firebase.

Live app: https://hanpuli.github.io/cici-fitness/

## Architecture

- **Static client:** `index.html`, `core.js`, `app.js`, `style.css` and local assets.
- **Offline support:** `sw.js` pre-caches the application shell and runtime data.
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
node --check core.js
node --check app.js
node --check dev.js
node --check sw.js
node tools/check-static.mjs
```

Firestore rules have emulator-backed access-control tests:

```sh
npm ci
npm run test:rules
```

The rules test requires a Java runtime because the Firebase Firestore emulator is a JVM process.

The repository intentionally does not track local operator notes, Finder metadata, scratch work or unrelated personal pages.

## Privacy and security

Fitness/planning data can be sensitive. See [PRIVACY.md](PRIVACY.md) for the current client-side data flow and [SECURITY.md](SECURITY.md) for reporting security issues.

This repository currently has no open-source licence grant. Public source availability should not be interpreted as permission to redistribute or relicense the application.
