# Quant’s Trade for Android — {{VERSION}}

A focused mobile workspace for portfolio intelligence, market research and disciplined server-side automation.

## Included

- Five primary workspaces: Home, Markets, AI, Strategies and Portfolio.
- Dark-first interface with financial charts, watchlists, scanner opportunities and timestamped data.
- AI, research and portfolio copilots, saved research projects, notes and historical AI memory.
- Strategy library, parameter drafts, backtest/walk-forward results and backend-validated paper workflows.
- Automation Centre with risk, protection, reconciliation, proposals, execution history and authoritative emergency-stop acknowledgement.
- Secure native sessions, device session revocation, optional biometric app unlock and configurable push infrastructure.

## Install

1. Download `quants-trade-{{VERSION}}.apk` and its `.sha256` file from this release.
2. Verify the download: `sha256sum --check quants-trade-{{VERSION}}.apk.sha256` (or compare SHA-256 using a trusted Android/file utility).
3. On Android 7.0/API 24 or newer, allow installation from the browser/file manager you use, then open the APK. Turn that installation permission off afterward.
4. Sign in with an existing verified Quant’s Trade account. The app’s presence on your phone does not grant account access or trading permission.
5. Future updates require the same signing certificate and a higher version code. Do not uninstall merely to bypass an unexpected signature mismatch; verify the release source first.

This release contains ARM64 and x86_64 native libraries. 32-bit-only phones are not supported by this build.

## Known limitations

- Backend deployment, valid account permissions and configured market/AI providers are required. Missing data is shown as unavailable; no example balances or generated investment results are shipped.
- Push delivery requires configured Firebase/Expo credentials, device registration and Android permission. Notifications contain generic notices. Delivery is not guaranteed.
- Background quote subscriptions pause to conserve battery. Reopening the app refreshes server state. Autonomous trading continues on the server when the phone is off.
- Complex visual strategy/matrix editing remains a desktop workflow. Mobile supports simplified drafts and inspection of backend results.
- Local/component tests and APK signature validation do not replace physical-device, real-provider or real-broker acceptance. Review the repository’s validation evidence for the scope actually completed.

## Security and trading controls

- The API origin in an APK is discoverable. This release is intended only for an operator-approved public HTTPS API with independent server authentication and authorization.
- No broker passwords, AI provider keys, database credentials or Android signing key are bundled. Native session credentials are stored using device secure storage.
- Installation does not activate live trading. Real-money execution remains subject to existing broker acceptance, deterministic server risk limits and separate explicit operator authorization.
- An emergency-stop transport failure is reported as unknown until the server acknowledges the persisted stop. Stopping the app does not liquidate positions or cancel broker-native stops.
- SHA-256 detects download corruption; trust the signing certificate and repository provenance as well. This is a sideloaded APK, not a Google Play publication.

Version: **{{VERSION}}** · Android versionCode: **{{VERSION_CODE}}** · Source commit: `{{COMMIT}}`
