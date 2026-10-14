# CycleSense Android Emulator Test Report

**Test date:** 2026-10-14  
**Target:** Android emulator (`sdk_gphone64_x86_64`)  
**App package:** `com.emergent.mobileappbuilder.y0lu2t`  
**Test style:** Manual end-to-end UI testing using Android emulator controls, screenshots, accessibility hierarchy, controlled `dumpsys battery` states, local AsyncStorage inspection, and Android logs  
**Overall status:** Today’s four tracked issues were fixed and rechecked on a bundled Android release build: session persistence, current direction, settings refresh on tab return, and hiding the curve until data is available. Timeline session detail, comparisons, known-charger display, and relaunch persistence were exercised. Diary text entry and charger rename/forget remain partial because the emulator opened a system stylus-handwriting prompt when a text field received focus. The new time-to-full flow was smoke-tested on a forced charging state; its displayed estimate used synthetic emulator current and is not a physical-device accuracy result. A sample-backed curve remains unverified because only one usable sample was exposed; notification sound is also unverified.

## 1. Purpose and scope

This report records what was observed while checking CycleSense in the running Android emulator. It distinguishes:

- **Verified:** The screen or interaction was exercised and its visible result checked.
- **Partial:** The screen or interaction was seen, but its full behavior or persistence was not verified.
- **Not tested:** No conclusion about whether the feature works.
- **Issue observed:** The emulator displayed contradictory or unexpected behavior that needs investigation.

The earlier pass checked that all four navigation tabs open, inspected their visible content, exercised the charging-alert stepper, and reviewed recent app error logs. The Today pass compared displayed battery values with the emulator battery service, tapped Refresh, simulated charging and unplugging, crossed both configured alert thresholds, inspected persisted sessions/settings, tested card-order refresh on tab return, and verified the tracked fixes. The Timeline follow-up opened session details and comparison, exercised charger recognition and edit/cancel, and force-stopped/relaunched to verify records persisted. The emulator battery was restored; test-generated session rows and one test-learned charger remain in app storage because this release app cannot safely restore private AsyncStorage on this emulator.

## 2. Summary of current results

| Tab | Result | What was confirmed |
|---|---|---|
| Today | Exercised; tracked issues fixed | Live values and Refresh were checked against the emulator. Session records persisted through charge transitions and force-stop/relaunch. Direction text followed charging/discharging mode. Reordered dashboard cards appeared on Today immediately after returning from Settings. Curve is hidden until sufficient samples exist. A known-charger greeting was displayed. The new estimator displayed a value during the forced charging-state smoke test, but it relied on synthetic emulator current. |
| Timeline | Exercised; text/edit workflows partial | Five sessions and one learned charger displayed after controlled transitions and force-stop/relaunch. Session detail values and comparison chart/metrics rendered. The charger edit dialog opened and Cancel worked. Note editing and charger rename/forget were not completed because text input opened Android’s stylus-handwriting prompt. Forced battery changes caused synthetic rate values, so rates were not treated as accurate device behavior. |
| Insights | Exercised; raw curve and health trend awaiting data | 24H displayed the honest “Waiting for background samples” state with no fabricated chart bars. 30D displayed “Needs a few full discharge cycles” and no health points. Today and 5-Day digest both populated from four closed emulator test sessions; values were checked against the exposed test-session data and code semantics. The controlled data produced a zero drain average and is not representative of natural use. Several chart/metric labeling and date-window issues were identified below. |
| Settings | Audited; behavior partially verified | Core alert thresholds, sound cues, background sampling, dashboard order, CSV export, and opt-in Usage Access all map to app features. Dashboard order and charge threshold were previously exercised. Capability rows are diagnostics, not settings; detector logic currently treats raw samples and screen tracking as available whenever the native bridge exists, so those indicators should not be considered device-verified. No setting was changed during this audit. |

No fatal app crash was observed during the Today walkthrough. This is not proof that all functionality is crash-free.

## 3. Issues and observations

### CS-EMU-01 — Today shows an active session, while session history stays empty

