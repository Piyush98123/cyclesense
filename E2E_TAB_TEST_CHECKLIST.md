# CycleSense Android End-to-End Test Checklist

Use this checklist to exercise the four app tabs on a real Android phone. It focuses on observable behavior and data consistency across tabs, not just whether each screen opens.

## Test run details

- Date/time:
- Tester:
- Phone / Android version:
- App version or build commit:
- Build type: `release` / `debug`
- Native bridge active: `yes` / `no`
- Notification permission granted: `yes` / `no`
- Usage access granted: `yes` / `no` / `not tested`
- Background sampling enabled: `yes` / `no`

Mark each item `[x]` for pass, `[!]` for a defect, or `[n/a]` when the feature is unavailable or intentionally skipped. Add evidence and notes in the result log at the end.

## 1. Before testing

- [ ] Install the build containing the change under test; do not assume an older build on the phone contains it.
- [ ] Open CycleSense and allow it to finish loading. Confirm Today shows a plausible battery level and the correct charging state.
- [ ] Confirm the app is a native Android build if testing native telemetry, raw samples, background sampling, or Usage Access.
- [ ] Record current Charging alert, Discharge alert, Sound cues, Background sampling, Usage stats, and Dashboard order settings so they can be restored.
- [ ] Use ordinary charging and normal phone use for battery behavior. Do **not** use Android battery overrides on a physical phone.
- [ ] Keep the phone at a safe temperature and use a known-good charger. Stop if the device gets unusually hot or reports a battery/charging warning.
- [ ] Avoid clearing app data or uninstalling during a run unless intentionally testing a clean install; those actions erase local sessions and charger history.
- [ ] If testing notifications, grant notification permission and check that system Do Not Disturb or channel settings will not suppress them.
- [ ] If testing CSV export, use a share target that lets you inspect the file without publishing or sending it to an unintended recipient.

## 2. Today tab

### A. Startup and live status

- [ ] Open Today from each other tab. The page returns without getting stuck in loading.
- [ ] Compare the percentage and charging/discharging/full state with the Android status bar or system battery settings.
- [ ] Confirm the Native/Live indicator agrees with whether this is a native build.
- [ ] When charging or discharging begins, confirm the matching session-running message appears and its start percentage is plausible.
- [ ] Tap Refresh. The card updates or remains consistent; it does not reset a valid session or show a fabricated value.
- [ ] Scroll through the complete dashboard. Visible cards follow the configured dashboard order.

### B. Charging estimate (live charging broadcasts)

- [ ] Set the Charging alert below the current battery level (for example, 55% when the phone is at 65%). This avoids the time-to-alert hint masking the estimate source.
- [ ] Plug in while Today is open. Confirm the state changes to Charging and a charge session starts.
- [ ] Note start time, battery percentage, Time to full, displayed current, and estimate-source hint.
- [ ] Keep the app in the foreground while charging. After several live battery updates and a measurable level increase, confirm the estimate changes from “No reliable estimate yet”/“Warming up” to a numeric value.
- [ ] Confirm the displayed source is one of the available estimate paths (Android estimate, battery-current estimate, or sample-derived estimate). A value need not appear before enough valid telemetry is available.
- [ ] As the battery rises, confirm the estimate is refreshed and remains non-negative and finite; it should not jump to an implausible multi-day value from a brief/noisy level change.
- [ ] Compare against actual elapsed time and level change. Treat the ETA as an estimate, not a guarantee: Android may taper charging near full, and device use/temperature can alter the rate.
- [ ] With the alert still below the current level, verify the hint identifies the estimate source rather than showing time-to-alert.
- [ ] Restore the original Charging alert after this test.

### C. Charge threshold notification

- [ ] Choose a temporary Charging alert just above the current battery level (stepper changes are 5 percentage points).
- [ ] Leave Today active and charge through that threshold, if practical.
- [ ] Confirm the charge alert triggers once, at or just after crossing the configured threshold.
- [ ] Keep charging above the threshold. Confirm the same crossing does not repeatedly alert.
- [ ] Unplug and reconnect only if needed for a second controlled test; do not infer one notification per screen refresh.
- [ ] Restore the original threshold and Sound cues setting.

### D. Unplug, discharge, and threshold behavior

- [ ] Unplug. Confirm the state changes to Discharging, the charge session closes, and the open-session message changes appropriately.
- [ ] Let the phone discharge through normal use. Confirm the level moves in the expected direction and the discharge session records.
- [ ] If safely practical, set a temporary Discharge alert above the current level and test the downward crossing only when the phone naturally passes it. Do not deliberately drain the battery to a low level just to force the test.
- [ ] Confirm the discharge alert triggers once on a crossing and does not repeat while remaining below the threshold.
- [ ] Restore the original Discharge alert and Sound cues settings.

### E. Other Today cards

