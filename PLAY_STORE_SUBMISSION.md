# CycleSense: Google Play submission guide

This is a code-based readiness review and a practical release checklist, not a Play policy approval or legal opinion. Google Play reviews the uploaded binary, declarations, listing and permission behavior; verify every declaration against the exact release artifact.

## Readiness verdict

**Not ready for production upload.** Start with the P0 blockers below. This is a prioritized action list—not a report that the steps have already been completed.

### P0 — Must fix before the first CycleSense upload

| Action | Evidence / exact next step |
|---|---|
| Package name selected | Set to `com.androspace.cyclesense` in the Expo Android config, Android namespace/application ID, and native app package declarations. Confirm the ID is available and controlled by you in Play Console before first upload; package names cannot be changed after publishing. |
| Configure production signing | `frontend/android/app/build.gradle` signs `release` with `signingConfigs.debug`. Configure a private production upload key or managed EAS credentials and Play App Signing. Never upload a debug-signed bundle; do not commit signing credentials. |
| Fix the foreground service | The service is declared as `dataSync` but its stated purpose is keeping battery tracking alive. Review the current Android/Play foreground-service requirements, select a permitted implementation/type for the actual feature, or remove the service if it is not eligible. Retest background behavior. |
| Finish and publish privacy/support information | Replace every `REPLACE_WITH_SUPPORT_EMAIL` in `website/`, publish the site over HTTPS, confirm all policy/support pages work without login, and use the final privacy URL in Play Console. |

### P1 — Must complete before submitting the release for review

