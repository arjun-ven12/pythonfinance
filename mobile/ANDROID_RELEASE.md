# GitHub Actions → signed Android APK

The workflow is `.github/workflows/android-release.yml`. It builds on Ubuntu 24.04
with Node 22.23.4, Java 17, Android platform/build-tools 37, NDK 27.1.12297006 and
CMake 3.22.1, using Expo 58’s generated Gradle 9.4.1 wrapper with its official
SHA-256 distribution checksum. Actions are pinned to immutable commits.

No EAS login/cloud build is required by this pipeline. `mobile/android/` is generated
from committed Expo configuration and the npm lockfile on each run, not checked in.
`com.quantstrade.mobile` remains the application ID. The release is ARM64 + x86_64.

## One-time operator setup

1. Confirm this public repository may distribute the app and expose its API origin.
   A URL hidden in GitHub Secrets is still discoverable inside an APK. Use a public
   HTTPS gateway that enforces server authentication/page/role permissions. Never
   use an internal/private endpoint. No broker keys, access tokens or passwords
   belong in `EXPO_PUBLIC_*`. Deploy the mobile backend changes and migration from
   the app implementation separately; this workflow never deploys the backend.
2. Create GitHub Environment **android-release**, restrict it to trusted maintainers,
   and require reviewers for public releases. Allow version tags `mobile-v*` and your
   chosen manual-test branch. Enable GitHub Actions. Untrusted PRs must not receive
   signing secrets. Publishing needs `contents: write` only in the publish job.
3. Reuse the existing Android app signing key if one has already signed a distributed
   installation. Otherwise create one ONCE on a secure operator machine:

```bash
umask 077
mkdir -p /secure/quant-android
keytool -genkeypair -v -storetype JKS \
  -keystore /secure/quant-android/release.jks \
  -alias quants-trade-release -keyalg RSA -keysize 3072 -validity 10000
```

Enter identity and strong passwords interactively. Keep encrypted offline backups
of the exact keystore, alias and both passwords. Keep the same key for all future
updates. Do not generate a fresh key in CI, rotate it casually, or use `debug.keystore`.
Loss of a sideload signing key prevents updates to installed copies with that identity.

4. Populate these **environment secrets** in Settings → Environments → android-release:

| Secret | Exact content |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 of the persistent binary JKS (single line, no surrounding quotes) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | `quants-trade-release`, or your existing key alias |
| `ANDROID_KEY_PASSWORD` | Password for that private key |
| `ANDROID_SIGNING_CERT_SHA256` | SHA-256 certificate fingerprint from `keytool -list -v`; 64 hex characters, colons allowed |
| `ANDROID_PRODUCTION_API_URL` | Operator-approved public backend HTTPS origin; no path/query/credentials/custom port |
| `ANDROID_GOOGLE_SERVICES_JSON_BASE64` | Optional base64 Firebase Android client configuration for push; not a server service-account private key |

Example secure CLI upload (password commands prompt without putting values in shell history):

```bash
# Run from this repository; authenticate gh first.
base64 -w0 /secure/quant-android/release.jks | gh secret set ANDROID_KEYSTORE_BASE64 --env android-release
gh secret set ANDROID_KEYSTORE_PASSWORD --env android-release
gh secret set ANDROID_KEY_ALIAS --env android-release
gh secret set ANDROID_KEY_PASSWORD --env android-release
keytool -list -v -keystore /secure/quant-android/release.jks -alias quants-trade-release
# Copy only the certificate SHA256 value into the next interactive secret prompt.
gh secret set ANDROID_SIGNING_CERT_SHA256 --env android-release
gh secret set ANDROID_PRODUCTION_API_URL --env android-release
```

On macOS, replace `base64 -w0 FILE` with `base64 < FILE | tr -d '\n'`.
Never print the base64 keystore to a build log, paste it into a source file, or
upload the private signing directory as a GitHub artifact.