- **Severity:** High (data consistency)
- **Status:** Fixed and verified on the Android emulator
- **Observation:** Today showed an active discharge/charge session, but `cyclesense:sessions` in Android AsyncStorage remained `[]` after the controlled charge transition and app relaunch. The initial Timeline walkthrough also showed `0` sessions and “No cycles recorded yet”.
- **Expected:** An open session should appear in session history as an in-progress session, or the UI should consistently explain why it is omitted.
- **Code-level cause (high confidence):** In `startSession()` and `endSession()`, a local `capped` array starts empty, then is assigned only inside React's `setSessions(current => ...)` updater. The code immediately passes that local variable to `persistSessions(capped)` after scheduling the state update. React is not required to execute the updater before that next statement, so the persisted value can remain `[]` even while the UI has an open session. This matches the observed `cyclesense:sessions: []`. Timeline also has a separate hook instance and only reloads from storage on focus, so it cannot show an in-memory session that was never persisted.
- **Code-level cause:** `startSession()` and `endSession()` formerly persisted a local array assigned as a side effect inside React’s state-updater callback. React may defer that callback, leaving the persisted value empty. Timeline uses a separate hook instance and reloads sessions from storage on focus.
- **Fix:** Session mutations now compute an explicit next array from a current sessions ref, update the ref and UI state, and persist that same array.
- **Emulator verification:** Timeline showed an open session; after a charge transition it showed the closed discharge plus open charge record. After unplugging and force-stopping/relaunching, the saved records remained and the current open session was reconciled. No crash occurred in the tested flow.

### CS-EMU-02 — Discharging status conflicts with “Charging into battery” current hint

- **Severity:** Medium (telemetry presentation; device-dependent)
- **Status:** Fixed and verified in charging and discharging emulator states
- **Observation:** With Android reporting AC power off, status `4` (discharging), and level 91%, Today displayed `Discharging` but still showed `900 mA · 4.5 W` and “Charging into battery”. The same positive current was displayed while charging, so the emulator value did not distinguish the two directions.
- **Expected:** The current direction and charge state should agree, or the app should avoid assigning a direction when the device’s current sign convention is unknown.
- **Code-level cause:** The UI chose direction from the sign of `currentNowMicroA`; the emulator reports the same positive 900 mA while charging and discharging.
- **Fix:** The hint now uses battery mode (`charging`/`full` or `discharging`) and reports unavailable direction for other modes. Current is displayed as a magnitude, separate from direction.
- **Emulator verification:** At 80% unplugged/discharging the card showed “Drawing from battery”; at 80% charging it showed “Charging into battery”. Both displayed 900 mA and 4.5 W. Emulator current remains synthetic, so physical-device telemetry is not claimed as verified.

### CS-EMU-03 — Android log reports notification sound `default` is missing

- **Severity:** Low (notification sound; impact not fully verified)
- **Status:** Warning reproduced; threshold notification text verified, sound not verified
- **Observation:** React Native logged: `expo-notifications: Custom sound 'default' not found in native app. Make sure the sound file ... is included in the expo-notifications config plugin sounds array in app config.`
- **Area to investigate:** Notification channel and notification content configuration in `frontend/src/notifications.ts`.
- **Test result/follow-up:** With notification permission already granted, crossing 89% to 90% while charging posted “Charging threshold reached” / “Battery reached 90% while charging.” Crossing 21% to 20% while discharging posted “Battery running low” / “Battery fell to 20%. Consider plugging in.” One low-battery notification record remained after the level fell to 19%, consistent with the alert not repeating immediately. A plug transition also posted its notification. Whether alerts played sound remains unverified; investigate whether `default` is being treated as a missing custom sound.
- **Caution:** The warning alone does not establish that notifications fail. Notification behavior was not fully tested.

### CS-EMU-04 — Today does not immediately reflect a changed dashboard order

- **Severity:** Medium (cross-tab state refresh)
- **Status:** Fixed and verified on tab return
- **Observation:** Changed the order to status → Live curve → Quick telemetry in Settings and returned to Today. Today initially continued to show Quick telemetry before Live curve. After force-stopping and relaunching, it showed the saved order correctly.
- **Expected:** Returning to Today after changing its card order should render the latest saved preference without requiring an app restart.
- **Code-level cause:** Every tab calls `useCycleSense()` independently. Settings persists the new order, but Today’s mounted hook did not reload preferences when it regained focus.
- **Fix:** Today reloads persisted settings on focus.
- **Emulator verification:** Moved Quick telemetry above Live status in Settings, returned to Today without restarting, and confirmed Quick telemetry appeared first. Restored the original order afterward.

### CS-EMU-05 — Live curve displays fallback bars while awaiting real samples

- **Severity:** Low (misleading empty-data presentation)
- **Status:** Fixed; curve is hidden until at least two valid samples are available
- **Observation:** The curve caption said “Awaiting first complete cycle”, but the card still displayed a populated set of orange bars. No meaningful populated curve could be validated from those bars.
- **Expected:** A no-data/insufficient-samples state should not look like a real measured curve.
- **Code-level cause:** `ChartFrame` substituted a fixed illustrative array whenever its `data` prop was absent, making an empty chart look populated.
- **Fix:** `ChartFrame` draws bars only from supplied data. Today now hides the entire Live curve section until at least two valid samples exist, then captions the chart with its sample count.
- **Emulator verification:** With fewer than two usable samples, the Live curve section is hidden instead of showing an empty chart. Two-sample/populated rendering still requires a usable sample history to verify.