| Action | Evidence / exact next step |
|---|---|
| Review and minimize permissions | The merged release manifest includes `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, and `WRITE_EXTERNAL_STORAGE`; inspected app source did not show a need for overlay or legacy storage. Verify against the final feature set and remove permissions that are not needed. Keep Usage Access optional and clearly explained. Re-check the merged manifest afterwards. |
| Complete app-content declarations | In CycleSense's Play Console entry, provide accurate Data safety, ads, target-audience, content-rating, privacy-policy, and any special-permission declarations. Recheck final dependencies and SDK data practices before answering. |
| Finish the store listing | Provide final descriptions, contact details, screenshots, and required graphics (including feature graphic). The source has an app icon, but no Play screenshots or feature graphic were found. Ensure listing claims match the release. |
| Test the signed release artifact | Build and install a production-signed release. Test permissions both granted and denied, charging transitions, background work, notifications, widget, Usage Access opt-in, CSV export, data clearing, crashes, and supported Android versions. Review Play pre-launch results and resolve issues. |
| Upload CycleSense to a test track | Use CycleSense's own internal/closed track, test its bundle and address crashes, compatibility issues, tester feedback, and Play warnings before production. |

### P2 — Check in Play Console; required only if it applies

| Check | What to do |
|---|---|
| Production-access testing gate | Your other app's closed test is separate from CycleSense. In CycleSense's dashboard, check whether production access is already available. If the console requires the personal-account gate, Google currently specifies at least 12 testers opted into **CycleSense's** closed test continuously for 14 days before applying for production access. If the dashboard shows access already granted, do not repeat the test just for this checklist. |
| New version code | Current `versionCode` is 1. Set an unused, incremented code for each upload; you do not need a different value just to build locally. |
| Data removal UX | There is no in-app delete-all control. Android Settings → Apps → CycleSense → Storage → Clear storage/data or uninstall is the documented removal path. Consider adding in-app deletion as a product improvement; it is not listed here as a confirmed Play blocker. |

### No action needed based on the checks already done

- **Create another Play Console account:** No. Use the account you already have and create CycleSense as a separate app entry.
- **Create an app-operated backend:** No. The inspected mobile app works locally; the backend file is a commented prototype and is not connected to the app.
- **Raise target API now:** No. The generated release manifest targets API 36, meeting the requirement checked for this review. Reconfirm the current requirement when submitting.
- **Declare ads now:** No, if you ship without an ad SDK. The inspected dependencies/source did not show ads. If ads are added, update the privacy policy, consent flow, dependencies, and Play ads/Data safety declarations before shipping.
- **Publish the bundle previously built for validation:** No. It was debug-signed and was removed after validation. Build a new bundle after signing is fixed.

The Play Console account exists and another app is in closed testing, but account-level production access for CycleSense is not confirmed from this repository. Use the CycleSense dashboard for that status.

### Publish the website

The `website/` directory is a static site and needs no build step. Publish its contents through an HTTPS static host (for example, GitHub Pages with a configured workflow or another static hosting provider), then verify the landing page, `privacy.html`, `terms.html` and `support.html` load without authentication. Replace the support email placeholder before publishing. Use the final privacy URL in Play Console and in the app if an in-app privacy link is added.

### Important permission and feature checks

- `SYSTEM_ALERT_WINDOW` is present in the main manifest, but no overlay implementation was found in app source. Remove it if the production app does not need overlays.
- `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` are declared only through API 32. The app’s CSV export writes to app-private storage and opens Android’s share sheet; verify whether these manifest entries are still needed after inspecting the merged release manifest.
- `PACKAGE_USAGE_STATS` is a special permission. The app correctly defaults its setting off and opens Android’s Usage Access settings only after user action. Keep the access optional, prominent, tied to the user-facing app-usage insight, and described in the privacy policy and any Play permission declaration.
- The custom foreground service declares type `dataSync` but describes its purpose as keeping battery session tracking alive. This type/purpose mismatch needs an Android/Play policy review and a tested design correction before release. Do not treat a successful Gradle build as policy approval.
- `android:allowBackup="true"` means Android system backup may include eligible local app data according to device and account settings. The website privacy policy makes this caveat explicit.
- The separate `backend/server.py` is a commented starter prototype and is not connected to the mobile app in the inspected source. Do not deploy it as part of this first release unless it is separately secured, tested, and added to the privacy disclosures.

## Suggested Play listing text

**App name**  
CycleSense

**Short description**  
Understand battery cycles, charging sessions and battery trends.

**Full description**  
Make sense of the way your phone charges and discharges.

CycleSense brings battery status, charging history and helpful trends together in one clear view. Follow charge and discharge sessions as they happen, review your timeline, and explore insights based on the battery readings your device makes available.

• See current battery level and charging state  
• Review automatic charge and discharge sessions  
• Explore battery trends and clearly labeled estimates  
• Set optional battery alerts and sound cues  
• Add a home-screen battery widget and optional background samples  
• Export session history as a CSV when you choose  
• Keep app history on your device, with no CycleSense account or cloud sync

Optional app-usage insights require you to grant Android Usage Access in system settings. This access is off by default. Device support and available readings vary. CycleSense estimates are informational and are not a substitute for manufacturer diagnostics or battery-safety guidance.

**Category suggestion**  
Tools. Confirm the category and tags fit the final listing.

**Support and policy URLs**  
Use the published HTTPS URLs for `website/support.html` and `website/privacy.html`. Do not submit while the support email placeholder remains.

## Play Console release process

1. **Use your existing Play Console account.** You already have an account and another app in closed testing, so account creation is not a CycleSense task. Confirm which account type you have and whether Play Console has already granted that account production access.
2. **Create a separate CycleSense app entry.** In the existing account, create the CycleSense app and complete its own dashboard, listing, policy declarations and release setup. An existing app's closed-test track is not a CycleSense track; do not assume its test history satisfies a production-access gate shown for CycleSense.
3. **Finalize the app identity.** Select the final unique package name before CycleSense's first upload. Set the app name, version name and a monotonically increasing integer `versionCode`.
4. **Prepare a signed Android App Bundle.** Configure a production upload key (or EAS-managed Android credentials), enroll in Play App Signing, and build a release `.aab`. The current Gradle `release` signing config is debug-only and must be replaced. Keep the upload key and passwords outside source control.
5. **Test the actual release binary.** Install a release-like build on representative devices and Android versions. Test first launch, permissions denied/granted, charging transitions, background sampling, notifications, widget behavior, optional Usage Access, offline behavior, CSV sharing and data clearing. Check crashes, battery impact, accessibility and the merged manifest.
6. **Complete App content and privacy declarations.** Add the active privacy-policy URL; answer ads, target audience, content-rating, Data safety and any permission/access declarations accurately. Provide reviewer instructions if any feature is gated. No account/login is present in the inspected app. Review age-targeting requirements before selecting an audience.
7. **Complete the store listing.** Add short/full descriptions, category, contact details, icon, feature graphic and required screenshots. Ensure screenshots and claims reflect the shipped app. Avoid implying that estimated battery health is a manufacturer reading or that CycleSense extends battery life.
8. **Upload CycleSense to testing.** Create an internal test first, then test CycleSense's closed track and resolve tester feedback, Play pre-launch report findings and policy warnings.
9. **Check CycleSense's production eligibility.** For personal developer accounts created after November 13, 2023, Google currently requires at least 12 testers opted in to the app's closed test continuously for 14 days before applying for production access. Because your other app is a separate app entry, check the CycleSense dashboard and its Production access status; follow the gate and instructions shown there. If production access is already available for this account, proceed according to the dashboard instead of repeating a test unnecessarily.
10. **Submit and roll out.** Create the CycleSense production release, upload the signed AAB, review countries/devices and release notes, send the changes for review, then use a staged rollout if appropriate. Monitor Android vitals, ratings, policy notices and support requests.
11. **Maintain the release.** For every update, increment `versionCode`, retest permissions and disclosures, and meet the target API level in effect at submission time.

### Local Android bundle command

Once production signing is configured, the existing native project can build a bundle from PowerShell:

```powershell
Set-Location frontend\android
.\gradlew.bat :app:bundleRelease
```

Expected output is `frontend\android\app\build\outputs\bundle\release\app-release.aab`. With current source settings, the release is signed using the debug config; do not upload that artifact until release signing is corrected.

### Useful official references

- [Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152)
- [Set up your app on the Play Console dashboard](https://support.google.com/googleplay/android-developer/answer/9859454)
- [App content and privacy policy](https://support.google.com/googleplay/android-developer/answer/9859455)
- [Testing requirements for personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Android target API level requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
