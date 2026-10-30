# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

This is a legal marketplace for legal counsel to view case submissions.
## Marketplace case notifications

This repo defines `enqueueMarketplaceCaseNotification` in `functions/index.js`.
The browser calls it in `us-central1` using the Firebase project in
`src/firebase.js`: `peak-bit-486121-n6`, also the default in `.firebaserc`.
The submitting app must use that same project and a signed-in Firebase user.
The callable accepts `{ caseId, title, description, stateCode, source }`, where
`caseId` is a UUID, and writes `marketplace_case_notification_events/{caseId}`.

Notification settings save `IMMEDIATE`, `DAILY`, or `WEEKLY` to Data Connect and
mirror lowercase cadence/preferences to `lawyer_user_profiles` in Firestore,
which the delivery worker reads. Immediate delivery currently sends email only;
daily and weekly delivery support email and SMS. Email sends through Gmail using Nodemailer and needs `GMAIL_APP_PASSWORD`
in the function environment. The default sender is `ethan@truelegalinnovations.com`
(`GMAIL_USER` can override it). SMS needs
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_PHONE`.
A successful enqueue response does not guarantee delivery: check its
`immediate.deliveryCount` and `marketplace_notification_deliveries` for status.

After authenticating with `firebase login --reauth`, deploy the Data Connect
schema before publishing the updated client:

```sh
firebase dataconnect:sdk:generate --project peak-bit-486121-n6
firebase deploy --only dataconnect --project peak-bit-486121-n6
firebase deploy --only functions:marketplace-admin:enqueueMarketplaceCaseNotification --project peak-bit-486121-n6
npm run build
firebase deploy --only hosting --project peak-bit-486121-n6
```

Verify with a signed-in caller and a lawyer profile opted into immediate email
alerts. Call the function with a new case UUID, confirm `immediate.deliveryCount`
is positive, and check the delivery record and recipient inbox.
Run preference regression tests with
`node --test test/unit/notificationPreferences.test.mjs`.


## Marketplace profile provisioning

After verifying Firebase Auth claims, sign-in runs `EnsureMarketplaceProfiles`
before loading notification preferences. This transaction creates the SQL
`UserProfile` parent and `LawyerUserProfile` together, repairs existing accounts,
and preserves existing preferences and creation dates. An existing Firestore
notification profile seeds preferences when SQL is missing; an existing SQL
profile seeds a missing Firestore worker profile. New profiles default to alerts
off and daily cadence, so signing in does not opt anyone into messages.

Firebase Auth custom claims control access. `UserProfile.role` remains a legacy
reporting/compatibility mirror because the schema is shared with the intake app;
it is computed on the server from the caller's claims, not a client role input.
SQL role values do not grant access. Admin and owner claims can provision lawyer
profiles too. Missing records for existing accounts are created on their next
sign-in after deploying Data Connect and the client. Provisioning failures show
a retry action instead of silently leaving profiles missing.

Run `npm run test:profiles` and `npm run test:integration:profiles` to verify
preference migration, idempotent provisioning, and role authorization locally.
The integration command uses the Data Connect emulator and requires dependencies
in `functions/` as well as the root package.

## Create an intake and test email notifications

Run the local integration test (requires root and `functions/` dependencies):

```sh
npm run test:integration:intake
```

This starts isolated Auth, Firestore and Data Connect emulators, creates a
synthetic lawyer account and a complete intake (case, incident, damages, contact,
and adverse party), and checks that lawyers can see it. It runs the real
notification function handler against a local SMTP capture server and verifies the
email recipient/content, delivery record, and duplicate suppression across
compact and hyphenated UUIDs. Local mode sends no real email and does not test
the hosted callable transport or inbox delivery. Fixture records stay in the local
emulators; the test never writes them to production.

For a real email, first deploy the updated Data Connect operations, notification
function, and client using the deployment steps above. The function must have
`GMAIL_APP_PASSWORD` configured for the sending Gmail account. Sign in to the
marketplace once so your profiles are created. In Settings, enable **Email
alerts**, select **Immediate**, and save.

Copy `.env.test.example` to `.env.test.local`, then enter your existing marketplace
email and password there. Do not commit that local file. Run:

```sh
npm run test:intake:email
```

Live mode signs in through Firebase Auth, creates a clearly labeled synthetic
intake in the shared SQL database, verifies its marketplace visibility, and calls
`enqueueMarketplaceCaseNotification` in `us-central1`. It fails if no immediate
email is reported sent; it does not change your notification preferences. The
function notifies **all opted-in Immediate profiles**, not just the test account.
It prints your delivery-record path and leaves the test case for inspection;
delete the synthetic case through Admin when finished. Each run creates a fresh
case. If a run fails after creating a case, its ID is printed for inspection.

An SMTP acceptance response does not prove inbox delivery. Check your inbox
and spam folder, your `marketplace_notification_deliveries` record, and the sending Gmail account if necessary. Notification counts returned by the callable are aggregate
across recipients; a positive count alone does not prove delivery to your account.

The test follows the structured intake database/notification path used by
`tli-web-v1`. It does not drive its browser form, voice conversation, or uploads.


### Configure Gmail sending

Email functions use Nodemailer over TLS to `smtp.gmail.com:465`, sending from
`ethan@truelegalinnovations.com`. An optional `GMAIL_USER` function environment
variable can change the sender. `GMAIL_APP_PASSWORD` is bound from Firebase
Secret Manager for the immediate, daily and weekly functions.

While signed in to the sending Google account, turn on 2-Step Verification and
create an app password at <https://myaccount.google.com/apppasswords>. Google
Workspace policies may hide or prohibit app passwords; if unavailable, use
administrator-approved OAuth2 instead. The app password is separate from both
the normal Google password and `MARKETPLACE_TEST_PASSWORD`.

Store the app password through the masked CLI prompt, then deploy the bindings:

```sh
firebase functions:secrets:set GMAIL_APP_PASSWORD --project peak-bit-486121-n6
firebase deploy --only functions:marketplace-admin:enqueueMarketplaceCaseNotification,functions:marketplace-admin:processDailyMarketplaceNotifications,functions:marketplace-admin:processWeeklyMarketplaceNotifications --project peak-bit-486121-n6
```

Do not put the Gmail app password in browser variables or commit it. No SendGrid
account or keys are required. Gmail's sending limits and account policies still
apply. Setting a secret alone does not update a running function; deploy after
setting it. `missing_provider` and other unsuccessful delivery records can be
retried; only `sent` records suppress another send.

References: [Google app passwords](https://support.google.com/accounts/answer/185833),
[Nodemailer Gmail](https://nodemailer.com/guides/using-gmail).

## GitHub Actions CI/CD

See [CI/CD setup](docs/ci-cd.md) for the required repository variables and one-time
Google Cloud OIDC setup. Pull requests run lint/tests/build; successful pushes to
`main` deploy the tested client to Hosting. Functions and the shared Data Connect
connector can be deployed through explicit workflow options.
