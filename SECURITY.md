# Security policy

## Reporting

Use GitHub private vulnerability reporting for security-sensitive findings. Do not put account identifiers, exported fitness data, authentication material or screenshots containing private data into a public issue.

Security-relevant areas include:

- Firestore rule changes and any widening of cross-account reads;
- fields added to the partner-facing shared-profile whitelist;
- authentication/session handling;
- cloud/local conflict resolution that could overwrite user data;
- service-worker changes that accidentally cache authentication or database requests;
- import/export paths that expose or corrupt user data.

## Credentials

The Firebase web configuration shipped to the browser is not an administrative secret. Privileged Firebase service-account credentials, private keys and other backend credentials must never be committed.

The current Firestore model is deny-by-default outside the explicitly matched per-user and shared-profile paths. Changes to `firestore.rules` should be reviewed together with the client code that writes those documents.

## Firebase web API key review

Firebase web API keys are project identifiers, not database authorisation credentials, and are expected to be present in a browser application's Firebase config. They still require an API-restriction review. Before resolving an automated secret-scanning alert for a Firebase key, verify in Google Cloud that the key is Firebase-provisioned, is restricted to the Firebase-related APIs the app needs, and does not allow unrelated or billable APIs. Keep Firestore Security Rules as the data-access boundary and enable Firebase App Check where applicable.

The repository's emulator-backed rule tests cover owner-only private documents, explicit partner readers, denied cross-account writes, and default-denied nested subcollections.