- [ ] Power/current direction agrees with Charging or Discharging mode. Treat current magnitude and direction as separate facts.
- [ ] Voltage and temperature are shown only when the device reports usable values.
- [ ] Battery health is labelled as estimated/reported and shows its confidence or history caveat. It is not expected to change just because the phone charged; the estimate uses qualifying past discharge history.
- [ ] Live curve appears when sufficient samples exist; otherwise an honest waiting/empty state is shown.
- [ ] If a charger greeting appears, its known/new wording is plausible and dismissing it works.

## 3. Timeline tab

### A. Session list and persistence

- [ ] Open Timeline during a charge or discharge session. Confirm the active session is marked LIVE and starts at a plausible level/time.
- [ ] Close the session through a real plug/unplug transition. Confirm it becomes a completed row with start/end levels, duration, and rate where calculable.
- [ ] Confirm charge and discharge rows are labelled correctly and ordered consistently.
- [ ] Navigate away and back. Confirm the session remains present.
- [ ] Force-close and reopen the app (without clearing data). Confirm completed sessions and the actual current open session are reconciled without duplicates or stale LIVE records.
- [ ] Confirm the recorded-session count and known-charger count agree with the visible rows.

### B. Session details and diary

- [ ] Tap a completed session. Verify mode, confidence, start/end, level change, duration, rate, and source are internally consistent with its row.
- [ ] For a charge session, verify charger details and peak current appear only when recorded.
- [ ] For a discharge session, verify mAh, screen-time, baseline-deviation, and top-app details appear only when those data are available; missing optional data is not presented as a measured zero.
- [ ] Toggle one diary tag. Confirm selection is visible immediately, close and reopen the detail, and confirm it persisted.
- [ ] Remove the tag and confirm removal persists.
- [ ] Add a short diary note, dismiss the keyboard/field, close and reopen the detail, and confirm the note persists.
- [ ] Clear the note and confirm the empty note remains cleared.

### C. Charger memory and comparison

- [ ] After a completed charging session with sufficient charger data, confirm a known-charger entry appears or an existing entry's use/average data updates.
- [ ] Tap a charger and rename it to a temporary recognizable name. Save, close, and confirm the new name appears in the charger list and relevant session rows.
- [ ] If testing Forget, use only a disposable/test-learned charger. Confirm it disappears; do not forget a real charger the tester wants to retain.
- [ ] When at least two sessions exist, enter Compare, select two rows, and open the comparison.
- [ ] Confirm both sessions' rates and durations match their details. If real curves are absent, confirm the UI discloses the straight-line estimate fallback.
- [ ] Close comparison and cancel comparison mode; confirm the list remains usable.

## 4. Insights tab

### A. Range selector and curves

- [ ] Select 24H. Confirm the chart/caption reflects available recent raw samples or displays a clear waiting/native-build state when samples are unavailable.
- [ ] Select 30D. Confirm the screen shows a health trend only when qualifying recent discharge history and design capacity exist; otherwise the empty-state explanation is clear.
- [ ] Select Digest. Confirm the chart is hidden and period summary content is shown.
- [ ] Switch back and forth between ranges. The selected range and chart title/caption update together without stale or mismatched content.

### B. Baseline, health, and digest metrics

- [ ] With fewer than two completed discharge sessions in the last seven days, Baseline shows unavailable and explains that more discharge history is needed.
- [ ] After two or more recent completed discharge sessions with valid positive drain rates, confirm a 7-day baseline appears. Old sessions and charge sessions must not count.
- [ ] Confirm anomaly messaging appears only for a qualifying completed discharge session with a stored deviation beyond the app's threshold; it should name the direction and comparison period without asserting a cause.
- [ ] Battery health is a discharge-history estimate and is not expected to vary during one charging session. Where available, verify its confidence/history qualifier.
- [ ] Select the 24H digest. Only closed sessions started in the rolling last 24 hours count.
- [ ] Select the 5-Day digest. Confirm current and prior 5-day windows drive the trend comparison; data outside those windows do not affect the period figures.
- [ ] Avg charge time is based on completed charge-session durations in the selected digest window, including partial charges. It is **not** necessarily a 0–100% charge time. With no completed charge session in the window, expect “—”.
- [ ] Charge drawn includes discharge-session mAh only; a charge session's mAh field must not inflate it.
- [ ] If there are no qualifying discharge sessions, expect unavailable drain/baseline values rather than misleading zeros.
- [ ] Charging-habits text appears only with charge-session history and describes observed behavior neutrally.

### C. Screen time and optional app usage

- [ ] Screen-on time and longest streak increase while the screen is on and remain plausible after screen-off.
- [ ] If Usage Stats is off or permission is not granted, Weekly screen time explains the empty/opt-in state.
- [ ] If intentionally testing Usage Access, enable it in Settings/system settings, return to CycleSense, re-check permission, and confirm Insights can populate app ranking after data is available.
- [ ] Revoke Usage Access afterward if it was granted only for this test, then return the app preference to its original state.

## 5. Settings tab

### A. Alerts and sound

