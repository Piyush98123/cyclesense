# CycleSense PRD

## Problem statement
Build a mobile-friendly CycleSense app following best coding practices and SOLID principles. The uploaded requirements define CycleSense as an Android-first battery monitoring utility that treats charging and discharging as one continuous timeline, keeps data on-device, and turns raw battery observations into understandable insights.

## Architecture
- **Client:** Expo SDK 57 / React Native with Expo Router and four bottom-tab areas: Today, Timeline, Insights, Settings.
- **State and persistence:** Small feature hook (`useCycleSense`) with local AsyncStorage-backed persistence for settings and session records. No account, backend, or cloud sync by design.
- **Native boundary:** `expo-battery` provides capability-aware live battery level/state when available. Advanced Android-only fields are intentionally represented as unavailable until dedicated native modules are connected.
- **Export:** Local CSV generation through Expo FileSystem and the Android share sheet through Expo Sharing.
- **Design system:** `/app/frontend/src/theme.ts` is the single source for the dark CycleSense palette; screens use themed styles and MaterialCommunityIcons.

## User personas
- **Battery-aware user:** Wants to understand why their device drains quickly without being judged by the app.
- **Power optimizer:** Wants charge/discharge rates, thresholds, and history in one place.
- **Detail-oriented analyst:** Wants raw-sample curves, confidence labels, trends, and portable exports.

## Core requirements (static)
- Live battery percentage and charging/discharging state.
- Unified charge/discharge session timeline and session detail view.
- Raw-sample curve, battery health trend, and digest insight surfaces.
- Customizable dashboard direction and alert/sound settings.
- Local-only persistence that survives app navigation and app restarts.
- Confidence labels for estimated values and neutral, non-alarmist copy.
- CSV export of session history.
- Capability detection and graceful fallback for fields unavailable in Expo/native preview.
- Accessible controls, readable contrast, touch targets of at least 44pt, and responsive phone layout.

## Implemented 2026-09-17
- Replaced the starter screen with the CycleSense dark-first mobile command center.
- Added Today dashboard with live battery state, capability status, telemetry cards, session start/end control, curve placeholder, and privacy notice.
- Added Timeline with empty state, local session creation, persisted history, and bottom-sheet-style session details.
- Added Insights with 24H/30D/Digest range controls, confidence messaging, curve/health/digest chart surfaces, and baseline insight cards.
- Added Settings with sound cue toggle, charging/discharge alert steppers, always-on preference, on-device storage messaging, and CSV share flow.
- Added native-tab support gate for iOS 26+ with classic tab fallback for Android/web and stable automation test IDs.
- Added capability guard for web preview where Expo battery listeners are unavailable.
- Added CycleSense app metadata and installed Expo Battery, FileSystem, Sharing, and Vector Icons dependencies through Expo tooling.
- Verified TypeScript, ESLint, screenshot flow, tab navigation, empty states, session creation/detail flow, settings interactions, and CSV fallback in the mobile preview.

## Implemented 2026-09-17 (native bridge)
- Added local Expo module `modules/cyclesense-native` (Kotlin + Expo Modules API):
  - `CycleSenseNativeModule` exposing `getBatteryTelemetry`, `startBackgroundSampling`, `stopBackgroundSampling`, `isBackgroundSamplingActive`, `getSamples`, `clearSamples`, `hasUsageStatsPermission`, `openUsageStatsSettings`, `getUsageStats` and an `onTelemetryChange` event.
  - `BatteryTelemetry` reader that pulls level, status, plug type, voltage, temperature, technology, health, current-now / average, charge counter and energy counter from BatteryManager sticky intent + system service.
  - `BatterySamplingWorker` (WorkManager `CoroutineWorker`) writing bounded ring buffer via `SampleStore` (SharedPreferences, max 720 samples).
  - `UsageStatsHelper` behind `AppOpsManager.OPSTR_GET_USAGE_STATS` — never queries stats unless permission has been granted by the user in system Settings.
- Added Expo config plugin (`app.plugin.js` + `plugin/withCycleSenseNative.js`) that merges `PACKAGE_USAGE_STATS`, `FOREGROUND_SERVICE`, `RECEIVE_BOOT_COMPLETED` into the AndroidManifest and tags the special permission with `tools:ignore="ProtectedPermissions"`.
- Registered plugin in `frontend/app.json`.
- Wired `useCycleSense` to prefer the native bridge on Android and fall back to `expo-battery` on iOS / web preview; extended `BatteryStatus` with temperature, voltage, current, charge counter, technology, health, plug type.
- Dashboard now shows real Power draw / Temperature / Battery health / Voltage tiles when the native bridge is active, and a "NATIVE" badge in place of "LIVE"; falls back to "Requires native bridge" copy in Expo Go / web preview.
- Settings gained a "Background sampling" toggle (WorkManager, 15 min cadence) and a hidden "Advanced (native only)" section with an opt-in "App usage stats" switch that only requests `PACKAGE_USAGE_STATS` on explicit user action.



