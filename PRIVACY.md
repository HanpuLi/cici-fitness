# Privacy notes

This document describes the data flow visible in the current source code. It is not a general privacy policy for Firebase or other third-party services.

## Data stored by the app

Application state is stored locally in browser storage. When a user signs in, the app namespaces account-specific local state and can synchronise selected application keys to that user's Firestore document at `/users/{uid}`.

Authentication supports email/password and Google sign-in through Firebase Authentication. Password handling is performed by Firebase Authentication; the application source does not implement its own password database.

## Partner sharing

The private user document is not used as the partner-sharing surface. The app builds a separate, deliberately limited `/users/{uid}/shared/profile` document. Firestore rules allow another authenticated user to read that document only when their UID appears in its `allowedReaders` list.

The client builds this shared profile from an explicit whitelist. Adding a new field to that whitelist changes the sharing boundary and should receive security review.

When two accounts are paired, the profile also carries a `train` field (training plan for the next two weeks, check-ins from the last six weeks, a monthly summary of older check-ins, recent weights per exercise, per-exercise effort ratings, streak and achievements). It is built by `coachSharedTraining()` in `coach.js` with the same filter as the AI snapshot: owner-only exercises, private days and private-mode check-ins are excluded. Body measurements, the free-text body-condition field, cycle data and check-in notes are not shared. The document is overwritten as a whole on each push and `train` is omitted while unpaired.

## AI coach

The AI coach is invite-only and talks to a backend on the maintainer's own machine, which forwards requests to the Anthropic API. Each request carries a filtered snapshot built by `buildCoachContext()` in `coach.js` (same exclusions as above). The backend does not store request contents, with one exception: long-term memory. Short notes the user asks the coach to remember are stored per account on that machine and can be listed, deleted one by one or cleared under "Me → 05". Before a note is stored the backend checks it against the same sensitive-term list used by `tools/check-static.mjs` and against the owner-only exercise names, and refuses notes that match.

## Network dependencies

The current app loads Firebase browser SDK files, web fonts and icon assets from third-party CDNs. Auth/database traffic goes to Firebase/Google endpoints. The service worker explicitly excludes authentication and Firestore traffic from caching.

No real user exports, credentials or Firestore database contents should be committed to this repository.
