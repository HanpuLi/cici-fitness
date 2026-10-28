# Privacy notes

This document describes the data flow visible in the current source code. It is not a general privacy policy for Firebase or other third-party services.

## Data stored by the app

Application state is stored locally in browser storage. When a user signs in, the app namespaces account-specific local state and can synchronise selected application keys to that user's Firestore document at `/users/{uid}`.

Authentication supports email/password and Google sign-in through Firebase Authentication. Password handling is performed by Firebase Authentication; the application source does not implement its own password database.

## Partner sharing

The private user document is not used as the partner-sharing surface. The app builds a separate, deliberately limited `/users/{uid}/shared/profile` document. Firestore rules allow another authenticated user to read that document only when their UID appears in its `allowedReaders` list.

The client builds this shared profile from an explicit whitelist. Adding a new field to that whitelist changes the sharing boundary and should receive security review.

## Network dependencies

The current app loads Firebase browser SDK files, web fonts and icon assets from third-party CDNs. Auth/database traffic goes to Firebase/Google endpoints. The service worker explicitly excludes authentication and Firestore traffic from caching.

No real user exports, credentials or Firestore database contents should be committed to this repository.
