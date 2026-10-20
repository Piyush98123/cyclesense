# CycleSense: Google Play submission guide

This is a code-based readiness review and a practical release checklist, not a Play policy approval or legal opinion. Google Play reviews the uploaded binary, declarations, listing and permission behavior; verify every declaration against the exact release artifact.

## Readiness verdict

**Not ready for production upload.** Start with the P0 blockers below. This is a prioritized action list—not a report that the steps have already been completed.

### P0 — Must fix before the first testing-track AAB

| Action | Evidence / exact next step |
|---|---|
| Package name selected | Set to `com.androspace.cyclesense` in the Expo Android config, Android namespace/application ID, and native app package declarations. Confirm the ID is available and controlled by you in Play Console before first upload; package names cannot be changed after publishing. |
| Configure production signing | `frontend/eas.json` now selects EAS-managed remote credentials and an Android App Bundle for the production profile. Sign in to EAS, link the project, let EAS create/manage the upload key, enroll in Play App Signing, then verify the built AAB is signed with the expected upload certificate. Never upload a debug-signed bundle or commit signing credentials. |
| Correct the foreground-service design | Removed the `dataSync` foreground service: battery-session tracking does not perform data synchronization, and keeping a process alive is not a valid foreground-service purpose. Optional periodic sampling still uses WorkManager; test background transitions and sampling on devices before release. |

### P1 — Must complete before submitting the release for review