5. Set environment variable **`ANDROID_PUBLIC_BACKEND_APPROVED=true`** only after
   reviewing the public endpoint and unauthenticated-access restrictions. Optionally
   set **`EXPO_PUBLIC_EAS_PROJECT_ID`** to your actual Expo project UUID if using Expo
   push. FCM v1 service-account credentials stay on Expo/backend secret infrastructure,
   not in the client. Without push configuration, the app still builds and push is
   explicitly unavailable until configured.

The workflow preflight resolves DNS (rejecting private/reserved addresses), checks
`GET /healthz` for available database and `liveDispatchGate:false`, and requires
unauthenticated `/api/auth/me` and `/api/paper-portfolio` to return 401/403. It never
logs in, submits an order, changes environment variables remotely or enables live
execution. These checks establish only observed endpoint behavior at build time;
a server remains responsible for ongoing security. Health at build time is not a
claim that live trading stays disabled indefinitely after distribution.

## Manual testing — no GitHub Release

After the workflow exists on the default branch:

```bash
# Checks + native generation only; works before signing/backend secrets exist.
gh workflow run android-release.yml --ref YOUR_BRANCH -f validation_only=true
# Full signed release APK build, workflow artifact only, NO public Release creation.
gh workflow run android-release.yml --ref YOUR_BRANCH -f validation_only=false
gh run list --workflow android-release.yml
gh run watch RUN_ID --exit-status
gh run download RUN_ID --name android-release-1.0.0
sha256sum --check quants-trade-1.0.0.apk.sha256
```

Artifacts in a public repository may be downloadable by other signed-in GitHub
users: manual runs are not a private distribution mechanism. The same approved
public-backend and signing requirements apply to full manual builds.

## Publish a version

Update `mobile/package.json` AND its lockfile version before a release. Expo config
reads this version. Tags must match exactly and use canonical `major.minor.patch`.
Android versionCode is `major*1000000 + minor*1000 + patch` (minor/patch under 1000).
Initial 1.0.0 yields 1000000, greater than the previous unbuilt source’s versionCode 1.
Always increase the version; never overwrite an existing published tag or assets.
EAS remote version auto-increment does not control these GitHub builds.

```bash
cd mobile
npm version 1.0.0 --no-git-tag-version --allow-same-version
cd ..
git add mobile/package.json mobile/package-lock.json
# Commit any actual version changes before tagging.
git tag -a mobile-v1.0.0 -m "Quant's Trade Android 1.0.0"
git push origin mobile-v1.0.0
```

Checks must pass before compilation: TypeScript, ESLint, Jest, Expo dependency
compatibility and native project validation. The build runs `assembleRelease` and
`lintRelease`. Generated release debug signing is removed; zipalign and apksigner
apply the supplied persistent key AFTER assembly. The resulting APK is checked for
package/version, non-debuggable manifest, certificate fingerprint, archive integrity,
embedded Hermes bundle, both native ABIs and 16KB alignment. SHA-256 is verified
again after artifact transfer before publication.

A successful version-tag run creates a GitHub Release with the signed APK and
`.apk.sha256` assets, using `mobile/RELEASE_NOTES.md` populated with the version,
Android code and commit. Existing releases are never overwritten. Manual dispatch
never runs the publish job, even when dispatched against a tag.

## Verification and limits

Install the successfully built signed APK on a supported physical device and verify
login/refresh/revocation, back navigation, keyboard/biometrics, reconnect, paper
controls, unconfirmed emergency-stop behavior and optional push display. APK
signature/manifest validation is not device instrumentation or actual broker acceptance.
The release notes disclose server/provider dependencies and trading limitations.

No APK or Release is claimed until the CI assembly, signature checks and asset
upload actually succeed. Missing secrets intentionally stop a full build. If Android
SDK/Gradle/native compilation fails, repair that failure and rerun; never bypass
lint, replace a release with a debug APK, or remove the certificate comparison.

References: [Android signing](https://developer.android.com/studio/publish/app-signing),
[apksigner](https://developer.android.com/tools/apksigner),
[Expo native generation](https://docs.expo.dev/workflow/continuous-native-generation/).