## 4. Detailed tab-by-tab test record

### 4.1 Today

Screen: `frontend/app/(tabs)/index.tsx`

| ID | Functionality / fields | Test procedure | Status | Observation / expected result |
|---|---|---|---|---|
| TOD-01 | Dashboard opens and renders | Open Today from the bottom navigation; inspect the screen and scroll through its cards | Verified | Dashboard, telemetry, curve, and “Private by default” card rendered and were scrollable; no crash observed. |
| TOD-02 | Battery percentage and battery mode | Compare Today with `dumpsys battery`; set emulator to 80% charging and unplugged | Verified | Today showed 80% Charging and 80% Discharging matching `dumpsys battery`. Emulator restored to 100% unplugged at the end of verification. |
| TOD-03 | Native/live capability indicator | Read the status badge | Verified | `NATIVE` was displayed and the native telemetry sentence appeared. |
| TOD-04 | Automatic session status | Observe Today during charging and unplug transitions; inspect Timeline after relaunch | Verified; fix confirmed | Session pill changed with charge state. Timeline showed the open session, then the closed discharge and open charge records after transition; after force-stop/relaunch, saved sessions remained and the active session was reconciled (CS-EMU-01). |
| TOD-05 | Current, watts, temperature, health, voltage | Read Quick telemetry in charging/discharging states; compare voltage/temperature with `dumpsys battery` | Verified; direction fix confirmed | Both 80% states displayed 900 mA / 4.5 W, 25.0°C, system health `good`, and 5.00 V; temperature/voltage matched `dumpsys battery`. Direction hint matched mode in both states (CS-EMU-02). Emulator current is synthetic. |
| TOD-06 | Live curve | Scroll Today with fewer than two valid samples; then inspect after samples accumulate | Verified for hidden empty state | The entire Live curve section is hidden until at least two valid samples exist (CS-EMU-05). Populated sample-backed rendering was unavailable to test. |
| TOD-07 | Refresh action | Tap Refresh from the header and compare the visible values | Verified | Refresh completed and the dashboard continued to show the values then reported by the emulator; no error or crash observed. |
| TOD-08 | Charger recognition greeting | Reconnect the emulator's previously learned AC charger and inspect Today | Verified on emulator | On connecting AC at 80%, Today displayed “WELCOME BACK — Your Standard charger is back” and “Recognized this cable from its current signature.” This verifies the known-charger match/greeting path against the emulator's persisted synthetic AC fingerprint; it does not prove physical charger identification accuracy. |
| TOD-09 | Time-to-full / time-to-alert estimate | Inspect while charging below the 90% alert; enable sampling and inspect captured sample count | Partial; numeric E2E estimate unavailable | At 80–82% Charging, Today showed `Time to full —` / `Warming up`. Insights exposed only 1 raw sample. A numeric projection requires at least two valid, time-ordered samples with at least a 2 percentage-point rise in the recent window; the app samples via opt-in WorkManager at a minimum 15-minute interval. Estimator unit tests passed, but the numeric UI estimate could not be verified from this session's data. Sampling was turned back off. |
| TOD-10 | Notification threshold/cue behavior | Cross the configured charge threshold (89%→90%) and discharge threshold (21%→20%); inspect notification content and check at 19% | Verified for delivery; sound partial | Android posted “Charging threshold reached” / “Battery reached 90% while charging” and “Battery running low” / “Battery fell to 20%. Consider plugging in.” One low-battery notification remained after the level fell to 19%, with no second record observed. Plug/unplug notification text also appeared. Sound was not confirmed; missing-`default` warning CS-EMU-03 was logged. Full re-arming behavior was not tested. |
| TOD-11 | Dashboard card order | Move Quick telemetry above Live status in Settings and return to Today without restarting | Verified; fix confirmed | Today immediately showed the changed order on tab return (CS-EMU-04). Restored the original card order after testing. |
| TOD-12 | Return to top/bottom dashboard content | Scroll between the live-status card, curve, and privacy card | Verified | Scrolling exposed the lower cards and “Private by default” message without a visible layout crash. |

### 4.2 Timeline

Screen: `frontend/app/(tabs)/timeline.tsx`