| Action | Evidence / exact next step |
|---|---|
| Review and minimize permissions | **Done:** removed unused `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, and `FOREGROUND_SERVICE` from the merged release manifest. Expo config blocks the app-level foreground permission; the native manifest also removes WorkManager's unused foreground service declaration. Keep Usage Access optional and clearly explained. |
| Publish privacy/support pages | The support email is now `engineervoice1602@gmail.com`. Publish the site over HTTPS, confirm all pages work without login, review the draft text for accuracy, and use the final privacy URL in Play Console. |
| Complete app-content declarations | In CycleSense's Play Console entry, provide accurate Data safety, ads, target-audience, content-rating, privacy-policy, and any special-permission declarations. You confirmed the intended age bands are 13–15, 16–17, and 18+. You confirmed the first release will have no ads; declare no ads only if the final dependency list and bundle remain free of ad SDKs. Recheck final dependencies and SDK data practices before answering. |
| Finish the store listing | Provide final descriptions, contact details, screenshots, and required graphics (including feature graphic). The source has an app icon, but no Play screenshots or feature graphic were found. Ensure listing claims match the release. |
| Test the signed release artifact | A local release APK compiled after syncing the package and permissions, but it used the Android Debug certificate. No Android test device is connected here. Build the production AAB with EAS remote credentials and verify its signing certificate; install a signed test build on supported Android devices and check permission-denial paths, charging transitions, WorkManager sampling, notifications, widget, Usage Access opt-in, CSV export, data clearing, crashes, and Play pre-launch results. |
| Upload CycleSense to a test track | Use CycleSense's own internal/closed track, test its bundle and address crashes, compatibility issues, tester feedback, and Play warnings before production. |

### Status of the requested pre-review work

- **Permissions:** cleaned up and verified absent from the merged release manifest, including the unused WorkManager foreground service permission/declaration.
- **Native regeneration:** Expo prebuild exposed a malformed manifest wrapper from the CycleSense config plugin. The plugin now attaches the tools namespace to the `<manifest>` node; release compilation and merged-manifest verification succeed.
- **Store listing text:** draft copy is provided below; final listing is not entered in Play Console. Screenshots, feature graphic, and published HTTPS URLs are still needed. The support email is `engineervoice1602@gmail.com`.
- **Play declarations:** not submitted. They must be completed in CycleSense's Play Console entry and match the exact release. The first release is planned to have no ads; verify the final dependency list and bundle contain no ad SDK before declaring that. The inspected app has no app-operated backend. Review Data safety, optional Usage Access, Android backup, user-initiated CSV sharing, the confirmed 13–15 / 16–17 / 18+ audience, content rating, and any special-permission notices against the live Console questions.
- **Signing:** `frontend/eas.json` defines the production AAB profile and selects remote EAS credentials. EAS has not been linked/authenticated and no production upload key or AAB has been created. The local Gradle release APK was signed with `CN=Android Debug`; it is validation-only and must not be uploaded.
- **Testing track upload:** not done. No signed production AAB or authenticated Play Console session is available in this workspace. Upload from the existing developer account after the blockers above are resolved.

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
- **Ads for the first release:** Confirmed no ads. Do not add an ad SDK to this release; verify the final dependencies and declare no ads in Play Console. If you add ads in a later release, update the privacy policy, consent flow, dependencies, and Play ads/Data safety declarations before shipping.
- **Publish the bundle previously built for validation:** No. It was debug-signed and was removed after validation. Build a new bundle after signing is fixed.

The Play Console account exists and another app is in closed testing, but account-level production access for CycleSense is not confirmed from this repository. Use the CycleSense dashboard for that status.

### Publish the website

The `website/` directory is a static site and needs no build step. The `Deploy website to GitHub Pages` workflow publishes it when changes are pushed to `production-release`; enable GitHub Pages with **GitHub Actions** as the build and deployment source in repository settings. Verify the landing page, `privacy.html`, `terms.html` and `support.html` load without authentication. Confirm the support email receives mail before publishing. Use the final privacy URL in Play Console and in the app if an in-app privacy link is added.

### Important permission and feature checks

- `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` were removed from the main manifest and added to Expo's `android.blockedPermissions` because the inspected production features do not use overlays or direct shared-storage access. CSV export uses app-private storage and Android's share sheet. `FOREGROUND_SERVICE` and WorkManager's `SystemForegroundService` declaration are also removed because no CycleSense worker uses foreground execution. Confirm these remain absent from the merged manifest after regenerating native files.
- `PACKAGE_USAGE_STATS` is a special permission. The app correctly defaults its setting off and opens Android’s Usage Access settings only after user action. Keep the access optional, prominent, tied to the user-facing app-usage insight, and described in the privacy policy and any Play permission declaration.
- The app no longer declares a foreground service. The removed `dataSync` service only attempted to keep the process alive; it did not provide eligible user-visible data synchronization. Optional background samples continue through WorkManager. Verify the final merged manifest has no foreground-service permissions/service and test session transitions and sampling with the app backgrounded.
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
Use the published HTTPS URLs for `website/support.html` and `website/privacy.html`. The support contact is `engineervoice1602@gmail.com`; confirm it receives mail before submission.

## Play Console release process

1. **Use your existing Play Console account.** You already have an account and another app in closed testing, so account creation is not a CycleSense task. Confirm which account type you have and whether Play Console has already granted that account production access.
2. **Create a separate CycleSense app entry.** In the existing account, create the CycleSense app and complete its own dashboard, listing, policy declarations and release setup. An existing app's closed-test track is not a CycleSense track; do not assume its test history satisfies a production-access gate shown for CycleSense.
3. **Finalize the app identity.** Select the final unique package name before CycleSense's first upload. Set the app name, version name and a monotonically increasing integer `versionCode`.
4. **Prepare a signed Android App Bundle.** From `frontend`, sign in to EAS and link this app to an EAS project (`npx eas-cli login`, then `npx eas-cli init`). Run `npx eas-cli build --platform android --profile production`; the checked-in profile requests remote EAS credentials and an `.aab`. Let EAS generate/manage the upload key, enroll in Play App Signing, and verify the resulting bundle certificate before upload. Keep signing credentials outside source control.
5. **Test the actual release binary.** Install a release-like build on representative devices and Android versions. Test first launch, permissions denied/granted, charging transitions, background sampling, notifications, widget behavior, optional Usage Access, offline behavior, CSV sharing and data clearing. Check crashes, battery impact, accessibility and the merged manifest.
6. **Complete App content and privacy declarations.** Add the active privacy-policy URL; answer ads, target audience, content-rating, Data safety and any permission/access declarations accurately. Provide reviewer instructions if any feature is gated. No account/login is present in the inspected app. Review age-targeting requirements before selecting an audience.
7. **Complete the store listing.** Add short/full descriptions, category, contact details, icon, feature graphic and required screenshots. Ensure screenshots and claims reflect the shipped app. Avoid implying that estimated battery health is a manufacturer reading or that CycleSense extends battery life.
8. **Upload CycleSense to testing.** Create an internal test first, then test CycleSense's closed track and resolve tester feedback, Play pre-launch report findings and policy warnings.
9. **Check CycleSense's production eligibility.** For personal developer accounts created after November 13, 2023, Google currently requires at least 12 testers opted in to the app's closed test continuously for 14 days before applying for production access. Because your other app is a separate app entry, check the CycleSense dashboard and its Production access status; follow the gate and instructions shown there. If production access is already available for this account, proceed according to the dashboard instead of repeating a test unnecessarily.
10. **Submit and roll out.** Create the CycleSense production release, upload the signed AAB, review countries/devices and release notes, send the changes for review, then use a staged rollout if appropriate. Monitor Android vitals, ratings, policy notices and support requests.
11. **Maintain the release.** For every update, increment `versionCode`, retest permissions and disclosures, and meet the target API level in effect at submission time.

### EAS production bundle command

From PowerShell, after signing in and linking the project:

```powershell
Set-Location frontend
npx eas-cli build --platform android --profile production
```

EAS will prompt for remote Android credentials if they are not configured. Do not upload until the build succeeds, the AAB certificate is verified as the expected upload key, the merged manifest has been checked, and device testing is complete.

### Useful official references

- [Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152)
- [Set up your app on the Play Console dashboard](https://support.google.com/googleplay/android-developer/answer/9859454)
- [App content and privacy policy](https://support.google.com/googleplay/android-developer/answer/9859455)
- [Testing requirements for personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Android target API level requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
