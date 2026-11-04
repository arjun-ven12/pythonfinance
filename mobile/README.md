# Quant’s Trade for Android

Dedicated Expo/React Native TypeScript application. Trading, scanning, AI inference,
portfolio accounting, scheduler, risk decisions and OpenD remain on the existing
backend. Closing the phone app does not stop server automation.

## Run

Use Node 22.13+ (validated locally with Node 22.23.4).

```bash
cd mobile
npm ci
cp .env.example .env.local
# Set EXPO_PUBLIC_API_URL to your actual HTTPS backend origin.
npm start
```

Install a development build for device notifications/biometrics. For Android
emulator development only, set `EXPO_PUBLIC_ALLOW_LOCAL_HTTP=true` and
`EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`. Release builds reject HTTP. No backend
URL is bundled by default; missing configuration disables login with an explicit
message. Never put broker passwords, database credentials or AI keys in Expo env.

## Backend rollout

1. Back up the production database. Deploy the accompanying backend changes and
   apply migrations with `cd node-backend && npx prisma migrate deploy`.
   Migration `20261104000100_android_devices` adds device registrations and push
   delivery records. Preserve existing users, refresh tokens and encryption keys.
2. Keep `LIVE_TRADING_ENABLED=false`. Existing web cookie authentication remains
   supported. Native login/rotation reuse existing auth services; revocable native
   bearer tokens use the `quant-android` audience and existing refresh-session rows.
3. Verify HTTPS health, the actual native login, refresh/revocation, scoped API
   access and `/ws/market-data` from the phone. Authorization is a header, never a
   URL query parameter. CORS retains its configured web origins; native bearer
   requests are validated before exemption from cookie-specific CSRF.
4. Push is opt-in: set `EXPO_PUSH_ENABLED=true` only after configuring EAS/FCM and
   testing delivery. Set optional `EXPO_ACCESS_TOKEN` through the backend secret
   manager when Expo enhanced push security is enabled. Devices register from
   Settings after OS permission. The existing server alert worker drains the
   durable outbox and checks receipts. Provider acceptance does not prove device
   display. Uncertain sends remain UNKNOWN rather than being blindly repeated.

## GitHub Release APK

Use the [repeatable signed GitHub Actions release pipeline](ANDROID_RELEASE.md).
It builds with the Android SDK/Gradle on GitHub and does not require EAS cloud
access. Signing secrets and the approved public API origin must be configured
before the first full build. Manual validation-only dispatch runs without them.

## Android APK / Play AAB

EAS account access, a real deployment URL, an EAS project and signing credentials
must be supplied by the operator. No APK/AAB has been built in this workspace. `eas whoami` returned `Not logged in`; no Android SDK/emulator is installed here.
The Android Hermes export and native project generation are separate checks;
neither is an installable APK.

```bash
cd mobile
npx eas-cli login
npx eas-cli init
# Retain the returned project UUID in EXPO_PUBLIC_EAS_PROJECT_ID.
# Create these public string variables in BOTH preview and production EAS environments:
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://YOUR_BACKEND --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_EAS_PROJECT_ID --value YOUR_PROJECT_UUID --visibility plaintext
# Repeat env:create with --environment production.
npx eas-cli build --platform android --profile preview
# Download the successfully built .apk from the returned build URL; install it on Android.
npx eas-cli build --platform android --profile production
```

Use EAS credentials setup for Android signing and FCM v1. Configure the Firebase
Android app as `com.quantstrade.mobile`; provision `google-services.json` through
an EAS file variable named `GOOGLE_SERVICES_JSON`. Never commit that file, signing
keys or service-account credentials. Project app config includes `googleServicesFile`
only when that secure file path is present. The preview profile builds an APK;
production builds an AAB. EAS build quota/cost and Play publication are external.
See [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
and [EAS Android builds](https://docs.expo.dev/build/introduction/).

## Checks

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
EXPO_PUBLIC_API_URL=https://YOUR_BACKEND npm run export
```

The app includes component, transport and reconnect tests. Backend mobile tests
require disposable PostgreSQL, never production:

```bash
cd node-backend
INTEGRATION_DATABASE_URL=postgresql://USER@HOST/TEST_DB npm test
```

## Operating boundaries

- Five tabs plus Automation, symbol detail, strategy details/draft/results, paper
  policy setup, Research, AI memory, Alerts and Settings.
- API errors and degraded data are visible. Missing financial values remain `—`.
  Cached data is memory-only and marked offline/stale; it is cleared on logout.
  Offline cold start shows unavailable data until the backend is reachable.
- Quote streaming operates only while foreground/focused. Sequence gaps trigger
  HTTPS reconciliation; reconnect uses backoff. Portfolio/orders/execution use
  deduplicated foreground queries because the existing socket exposes quotes/history,
  not a portfolio event feed. These are monitored snapshots, not tick guarantees.
- AI runs only on explicit request. Reports/evidence use server responses. Missing
  provider credentials surface as errors; no generated fixture response is substituted.
- Paper policy setup supports US/USD, long securities and owned strategy versions.
  Resume, configure and strategy activation revalidate against server policies.
  Complex visual rule editing and matrix scenario construction remain web workflows;
  complete server results can be inspected on mobile.
- Android exposes no live activation or real-order submission action. Operator stop
  requires a persisted SUSPENDED generation acknowledgement; failure stays unknown.
  Live modes still require actual account acceptance and explicit signed authorization.
- Biometrics protect app display on background/return; server session permissions
  remain authoritative. Explicit offline local logout does not claim remote revocation.
- Real deployment access, actual AI/provider acceptance, physical-device biometrics,
  push receipt/display and Android installation are still external acceptance tasks.

[Feature inventory](FEATURE_INVENTORY.md) · [Validation evidence](../docs/validation/android-implementation.json)


## Release acceptance still required

- Configure the deployed HTTPS API and apply the mobile migration in that environment.
- Build the signed APK with the operator’s EAS project/account, install on a physical
  Android phone, and verify secure login, rotation/revocation, OS biometrics, Android
  back navigation, keyboard, accessibility and foreground/background transitions.
- Exercise quote reconnect and authoritative paper controls on the deployed backend;
  disconnect during emergency stop and confirm the UI retains UNKNOWN until ack.
- Verify Android notification permission, FCM credentials, Expo ticket/receipt and
  actual displayed generic notification with authenticated deep-link navigation.
- Verify configured AI sources return actual research evidence. No live provider or
  broker acceptance is inferred from local test fixtures.
- Keep server live activation disabled throughout mobile acceptance. Any later live
  account acceptance follows `docs/live-trading-operations.md` and separate authorization.