| ID | Functionality / fields | Test procedure | Status | Observation / expected result |
|---|---|---|---|---|
| TIM-01 | Timeline opens and renders | Open Timeline from the bottom navigation | Verified | Screen rendered without a visible crash. |
| TIM-02 | Session and known-charger counts | Read the summary row before and after session transitions/relaunch | Verified for session persistence | Initially showed zero before CS-EMU-01 was fixed. After the fix, Timeline showed saved open and closed test sessions across transitions and app relaunch. Known-charger behavior remains unverified. |
| TIM-03 | Empty-state behavior | Open Timeline before recording sessions | Verified for initial empty state | Timeline showed the no-session empty state before E2E session records were generated. |
| TIM-04 | Session row values | Complete a session and inspect row title, mode, times, levels, duration, rate, and confidence | Not tested | No session row was available during the walkthrough. |
| TIM-05 | Session detail modal | Tap a session and check details, notes, tags, sample curve, and usage fields | Not tested | Requires at least one completed session; optional fields may depend on native support and permission. |
| TIM-06 | Compare two sessions | Select two session rows and inspect normalized curve overlay | Not tested | Requires at least two recorded sessions. |
| TIM-07 | Charger recognition list | Complete charge sessions and inspect learned charger metadata | Not tested | Requires charger fingerprints with usable telemetry. |
| TIM-08 | Rename/forget charger | Rename a known charger; verify it persists, then forget it | Not tested | Requires at least one known charger. |
| TIM-09 | Diary note and tags | Add/edit session note and tags, leave and reopen the session | Not tested | Requires a session; persistence and UI behavior need verification. |

### 4.3 Insights

Screen: `frontend/app/(tabs)/analytics.tsx`

| ID | Functionality / fields | Test procedure | Status | Observation / expected result |
|---|---|---|---|---|
| INS-01 | Insights opens and renders | Open Insights from bottom navigation | Verified | Screen rendered without a visible crash. |
| INS-02 | 24H range selection | Select 24H | Partial | Range rendered its empty-data message and showed that samples were still awaited. Populated chart behavior was not checked. |
| INS-03 | 30D range selection | Select 30D | Partial | Health trend view rendered with “Awaiting data” / “Needs a few full discharge cycles”. |
| INS-04 | Digest range selection | Select Digest | Partial | Period digest view rendered with “Awaiting data” and average drain waiting for samples. |
| INS-05 | Digest period options and calculations | Select each digest period and check trend, average drain, and charging-habit values | Not tested | No populated session data was available to validate calculations. |
| INS-06 | Baseline and anomaly insight | Record sufficient completed discharge sessions and inspect comparison | Not tested | Requires historical data; thresholds and calculations were not validated in the UI. |
| INS-07 | Screen-on metrics | Compare displayed totals and longest screen-on run against observed device use | Not tested | Requires supported native screen tracking and elapsed observation time. |
| INS-08 | Weekly app ranking / weekday-weekend pattern | Grant Usage Access and inspect weekly usage insights | Not tested | Requires explicit Android Usage Access permission and sufficient usage history. |
| INS-09 | Insights navigation links | Use any “View timeline” or related action and verify destination | Not tested | — |

### 4.4 Settings

Screen: `frontend/app/(tabs)/settings.tsx`

| ID | Functionality / fields | Test procedure | Status | Observation / expected result |
|---|---|---|---|---|
| SET-01 | Settings opens and renders | Open Settings from bottom navigation | Verified | Screen and visible controls rendered. |
| SET-02 | Charge alert stepper | Increase 90% to 95%, then decrease to restore 90% | Verified | Value updated to 95%; it was restored and verified at 90%. Persistence after a full app restart was not checked. |
| SET-03 | Discharge alert stepper and bounds | Change threshold; test minimum/maximum boundaries | Not tested | Initial displayed value was 20%; limits and persistence were not checked. |
| SET-04 | Sound cues switch | Toggle off/on; test actual plug/unplug cue behavior | Not tested | Initial switch appeared enabled. Notification log warning CS-EMU-03 should be considered during cue testing. |
| SET-05 | Background sampling toggle | Enable sampling, wait for WorkManager run, inspect sample history; disable afterward | Not tested | UI showed the native Android description. Actual scheduled sampling was not verified. |
| SET-06 | Dashboard card reorder | Move Quick telemetry above Live status, return to Today, then restore original order | Verified | Today immediately reflected the saved reorder on tab return without an app restart (CS-EMU-04); original order was restored. |
| SET-07 | Device capability indicators | Compare each listed capability with values actually available on the emulator | Not tested | The screen was not scrolled through and checked field by field. |
| SET-08 | CSV export | Tap export, inspect generated CSV and share sheet; cancel after verification | Not tested | Avoided because it may open an external share flow; CSV content was not inspected. |
| SET-09 | Advanced section and Usage Access | Expand advanced settings, grant/revoke access, verify opt-in state and Insights behavior | Not tested | Requires explicit Android system permission flow. |
| SET-10 | Preference persistence | Change a preference, force-stop/relaunch, and verify stored value | Not tested | The charge alert was restored to its original value; restart persistence remains unverified. |