## Implemented 2026-09-17 (native cue receiver + home-screen widget)
- **Manifest-registered `PowerBroadcastReceiver`** — listens for `ACTION_POWER_CONNECTED` / `ACTION_POWER_DISCONNECTED`, respects `SharedPreferences` cyclesense.settings/`soundCues`, respects `AudioManager.ringerMode` + `NotificationManager.currentInterruptionFilter` (silent/vibrate/DND all fail closed), then plays a `SoundPool` cue via `goAsync()` + `OnLoadCompleteListener` and releases after 600 ms. Survives force-stop.
- **Bundled audio assets** — Python `wave` generator wrote two real 200 ms mono 22 kHz WAV files in the module's `res/raw`: `cyclesense_plug_in.wav` (rising 660→990 Hz) and `cyclesense_unplug.wav` (falling 990→495 Hz). Users can drop in their own ~200 ms samples with the same file names.
- **Cross-process preferences** — new `CycleSensePrefs` object holds the settings and widget payload the broadcast receiver / widget provider need to read outside the JS process. `useCycleSense` mirrors `settings.soundCues` into it via `CycleSenseNative.setSoundCuesEnabled(enabled)`.
- **Home-screen widget** — `CycleSenseWidgetProvider.kt` + `res/layout/widget_cyclesense.xml` + `res/xml/widget_cyclesense_info.xml` render level %, mode chip (Charging / Discharging), rate `%/hr`, and charger name pulled from prefs. Widget-info: 180×90 dp min, home-screen, resizable, no auto-update.
- **App-driven widget refresh** — `CycleSenseNative.updateWidget(level, rate, mode, chargerName)` persists the snapshot and calls `AppWidgetManager.updateAppWidget` for every placed widget. `useCycleSense` fires it on every level/mode/open-session/charger change.
- **Force-stop resilient widget refresh** — `BatterySamplingWorker` also refreshes the widget after every 15-minute WorkManager tick so it stays warm even when the app has been swiped away.

## Implemented 2026-09-17 (Phase 3 alerts + digest + diary, auto-only sessions)
- **Manual Start/Stop removed** — the Dashboard button is gone. Sessions are 100% auto on plug/unplug. The status card shows a live "auto-tracking" pill ("Plug in the charger to start a session automatically" / "Charge session running · started at N%").
- **Local threshold alerts** — Added `expo-notifications` with a HIGH-importance `cyclesense-alerts` channel (Android 8+) and a foreground handler. `useCycleSense` watches level crossings with `chargeLatch` / `dischargeLatch` refs so alerts never repeat on the same tick and re-arm only when the level moves back into the safe band. Fires at the user-set `chargeAlert` (rising, while charging) and `dischargeAlert` (falling, while discharging).
- **Plug/unplug cue via notifications** — Auto-transition effect fires a subtle "Charger connected" / "Charger disconnected" local notification when `settings.soundCues` is on. Uses the standard system channel so silent/DND automatically suppresses audio.
- **Charge-time digest** — `computeDigest()` (in `src/data/digest.ts`) averages durations of completed charge sessions in the selected window. A session may be a partial charge; this is not necessarily a 0-to-100% charge time.
- **Battery diary** — `Session` gained a `tags: string[] | null` field; the session detail sheet renders a `DiaryEditor` with 6 preset chips (Traveling / Gaming / Hot day / Streaming / GPS / Workout) and a note textarea. `updateSessionDiary(id, patch)` persists via functional `setSessions` + `persistSessions`.

