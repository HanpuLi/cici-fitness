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