## 5. Cross-tab and platform test cases still needed

These behaviors span more than one screen and are necessary to verify the main user journey:

1. **Charge start:** With app running, connect power; confirm battery mode changes, a charge session starts, Today updates, and Timeline lists the open session.
2. **Charge end:** Disconnect power; confirm the charge session closes and its end level, duration, and rate appear in Timeline.
3. **Discharge start/end:** Repeat unplugged, then reconnect; verify automatic discharge session handling and closed-session analytics.
4. **Process restart/reconciliation:** Force-stop or relaunch while charging/discharging; verify there are no duplicate or lost sessions and that Timeline matches Today.
5. **Persistence:** Restart the app and verify session history, charger memory, settings, notes, and tags persist.
6. **Alerts:** Grant notification permission and cross configured thresholds in both directions; verify notification content, repetition/re-arming, and sound settings.
7. **Native-only capabilities:** Verify sample collection, WorkManager behavior, screen tracking, usage stats, and widget updates individually. Use a physical device where emulator telemetry or Android OEM behavior may differ.
8. **Export:** Generate CSV from non-empty session history, inspect column headers/values and quoting, then verify the Android share sheet opens.
9. **Responsive/accessibility review:** Check scrolling, touch targets, text scaling, content descriptions, and contrast on the emulator.

## 6. Suggested execution order for the next test pass

1. Re-run session persistence and mode-based direction scenarios on a physical Android device.
2. Build a sufficiently long non-empty sample set to validate populated curves, numeric estimates, and health trends.
3. Re-run Timeline details, comparison, charger memory, diary, and CSV export checks using completed sessions.
4. Re-run Insights with real sessions and raw samples rather than only empty states.
5. Verify notification sound, discharge-alert re-arming, and advanced Android permissions/features.
6. Repeat critical scenarios after app restart and across Android versions/OEM devices where possible.

## 7. Test limitations

- Controlled emulator battery overrides exercised state/threshold transitions, but did not generate a complete natural charge/discharge cycle or validate session duration/rate calculations.
- Empty-state screens are evidence that the screens render, not evidence that populated analytics are correct.
- Emulator battery/current readings can be synthetic and may not reflect physical-device behavior.
- Threshold and plug/unplug notification content was verified, but alert sound, discharge-alert re-arming, long-running background work, Usage Access results, and launcher widget updates were not fully verified.
- No usable native sample trend was available, so populated curves, sample-derived charge estimates, and sample-derived health could not be checked. Battery-current estimate accuracy has not been validated on physical hardware.
- Source-level test suites are separate from this manual emulator report; passing unit tests do not prove Android UI or native integration works.
- The Android battery override was reset to 100%, unplugged, 5.00 V, and 25.0°C, and the original dashboard order was restored. The release app is non-debuggable and this emulator does not permit `adb root`, so private AsyncStorage could not be backed up/restored; the E2E-generated session records remain in app storage. No alert-threshold or sound-cue preference changes were made during this verification pass. The app was left on Today.

## 8. Source areas referenced

- Navigation: `frontend/app/(tabs)/_layout.tsx`
- Today: `frontend/app/(tabs)/index.tsx`
- Timeline: `frontend/app/(tabs)/timeline.tsx`
- Insights: `frontend/app/(tabs)/analytics.tsx`
- Settings: `frontend/app/(tabs)/settings.tsx`
- Shared session, persistence, telemetry, and settings state: `frontend/src/hooks/useCycleSense.ts`
- Android notification handling: `frontend/src/notifications.ts`
- Shared domain types: `frontend/src/data/cyclesense.ts`

## 9. Time-to-full estimator implementation follow-up