## Implemented 2026-09-17 (Phase 2 real Insights + usage correlation)
- **24h battery curve from raw samples** — `last24HoursOfSamples()` filters the WorkManager-fed native ring buffer to the trailing 24 hours; Insights "Cycle curve" now renders that series with `From N raw samples · Confidence: High/Medium`. Preview falls back to "Native build required for raw samples".
- **Rolling 7-day baseline + anomaly flag** — `computeBaseline()` averages discharge rates from finished sessions in the last 7 days. Each new discharge stores its signed `baselineDeviation`; `isAnomaly()` triggers when |dev| ≥ 20%. Insights swaps the confidence banner for a colored anomaly card ("Faster drain than usual · +32%") when the last discharge was anomalous. Session detail shows a "vs baseline" chip.
- **Time-to-full estimate** — `estimateTimeToFull()` computes a per-minute charge rate from the last ~6 samples and projects it to 100%. Dashboard's fourth tile flips to "Time to full" while charging, otherwise stays "Voltage" / "Since unplugged".
- **mAh drain via charge counter** — Sessions capture `BATTERY_PROPERTY_CHARGE_COUNTER` at start and end; `computeMAhDelta()` returns the consumed capacity in mAh, surfaced in the session detail sheet.
- **Usage-stats correlation** — Extended native `UsageStatsHelper.queryForegroundTime(startMs, endMs)` uses `UsageStatsManager.queryEvents` to compute exact per-package foreground time inside a session window, with friendly labels via `PackageManager`. New async function `getUsageEvents(startMs, endMs)` on the bridge; `useCycleSense` fires it on discharge session end when Usage access is granted and stores the top-3 apps on the session (`topApps: {packageName, label, minutes}[]`). Timeline session detail renders a "Top apps this session" ranked list.
- **Backfill normalizer** — old sessions are lifted into the new schema on load so the UI never has to guard undefined vs null on P2-era fields.

## Implemented 2026-09-17 (Phase 1 foundation completeness)
- **24h battery curve from raw samples** — `last24HoursOfSamples()` filters the WorkManager-fed native ring buffer to the trailing 24 hours; Insights "Cycle curve" now renders that series with `From N raw samples · Confidence: High/Medium`. Preview falls back to "Native build required for raw samples".
- **Rolling 7-day baseline + anomaly flag** — `computeBaseline()` averages discharge rates from finished sessions in the last 7 days. Each new discharge stores its signed `baselineDeviation`; `isAnomaly()` triggers when |dev| ≥ 20%. Insights swaps the confidence banner for a colored anomaly card ("Faster drain than usual · +32%") when the last discharge was anomalous. Session detail shows a "vs baseline" chip.
- **Time-to-full estimate** — `estimateTimeToFull()` computes a per-minute charge rate from the last ~6 samples and projects it to 100%. Dashboard's fourth tile flips to "Time to full" while charging, otherwise stays "Voltage" / "Since unplugged".
- **mAh drain via charge counter** — Sessions capture `BATTERY_PROPERTY_CHARGE_COUNTER` at start and end; `computeMAhDelta()` returns the consumed capacity in mAh, surfaced in the session detail sheet.
- **Usage-stats correlation** — Extended native `UsageStatsHelper.queryForegroundTime(startMs, endMs)` uses `UsageStatsManager.queryEvents` to compute exact per-package foreground time inside a session window, with friendly labels via `PackageManager`. New async function `getUsageEvents(startMs, endMs)` on the bridge; `useCycleSense` fires it on discharge session end when Usage access is granted and stores the top-3 apps on the session (`topApps: {packageName, label, minutes}[]`). Timeline session detail renders a "Top apps this session" ranked list.
- **Backfill normalizer** — old sessions are lifted into the new schema on load so the UI never has to guard undefined vs null on P2-era fields.


- **State-machine reconciliation** — `POWER_STATE_STORAGE_KEY` persists `{ state: IDLE|CHARGING|DISCHARGING, atIso, levelPercent }` on every session start/end. A one-shot boot effect (`reconciledOnBoot` ref) waits for the first real status observation and closes any open session whose mode conflicts with reality — protects against missed broadcasts, app kill mid-charge, and reboot.
- **Device Capability Detector** — `src/data/capabilities.ts` inspects the first native telemetry snapshot to determine which BatteryManager fields (current, voltage, temperature, charge counter, technology, health, raw samples, screen tracking) are usable. Result is stored on the hook and shown in a new "Device capabilities" section on Settings so users can see exactly what their device reports.
- **Screen-on / screen-off tracking** — New Kotlin `BroadcastReceiver` on `ACTION_SCREEN_ON` / `ACTION_SCREEN_OFF`, plus an `isScreenOn` native async function that reads `PowerManager.isInteractive`. JS accumulates on-time in a ref, flushes into the closing session as `screenOnMinutes` / `screenOffMinutes`, and rolls into a per-day `ScreenDaily` (total on-time + longest streak) persisted at `cyclesense:screen-daily`. Insights tab now surfaces "Screen-on time" and "Longest streak" tiles.
- **Raw sample ring buffer wired to JS** — `refreshSamples()` pulls from native `getSamples(200)` on mount and every 60s. `ChartFrame` now accepts a `data` prop and renders variable-height bars; Insights "Cycle curve" chart uses the actual sample series with a live "From N raw samples · Confidence: High/Medium" caption. Fallback caption in preview: "Native build required for raw samples."
- **CSV export** extended with `charger_name`, `screen_on_minutes`, `screen_off_minutes` columns.

