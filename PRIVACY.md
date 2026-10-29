# Privacy notes

This document describes the data flow visible in the current source code. It is not a general privacy policy for Firebase or other third-party services.

## Data stored by the app

Application state is stored locally in browser storage. When a user signs in, the app namespaces account-specific local state and can synchronise selected application keys to that user's Firestore document at `/users/{uid}`.

Authentication supports email/password and Google sign-in through Firebase Authentication. Password handling is performed by Firebase Authentication; the application source does not implement its own password database.

## Partner sharing

The private user document is not used as the partner-sharing surface. The app builds a separate, deliberately limited `/users/{uid}/shared/profile` document. Firestore rules allow another authenticated user to read that document only when their UID appears in its `allowedReaders` list.

The client builds this shared profile from an explicit whitelist. Adding a new field to that whitelist changes the sharing boundary and should receive security review.

When two accounts are paired, the profile also carries a `train` field (training plan for the next two weeks, check-ins from the last six weeks, a monthly summary of older check-ins, recent weights per exercise, per-exercise effort ratings, streak and achievements), a `live` field (today's progress: what is being trained, which set, how many exercises are done, start time) and a `weeks` field (days trained per week over the last 26 weeks, used for the joint weekly streak). `train` is built by `coachSharedTraining()` in `coach.js` with the sharing filter (`_shareGated()`): owner-only exercises, private days and private-mode check-ins are excluded for every account, including the owner's; `live` and `weeks` use the same sharing filter. Body measurements, the free-text body-condition field, cycle data and check-in notes are not shared. The document is overwritten as a whole on each push and `train`, `live` and `weeks` are omitted while unpaired.

Everything below is shared by default. Each category can be switched off under "我 → 03 → 共享给 TA" (stored as `share` in the synced settings; a missing value means on). Switching one off removes these fields from the shared profile on the next push, which happens immediately:

| Category | Fields removed |
|---|---|
| Training plan (训练计划) | `train.plan`, `train.shifts` |
| Check-ins (打卡记录) | `train.logs`, `train.history`, `train.stats` |
| Weights (重量) | `train.weights`, and the weight figure inside each `train.logs[].ex` line |
| Effort (感受) | `train.logs[].rpe`, `train.logs[].feel`, `train.history[].avgRpe`, and the RPE figure inside each `train.weights` line |
| Live progress (实时进度) | `live`, `train.today` |
| Weekly streak (连续周数) | `weeks` |
| Let the partner's AI coach use my data | nothing is removed; the profile carries `aiOk: false` |

The display name, today's workout type and whether it is done (`name`, `todayType`, `todayDone`), training days per week and pool access (`days`, `hasPool`), and reactions (`reacts`, `cheer`) are what pairing itself runs on and cannot be switched off. When any category is off, the profile lists it in `off`, so the partner's app can say "not shared" rather than treat the data as missing.

`aiOk: false` is honoured by the partner's client: it leaves the partner block out of its AI snapshot and does not send the partner's plan to AI plan generation. The flag hides nothing by itself: the categories that are still on remain readable to the partner, and a client older than this flag would ignore it. Switching categories off is what withholds data.

## AI coach

The AI coach is invite-only. It talks to a backend on the maintainer's own machine, which forwards requests to the Anthropic API under the maintainer's own Anthropic API account and budget. Anthropic therefore receives the request contents listed below and handles them under its API terms; nothing is sent to any other AI provider.

What a request can contain:

- A filtered snapshot built by `buildCoachContext()` in `coach.js`: training plan, check-in history (older months summarised), suggested and recent weights, per-exercise effort ratings and notes, streak and achievements, and, when the user has set them, profile settings, body measurements and cycle day. For non-owner accounts, owner-only exercises, private days and private-mode check-ins are removed before sending. For the owner account, the owner's own private content is sent to the AI as ordinary training data: owner-only exercises (in the snapshot, live progress and exercise catalogue), the real content of private days, and private-mode check-ins together with their custom metrics (`subMetrics`).
- Today's live progress (current exercise, set, elapsed time) for the in-workout coach, unless the request passes `live: false`.
- The paired partner's shared `train` data (see Partner sharing), unless the request passes `partner: false` or the partner's profile carries `aiOk: false`.
- The user's own chat messages and, for the equipment photo feature or a photo in chat, the photo, downscaled on the device to at most 1280 px on the long side.
- A list of gated exercise names, used by the backend to refuse storing them in long-term memory. The list is empty for the owner account.

Text the user types is sent as typed. The exclusions above apply to the generated snapshot, not to words the user writes into the chat box.

What is kept, and where:

- Chat history stays in the browser's local storage on that device (`fit_coach1`); it is not synchronised to Firestore and not stored by the backend.
- The backend does not store request contents or photos. For budget control it keeps a usage ledger and a request log with metadata only (time, feature, account display name, model, token counts, cost).
- Long-term memory is the one exception: short notes the user asks the coach to remember are stored per account on that machine and can be listed, deleted one by one or cleared under "Me → 05". Before a note is stored the backend checks it against the same sensitive-term list used by `tools/check-static.mjs` and against the owner-only exercise names, and refuses notes that match. The owner account is exempt from this check (the backend identifies it by its pinned e-mail address and UID, not by anything the client sends), because memory is kept only on that machine and never in a public repository.
- Access: the backend verifies the Firebase ID token with Google, checks the account's e-mail address against an invite list on that machine, and pins the account UID on first use.

## Push reminders ("教练主动找你")

Off by default; turned on under "Me → 04". It needs a signed-in, invited account and, on iPhone, the app added to the home screen. While it is on, each device's Web Push subscription (endpoint and keys from the browser's push service) is stored on the same backend, and the client uploads, throttled, a snapshot built by `buildCoachContext({ live: false, partner: false, share: true })` with body measurements and cycle data removed, plus a few facts computed by `wpFacts()` in `push.js` (today's and tomorrow's plan type and up to four exercise names, whether today has started or been checked in and at what time, the last check-in date, exercises whose suggested weight went up). Both use the sharing filter, not the owner's AI filter: owner-only exercises, private days and private-mode check-ins never appear, for the owner account as well. The backend keeps only the latest snapshot per account, the training start times it has seen and a 45-day list of reminders it sent; turning the switch off deletes the snapshot and the subscriptions.

A scheduled job reads these to decide whether to send one short reminder (today's training not started yet, several days without training, a weight increase due tomorrow, or the paired partner just finished). The reminder sentence is written by the AI from those facts only, never from body data, cycle data or notes, because it appears on the lock screen. Partner reminders use only the partner's workout type and duration and are sent only when both accounts are paired with each other and both have turned reminders on.

## Network dependencies

The current app loads Firebase browser SDK files, web fonts and icon assets from third-party CDNs. Auth/database traffic goes to Firebase/Google endpoints. The service worker explicitly excludes authentication and Firestore traffic from caching.

No real user exports, credentials or Firestore database contents should be committed to this repository.