- **Implementation:** The Android native telemetry bridge now reads `BatteryManager.computeChargeTimeRemaining()` on API 28+ while charging/full. Today prefers a positive, bounded Android estimate, then estimates remaining time from a plausible battery capacity/charge counter and positive battery-side charging current, and finally falls back to the existing recent-percentage-sample estimator.
- **Capacity/current behavior:** The charge counter is treated as remaining charge, not design capacity. When the counter and percentage are plausible, their ratio estimates full capacity; otherwise the native design-capacity value is used. The estimate requires positive current entering the battery, never substitutes charger input wattage, and models a slower phase after 80%. The displayed hint identifies the estimate source; a full battery shows “Fully charged”.
- **Automated validation:** The focused analytics suite passed (36 tests), including source priority, capacity/current math, missing counter, capacity inference, instantaneous-current fallback, invalid/discharging current, unavailable capacity, unavailable/implausible Android estimates, and full state. The frontend TypeScript check and Android release build passed.
- **Emulator validation:** The release build was installed and the Today tile rendered during a controlled charging-state smoke test. The emulator’s previously observed 900 mA current is synthetic and must not be treated as a physically validated charging-current measurement. The “Warming up” path when all estimate sources are unavailable was not exercised.
- **Emulator smoke test:** Built and installed the Android release APK over the existing installation, preserving app storage. With emulator battery forced to 60% and charging, Today showed **1h 26m** with the hint **“Estimate from battery current”**; therefore Android’s built-in estimate was not selected in this test. The emulator continued to report synthetic **900 mA · 4.5 W**, so this only verifies end-to-end wiring/rendering, not estimate accuracy. The battery was restored to **100%, unplugged, 5000 mV, and 25.0°C**, and Today was reopened. The charge-state transition added test activity to the existing app session history.

## 10. Timeline emulator follow-up

- **Session list and live state:** Started with the existing saved session, then forced charge/discharge transitions. Timeline updated to show a live charge session and prior discharge session; after another transition and cold app relaunch it showed **5 recorded sessions**. The active discharge session was marked **LIVE** and began at the emulator’s current 81% level.
- **Session detail:** Opened both live and completed sessions. Detail view showed mode/confidence, start/end times, level change, duration, rate, source, peak current, and diary/tag controls. A controlled 78%→81% charge session showed 3 percentage points gained and a positive derived rate; charge and discharge details rendered.
- **Rate caveat:** One deliberately forced test changed the level from 100% to 80% while Android was set to charging, producing a displayed `-400% / hr`. This is an artifact of an impossible forced battery sequence, not evidence of a natural charging rate. Another brief forced 78%→81% sequence produced a very high projected hourly rate because the test covered about one minute. Emulator overrides are unsuitable for validating real rate accuracy.
- **Comparison:** Selected two sessions. The comparison modal showed its chart, timestamps, per-session rate/duration fields, and the warning that the line is a straight estimate when raw curve samples are absent. Comparison closes normally.
- **Known charger:** A controlled charging transition learned a **Fast charger** entry. Timeline showed **1 known charger**, `Unknown plug · 900 mA peak · avg 1m · 1 use`; a session row also displayed the charger name/category. Opened the rename dialog and verified Cancel. Save/rename and Forget were not tested.
- **Diary and text input:** Session detail showed diary tag chips and an empty note field. Focusing the note field launched Android’s “Try out your stylus” handwriting UI rather than the normal keyboard. The note remained empty; note entry/save and persistence could not be verified. The temporary tag toggle was returned to its initial state.
- **Persistent test data:** The controlled flows left five session rows and one test-learned charger in the emulator app’s storage. No supported safe mechanism was available to restore this release app’s private AsyncStorage; these records were left intact rather than clearing user/app data.
- **Restore:** Emulator returned to **100%, unplugged, 5000 mV, and 25.0°C**. App was left open on Timeline.

## 11. Settings relevance review

- **Keep as core controls:** Charge and discharge alert thresholds directly control notification behavior. Sound cues are a useful mute preference for plug/unplug and threshold alerts. Background sampling supports the Insights curve/history when the app is not active; retain it as an optional battery/background-work tradeoff, rather than making sampling mandatory.
- **Keep as useful convenience:** Dashboard card order changes Today’s layout and was previously verified across tab navigation. CSV export is a practical data-portability/privacy feature, although the share-sheet/CSV contents still need E2E verification.
- **Keep optional and advanced:** App Usage Stats is opt-in and requires Android Usage Access. It supplies weekly app rankings/patterns in Insights and top-app correlation in session details; users who do not want app-level usage collection can leave it off. Keeping it under Advanced is appropriate.
- **Not settings / possible simplification:** The long Device capabilities list is informational diagnostics, not an actionable preference. It adds technical detail and vertical length; consider moving it into Advanced or a diagnostics/about screen rather than deleting capability handling.
- **Accuracy caveat in diagnostics:** `detectCapabilities()` currently marks `rawSamples` and `screenTracking` true whenever the native bridge is active, rather than checking whether those features are actually functioning. It also considers any non-zero current value available, which can include Android sentinel readings. Therefore the displayed “Available on this device” claims are not all verified; correct detection before relying on this list as a user-facing device compatibility report.
- **Static privacy message:** “On-device storage / No account, cloud sync, or backend required” is useful reassurance but is not a control. It can remain as a concise privacy statement or be moved to an About/privacy surface if Settings should contain only actionable items.
- **Recommendation:** Do not remove any of the behavior controls yet. If reducing clutter, first move capability diagnostics and the static storage reassurance out of the main settings flow; keep alerts, mute, background sampling, dashboard order, export, and opt-in Usage Access. This was a relevance/code review, not an interaction test of every switch; no Settings values were changed during this follow-up.