## Implemented 2026-09-17 (auto sessions + rolling 5 cap)
- Added mode-transition watcher in `useCycleSense`: plug in (unplugged → charging/full) automatically opens a charge session; unplug closes whichever session is running. Uses a `previousMode` ref and a busy flag so the two async calls (endSession → startSession) don't race.
- Refactored `startSession` / `endSession` to functional `setSessions` so they compose safely within a single tick.
- Introduced `SESSION_HISTORY_LIMIT = 5` shared constant. `persistSessions` now caps to the newest 5 on every write, and the initial load also caps. Older sessions drop off silently as newer ones arrive.
- Manual "Start / End session" button on Dashboard remains as an override (e.g., manual discharge tracking or ad-hoc cycles).
- Copy updates: Dashboard subtitle "Auto-tracks every plug and unplug"; Timeline empty state "Plug in your device and CycleSense will automatically capture the charge session. Only the last 5 sessions are kept on device."; Session history chip now reads "Last 5".


- Added `src/data/charger-memory.ts`: fingerprint matching, rolling-average merge, default name suggestion, and start-of-session prediction based on plug + voltage.
- Extended `Session` with `chargerId` / `chargerName`, and added a persistent `Charger` library (`cyclesense:chargers`).
- `useCycleSense` now:
  - On charge start, guesses a known charger (plug + start voltage) and shows a **greeting banner** on Dashboard ("Your Desk fast charger is back" / "New charger detected").
  - On charge end, finalizes match using peak current, merges rolling averages, increments usage count, or creates a new entry with a default name (e.g. "USB standard charger", "Wireless fast charger #2").
- Timeline gained:
  - "Known chargers" section with per-charger card (plug icon, category-tinted, peak mA, plug type, use count).
  - Tap-to-rename modal with a "Forget" button (removes the fingerprint).
  - Session rows now use the friendly charger name as the title when known, with the charger badge kept for category.
- Dashboard shows the transient greeting banner (auto-dismisses after 7s, tap to dismiss).


- Added `SessionForegroundService` (Kotlin, `foregroundServiceType="dataSync"`, silent low-priority notification channel) that runs while a session is open so the OS won't tear down sampling mid-charge.
- Exposed `startSessionForeground(mode, startLevel)` / `stopSessionForeground()` on `CycleSenseNativeModule`; `useCycleSense` invokes them automatically at session start and end when the native bridge is active.
- Extended the config plugin with `POST_NOTIFICATIONS` (API 33+) and `FOREGROUND_SERVICE_DATA_SYNC` (API 34+), declared `<service>` in the module manifest so it merges into the app manifest.
- Added charger fingerprint: `classifyCharger` (in `src/data/cyclesense.ts`) tags each finished charge session as `fast` / `standard` / `slow` / `trickle` using observed %/hr with peak charging current (µA) as a tiebreaker; labels are prefixed with the plug type ("Ac · Fast charger", "Usb · Slow charger", "Wireless · Standard charger").
- Sessions now persist `startVoltageMv`, `peakCurrentMicroA`, `chargerLabel`, `chargerCategory`. A running peak-current ref bumps whenever native telemetry pushes a higher magnitude, so the classifier sees the true peak rather than just endpoint samples.
- Timeline row shows a color-coded charger badge (accent for fast, info for standard, warning for slow, muted for trickle) and the session detail sheet gets new "Charger" and "Peak current" rows.


### P0 — Required native extensions
- Add an Android native module for BatteryManager current, voltage, temperature, charge counter, energy, and cycle count.
- Add Android UsageStatsManager permission flow and per-discharge app activity correlation.
- Replace manual session start/end with resilient BroadcastReceiver state transitions that reconcile after reboot/app kill.
- Add WorkManager-backed low-overhead raw snapshots and digest calculation.

### P1 — Product depth
- Connect raw snapshots to real curve and health trend charts with scrubber interaction.
- Add rolling 7-day baseline and anomaly comparison language.
- Add Android SoundPool cues with silent/DND detection.
- Add native always-on display mode and Jetpack Glance live widgets.
- Add configurable dashboard card ordering.

### P2 — Extensions
- Add NetworkStatsManager per-app data usage correlation.
- Add optional battery diary tags/notes editing from session detail.
- Add daily/weekly/monthly notification digests and charger-type comparisons.
- Add more device capability diagnostics and a first-run explanation flow.

## Next tasks
1. Build the Android native capability bridge and wire real voltage/current/temperature fields.
2. Add UsageStats permission onboarding and app activity records.
3. Implement event-driven session reconciliation and background sampling.
4. Replace empty chart states with raw-sample-backed visualizations as data accumulates.