- [ ] Toggle Sound cues off and on. The switch reflects the saved state after navigating away and returning.
- [ ] Increase and decrease Charging alert and Discharge alert. Each step changes by 5 points.
- [ ] Verify neither threshold can be set below 5% or above 100%.
- [ ] Confirm changing thresholds affects Today/alert crossing behavior; restore the original values after testing.

### B. Sampling and dashboard order

- [ ] On a native Android build, enable Background sampling. Confirm the setting remains on after leaving and returning; raw samples may take time to accumulate because the worker uses a 15-minute cadence.
- [ ] Disable Background sampling and confirm it remains off. The live foreground charging estimate should not depend on this optional setting.
- [ ] In Dashboard order, move a card up/down. Return to Today and confirm the order is updated.
- [ ] Navigate away and return to Settings; confirm order persisted. Restore the original order.
- [ ] On a non-native/preview build, confirm the native-only sampling control is disabled or clearly unavailable.

### C. Capabilities, privacy, export, advanced

- [ ] Review Device capabilities. Values should describe device support without claiming that a feature is currently producing useful data; note any mismatch as a defect.
- [ ] Confirm the app describes session data as stored on-device with no account/cloud requirement.
- [ ] Tap Export session history. Confirm the share sheet opens with a CSV and the app reports success, or provides a clear unavailable reason.
- [ ] Inspect the CSV privately: headers are present; completed and open sessions export without malformed rows; commas/quotes in diary text remain properly quoted.
- [ ] Open Advanced. Confirm Usage Stats is opt-in and off by default unless explicitly enabled.
- [ ] If testing Usage Access, verify the permission handoff, return to CycleSense, use Re-check permission, and confirm the setting reflects the granted state.
- [ ] If permission is denied, confirm the app remains usable and Insights shows an appropriate empty/permission state.
- [ ] Hide Advanced and confirm it collapses cleanly.

## 6. Cross-tab end-to-end scenarios

### Scenario A — One complete natural charge cycle

- [ ] Start with the phone unplugged and note its level.
- [ ] Open Today and connect a charger. Verify Charging state, a live charge session, and live estimate behavior.
- [ ] Keep Today foregrounded during charging long enough to observe at least two changing battery readings. Record the ETA source and whether numeric ETA appears.
- [ ] Open Timeline during the charge and verify the same active session is listed as LIVE.
- [ ] Open Settings and return; verify charge state/session is still correct and dashboard preferences remain applied.
- [ ] Finish charging or stop at a safe convenient level, then unplug. Verify the charge session closes.
- [ ] In Timeline, open the closed charge and check its duration, levels, rate, and charger metadata.
- [ ] In Insights, confirm the completed session contributes to the digest only when it falls in the selected time window. Do not expect it alone to create a discharge baseline.
- [ ] Reopen the app and confirm the closed session persists.

### Scenario B — Discharge session and baseline eligibility

- [ ] Use the phone normally while unplugged until a discharge session closes naturally.
- [ ] Confirm Timeline records it as a discharge with a plausible duration/rate.
- [ ] In Insights, verify this one discharge alone does not satisfy the two-session 7-day baseline requirement.
- [ ] After a second qualifying discharge session is recorded within seven days, confirm the baseline can appear.
- [ ] If the device provides valid charge-counter deltas and design capacity, check that health/trend eligibility follows its history requirements. Missing telemetry should remain an unavailable state, not fabricated data.

### Scenario C — Settings persistence and app restart

- [ ] Change one reversible preference (for example dashboard order or alert level).
- [ ] Navigate across all four tabs, then force-close/reopen the app.
- [ ] Confirm the preference persisted, and verify relevant Today/Insights behavior reflects it.
- [ ] Restore the preference to its recorded original value.

## 7. Results and defect notes

| Case | Pass / fail / n/a | Evidence (screenshot, time, session values) | Notes / issue ID |
|---|---|---|---|
| Before testing | | | |
| Today: live status | | | |
| Today: charging estimate | | | |
| Today: alerts / unplug | | | |
| Timeline: sessions / persistence | | | |
| Timeline: detail / diary | | | |
| Timeline: charger / compare | | | |
| Insights: ranges / curves | | | |
| Insights: baseline / health / digest | | | |
| Insights: optional app usage | | | |
| Settings: alerts / cues | | | |
| Settings: sampling / card order | | | |
| Settings: export / privacy / advanced | | | |
| Cross-tab scenarios | | | |

For each defect, record the app build, Android version, exact steps, expected result, actual result, timestamp, and a screenshot where possible. Do not include private app-usage details, account information, or other personal data in shared evidence.

## 8. Finish and restore

- [ ] Restore original alert thresholds, Sound cues, Background sampling, Usage Stats, and Dashboard order.
- [ ] Restore the original charger name if it was edited; remove only disposable test chargers if desired.
- [ ] Remove temporary diary notes/tags added only for testing.
- [ ] Leave real session history intact unless the owner explicitly wants test records removed.
- [ ] If testing generated unusually fast/slow rates using an emulator or forced state, label those sessions as synthetic; do not use them as physical-device performance evidence.
- [ ] Note any settings or test data that could not be restored safely.