## 12. Insights emulator verification and findings

### Test steps and observed values

1. Opened Insights with the emulator restored to 100%, unplugged. The screen showed the 24H range, a confidence banner, and the Cycle curve panel.
2. **24H / Cycle curve:** The header showed “Charge / discharge” and “Waiting for background samples”; the chart had grid lines but no plotted bars. The section action said “Session summary” because at least one closed session existed. This correctly avoided fake data, but the action/section naming is misleading when there are no raw sample points. A real populated raw-sample curve could not be verified because the emulator’s native sample buffer exposed no usable points.
3. **30D / Health trend:** The chart showed “Needs a few full discharge cycles” and “Awaiting data”. Battery health displayed “— / Needs more history”; baseline displayed “— / Needs 2+ discharge cycles”. This is consistent with the test archive lacking qualifying positive discharge-rate and charge-counter data. The emulator did expose design capacity, but health estimation also needs at least one qualifying discharge with a usable mAh delta; the 30D trend needs at least two.
4. **Digest / Today:** The heading reported **4 sessions**. Visible digest metrics were **Avg drain 0%/hour**, **Avg charge 2m**, **Energy in —**, **Toughest day 10-14**. The habit summary read: “You typically plug in around 3PM, starting at about 89% and ending near 81%.” Screen metrics showed about **19m** screen-on and **12m** longest run during the pass; values changed as the session continued. These figures come from the emulator’s forced test sessions/use and should not be treated as natural battery-performance measurements.
5. **Digest / 5-Day:** The selector changed the title to “5-day digest”; it still showed **4 sessions** and the same metrics because all four qualifying closed test sessions started within the last 24 hours. This confirms the selector/window switched and the available records happened to be common to both windows; it does not validate behavior with records from earlier days.
6. **Weekly screen time:** With Usage Access off, the view correctly showed “Usage access not enabled” and an “Open settings” action. No permission was requested/granted.
7. The emulator was not modified during this Insights pass: it remained at **100%, unplugged, 5000 mV, 25.0°C**. Existing test sessions and the learned charger were preserved.

### Verified use cases

- **Cycle curve (24H):** Intended use is to visualize real battery-level samples collected over roughly the last 24 hours, so the user can inspect observed charge/discharge movement rather than an estimate. Empty sample history properly yields no fabricated curve. Current test history alone does not create raw curve points.
- **24H digest:** Intended use is a compact rollup of completed charge/discharge sessions, drain rates, charge durations, mAh totals when available, and the most/least intense discharge day. It excludes open sessions and covers the rolling 24 hours, not local midnight-to-now.
- **5-Day digest:** Uses a rolling five-day window and compares average drain against the preceding five-day window when both have usable rates.

### Findings / potential defects

- **INS-EMU-01 — Digest chart is empty and its caption contradicts populated digest data (fixed and emulator-verified):** Selecting Digest previously changed the chart label to “Average drain rate”, but the chart data remained undefined because chart data was selected only for 24H or 30D. Its caption still said “Waiting for background samples” while Today’s digest reported four sessions and numeric metrics. Digest mode now omits the unrelated raw-sample chart and identifies the selected digest’s session count instead. The rebuilt release was installed on the emulator; selecting Digest showed “Period digest” and “4 sessions”, retained populated digest metrics (0% average drain, 2m average charge, and toughest day 10-14), and did not show either “Average drain rate” or “Waiting for background samples”. The emulator remained at 100%, unplugged, 5000 mV, and 25.0°C.
- **INS-EMU-02 — Digest metric labels do not match their calculations (fixed and emulator-verified):** “Avg charge” was the average duration of completed charge sessions but claimed “0 → full”; “Energy in” implied charging energy although `mAhDelta` represents charge drawn during discharging. The UI now labels these values “Avg charge time” / “Completed charge sessions” and “Charge drawn” / “Across discharge sessions”, and the mAh total now explicitly includes discharge sessions only. A regression test verifies that a charge-session mAh value is excluded. After rebuilding and installing the release on the emulator, the Digest showed the corrected labels with the existing values (2m average charge time; charge drawn unavailable as `—`); neither the “Energy in” label nor “0 → full” appeared. The device remained at 100%, unplugged, 5000 mV, and 25.0°C.
- **INS-EMU-03 — Daily period is rolling, despite being labeled “Today” (fixed and emulator-verified):** The daily digest includes sessions whose `startAt` falls in the preceding 24 hours; it is not scoped from local midnight. Per the chosen behavior, this rolling calculation is preserved and the UI option is now “24H” with the heading “24-hour digest”. After release installation, the emulator showed “24H” / “24-hour digest” with four sessions, and selecting “5-Day” still changed the heading to “5-day digest”. The emulator remained at 100%, unplugged, 5000 mV, and 25.0°C.
- **INS-EMU-04 — 30D health trend does not filter to 30 days (fixed; regression-tested and emulator-screen verified):** `computeHealthTrend()` now excludes sessions starting before the prior 30 days (and future-dated sessions). A regression test supplies qualifying 60-day and 55-day sessions plus one recent session and confirms the old sessions cannot make a trend appear. The rebuilt emulator showed the expected 30D “Health trend” / “Awaiting data” state because its saved sessions do not have qualifying mAh measurements; the specific cutoff is verified by the test, not by synthetic emulator records. Emulator remained at 100%, unplugged, 5000 mV, and 25.0°C.
- **INS-EMU-05 — 24H curve and Digest section actions say “Session summary” without chart points (fixed and emulator-verified):** With completed sessions but no raw samples, the 24H curve section now says “Awaiting samples” rather than “Session summary”. Digest shows its actual selected-period session count. After release installation, the emulator showed “Cycle curve” / “Awaiting samples” and “Period digest” / “4 sessions”; the raw-sample chart caption remained “Waiting for background samples”. No misleading “Session summary” text remained in Digest.
- **Data quality caveat:** “Avg drain 0%/hour” was mathematically consistent with the forced discharge test records, which included unchanged level over a short interval. It is not evidence of a genuine 0% battery drain rate. The app currently includes zero-valued discharge rates in the Digest average, so zero/near-zero controlled readings can look like a trustworthy average.
- **Automated validation:** Four focused suites passed after the follow-up fixes: analytics, digest, health, and screen-time — **72 tests total**. Regression coverage verifies discharge-only mAh totals and exclusion of health-trend sessions outside the 30-day window. These tests do not verify Android raw sample collection or natural-device measurement accuracy.

### Cross-verification follow-up — 2026-10-14

Reinstalled release UI was revisited on the emulator after the five fixes. The archived AsyncStorage session data was read without modifying it and the visible Digest fields were recomputed from those records.

| Surface / field | Emulator result | Cross-check |
|---|---|---|
| 24H Cycle curve | “Awaiting samples”; no plotted bars; chart caption “Waiting for background samples” | Honest empty state: the native buffer had no usable raw samples. A populated raw-sample curve remains unverified. |
| 30D health trend | “Awaiting data”; health estimate “— / Needs more history”; baseline “— / Needs 2+ discharge cycles” | Expected: saved sessions have no qualifying mAh-backed discharge measurements. The 30-day cutoff itself is covered by the regression test, not emulator history. |
| 24-hour digest | 4 sessions; Avg drain 0%; Avg charge time 2m; Charge drawn “—”; Toughest day 10-14 | Matched the four closed sessions in the rolling 24-hour window: two discharge rates `[0, 0]`, charge durations `[1, 3]` minutes, and no discharge mAh deltas. “10-14” is the display form of the only discharge day, 2026-10-14. |
| 5-day digest | 4 sessions and the same displayed metrics | Matched the saved records because all four closed sessions also fall within 24 hours; this emulator data cannot demonstrate a different 5-day result. |
| Other summary tiles | Average drain 0.0%; screen-on time and longest streak populated (31m and 17m at one capture); baseline and battery health unavailable | The screen-time values are live and can change while the app remains open. “—” for baseline/health is expected without enough qualifying history. |
| Weekly screen time | “Usage access not enabled” with “Open settings” | Expected permission-gated state; Usage Access was left disabled. |

The recomputed Digest values match the UI and the relevant algorithms. However, **not every field has a numeric value**, because the emulator has no raw curve samples, no qualifying mAh-backed health history, and no Usage Access permission. The displayed 0% drain is arithmetically correct for forced test sessions but must not be interpreted as a representative real-device drain rate. No Insights-specific runtime exception or app crash was observed during this recheck; a prior notification custom-sound warning in Android logs is unrelated to Insights.
