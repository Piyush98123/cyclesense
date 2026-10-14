# CycleSense - Tab-wise Functionality and Value Flow

This document explains how each navigation tab in the app works, what fields are displayed on each tab, and where the values come from.

## 1. Navigation structure

The app has four main navigation tabs:

1. Today
2. Timeline
3. Insights
4. Settings

The tab layout is defined in:
- `frontend/app/(tabs)/_layout.tsx`

The actual behavior for each tab is driven mainly by the shared hook:
- `frontend/src/hooks/useCycleSense.ts`

The app uses a single shared state model for battery telemetry, sessions, settings, chargers, samples, and analytics results. The values shown in each tab are mostly computed from this hook and the data files in:
- `frontend/src/data/cyclesense.ts`
- `frontend/src/data/analytics.ts`
- `frontend/src/data/health.ts`
- `frontend/src/data/digest.ts`
- `frontend/src/data/screen-time.ts`

---

## 2. Shared source of data: useCycleSense

The hook `useCycleSense()` is the main data provider for the entire app.

### Key state values exposed by the hook

- `status`: current battery telemetry
- `sessions`: list of charge/discharge session records
- `settings`: user-configurable preferences
- `chargers`: known chargers and charger signatures
- `samples`: rolling native telemetry samples
- `screenDaily`: daily screen-on totals
- `capabilities`: indicates which features are available on the current device
- `batteryHealth`: derived estimate of battery health
- `openSession`: currently active session (if any)
- `ready`: app has finished loading persisted data

### How these values are populated

#### 1) Battery status
The value is loaded in `refresh()`:
- If native Android bridge is active, it calls `CycleSenseNative.getBatteryTelemetry()`.
- Otherwise, it uses Expo `Battery.isAvailableAsync()` and `Battery.getPowerStateAsync()`.

This sets the `status` object with values such as:
- `level`
- `mode`
- `temperatureCelsius`
- `voltageMv`
- `currentNowMicroA`
- `chargeCounterMicroAh`
- `technology`
- `healthLabel`
- `pluggedLabel`
- `nativeBridge`

#### 2) Sessions
Session values are loaded from `AsyncStorage` using keys like:
- `SESSION_STORAGE_KEY`
- `CHARGER_STORAGE_KEY`
- `SETTINGS_STORAGE_KEY`
- `SCREEN_DAILY_STORAGE_KEY`
- `POWER_STATE_STORAGE_KEY`

`startSession()` creates a new `Session` object with fields such as:
- `id`
- `mode`
- `startAt`
- `startLevel`
- `chargerId`
- `chargerName`
- `chargerType`
- `startVoltageMv`
- `startChargeCounterMicroAh`
- `curve`
- `confidence`

`endSession()` updates the same session with values like:
- `endAt`
- `endLevel`
- `durationMinutes`
- `rate`
- `peakCurrentMicroA`
- `chargerLabel`
- `chargerCategory`
- `screenOnMinutes`
- `screenOffMinutes`
- `mAhDelta`
- `baselineDeviation`
- `topApps`
- `curve`

#### 3) Settings
Settings are read from local storage and merged with `defaultSettings`:
- `soundCues`
- `chargeAlert`
- `dischargeAlert`
- `backgroundSampling`
- `usageStatsEnabled`
- `dashboardOrder`

#### 4) Charger recognition
When a charging session closes, the app tries to match current fingerprint data to known chargers:
- `findMatchingCharger()`
- `mergeChargerFingerprint()`
- `createChargerFromFingerprint()`
- `suggestChargerName()`

This creates/updates the `chargers` list with fields like:
- `id`
- `name`
- `category`
- `plugLabel`
- `avgPeakMa`
- `avgVoltageMv`
- `avgDurationMinutes`
- `uses`
- `createdAt`
- `lastUsedAt`

---

## 3. Today tab

File:
- `frontend/app/(tabs)/index.tsx`

### Main purpose
The Today tab is the home dashboard. It shows the current battery state and session context in one place.

### Exact fields shown and source logic

#### A. Live status card
Fields:
- `status.mode` → label rendered using `modeLabel(status.mode)`
- `status.level` → used to calculate current battery percentage
- `status.available` → determines whether battery data is live or capability-gated
- `nativeBridgeActive` → determines if it says `NATIVE` or `LIVE`
- `openSession` → shows whether a session is currently running

Logic:
- `status` comes from `useCycleSense` telemetry refresh.
- `openSession` is computed from `sessions.find((session) => session.endAt === null)`.
- `autoStatus` is built as:
  - if `openSession` exists, show `Charge session running · started at X%` or `Discharge session running ...`
  - otherwise show `Plug in the charger to start a session automatically`

#### B. Quick telemetry cards
Exactly used values:
- `status.currentNowMicroA`
- `status.voltageMv`
- `status.temperatureCelsius`
- `status.healthLabel`
- `batteryHealth.healthPercent`
- `timeToFullMinutes`
- `settings.chargeAlert`
- `samples`

Logic:
- `powerDrawWatts = estimateWatts(status.currentNowMicroA, status.voltageMv)`
- `health` is derived from `batteryHealth.healthPercent` if available else `status.healthLabel`
- `fourthLabel` and `fourthValue` switch depending on whether the device is charging or not
- `estimateTimeToTarget(samples, currentLevelPercent, settings.chargeAlert)` calculates how long until the user alert threshold is reached

#### C. Charger greeting banner
Fields:
- `chargerGreeting.name`
- `chargerGreeting.kind`
- `chargerGreeting.category`

Logic:
- Set when charger matching occurs in `endSession()` or when the app learns a new charger.
- A known charger renders: `Your <name> is back`
- A new charger renders: `Remembering "<name>"`

#### D. Live curve card
Fields:
- `samples`
- `curveSamples`
- `curveData`
- `curveCaption`

Logic:
- `samples` is filtered, sorted by timestamp, and capped to last 30 samples.
- This creates the visual battery curve for the current session or recent native telemetry window.

#### E. Important Today-tab metadata
The app also shows:
- current battery percentage
- current charging/discharging status
- session auto-tracking state
- whether native battery bridge is active
- capability detection state

This is all derived from the shared device telemetry plus the auto tracking logic in `useCycleSense`.

---

## 4. Timeline tab

File:
- `frontend/app/(tabs)/timeline.tsx`

### Main purpose
The Timeline tab shows historical sessions and known chargers, letting the user review what happened over time.

### Exact fields shown and source logic

#### A. Summary row
Fields:
- `sessions.length`
- `chargers.length`

Logic:
- `sessions` is the persisted local session list.
- `chargers` is the persisted charger memory list.

#### B. Known chargers list
Each charger row displays:
- `charger.name`
- `charger.category`
- `charger.plugLabel`
- `charger.avgPeakMa`
- `charger.avgVoltageMv`
- `charger.avgDurationMinutes`
- `charger.uses`

Logic:
- populated from the `chargers` state
- stored in local storage under `CHARGER_STORAGE_KEY`
- created/updated through `createChargerFromFingerprint()` or `mergeChargerFingerprint()` inside session closure logic

#### C. Session history rows
Each row displays:
- `session.chargerName ?? session.mode label`
- `session.mode`
- `session.startAt`
- `session.endAt`
- `session.startLevel`
- `session.endLevel`
- `session.durationMinutes`
- `session.rate`
- `session.confidence`
- `session.chargerLabel`
- `session.chargerCategory`

Logic:
- `sessions` array is created in `startSession()` and closed in `endSession()`.
- `rate` is computed as:
  - charge: `delta / (durationMinutes / 60)`
  - discharge: same formula, based on level change over duration
- `confidence` is assigned based on whether native bridge is present and telemetry quality.

#### D. Session detail modal
When a session is selected, it displays more detail:
- `selected.mode`
- `selected.confidence`
- `selected.startAt`
- `selected.endAt`
- `selected.startLevel`
- `selected.endLevel`
- `selected.durationMinutes`
- `selected.rate`
- `selected.chargerName`
- `selected.chargerLabel`
- `selected.chargerCategory`
- `selected.startVoltageMv`
- `selected.peakCurrentMicroA`
- `selected.screenOnMinutes`
- `selected.screenOffMinutes`
- `selected.mAhDelta`
- `selected.baselineDeviation`
- `selected.topApps`
- `selected.note`
- `selected.tags`
- `selected.curve`

Logic:
- `selected` is chosen from `sessions` by user tap.
- `curve` is captured from native samples within the session timestamp window using `samples.filter(...)` in `endSession()`.
- `topApps` is populated only for discharge sessions if usage stats permission is granted.
- `baselineDeviation` is computed using `computeBaseline()` and `baselineDeviation()` over prior sessions.

#### E. Compare mode
Fields used:
- `compareIds`
- `compareSessions`

Logic:
- The user selects two sessions for comparison.
- `normalizeCurve(session, points)` is used to align sessions of different durations on the same axis for comparison overlays.

---

## 5. Insights tab

File:
- `frontend/app/(tabs)/analytics.tsx`

### Main purpose
The Insights tab converts raw battery telemetry and historical session data into readable analytics and summaries.

### Exact fields shown and source logic

#### A. Range selector
Supported ranges:
- `24H`
- `30D`
- `Digest`

Logic:
- The selected range is local tab state: `range`
- `24H` uses the last 24 hours of raw samples
- `30D` uses health trend data
- `Digest` uses `computeDigest()`

#### B. 24H chart
Fields involved:
- `samples`
- `filteredSamples`
- `curve`

Logic:
- `last24HoursOfSamples(samples, 24)` filters the native telemetry data into the last 24 hours.
- `curve` is built as a list of battery levels for charting.

#### C. 30D chart
Fields involved:
- `sessions`
- `status.designCapacityMah`
- `healthTrend`

Logic:
- `computeHealthTrend(sessions, status.designCapacityMah)` creates a trend curve representing estimated battery health behavior over time.
- This chart differs from the 24H raw-sample curve because it summarizes session history rather than raw telemetry.

#### D. Digest analytics
Computed values:
- `digest = computeDigest(sessions, digestPeriod)`
- `habits = computeChargingHabits(sessions)`
- `habitSummary = describeChargingHabits(habits)`

These produce summary values such as:
- average drain rate
- trend direction
- change % compared to previous period
- charging habit summary
- battery health / period trend insights

#### E. Average drain card
Fields:
- `sessions`
- `s.rate`
- `s.mode`

Logic:
- `rateSum` sums discharge sessions’ rates
- `rateCount` counts relevant sessions
- `averageDrain` is derived as `rateSum / rateCount`

#### F. Screen usage metrics
Fields:
- `screenDailyLive.totalOnMinutes`
- `screenDailyLive.longestOnMinutes`
- `capabilities.screenTracking`

Logic:
- Screen on/off transitions are tracked by the native bridge and screen listeners in `useCycleSense`.
- These values are aggregated into the daily screen metric.

#### G. Baseline card
Fields:
- `baseline`
- `sessions`

Logic:
- `computeBaseline()` calculates the average discharge behavior.
- `baseline` is displayed as a 7-day discharge average.

#### H. Anomaly card
Fields:
- `lastDischarge.baselineDeviation`
- `isAnomaly(lastDischarge.baselineDeviation)`

Logic:
- If a discharge session deviates strongly compared to historical baseline, the UI shows an anomaly alert.

#### I. Weekly app ranking and weekday/weekend pattern
Fields:
- `weeklyUsageStats`
- `settings.usageStatsEnabled`
- `nativeBridgeActive`
- `hasUsageStatsPermission()`

Logic:
- If native bridge is active and usage stats permission is granted, the app calls:
  - `CycleSenseNative.getUsageStats(7)`
- Then computes:
  - `computeWeeklyAppRanking(weeklyUsageStats, 5)`
  - `computeWeekdayWeekendPattern(weeklyUsageStats, 7)`

These values are used to describe which apps dominate usage and whether usage differs by weekday vs weekend.

---

## 6. Settings tab

File:
- `frontend/app/(tabs)/settings.tsx`

### Main purpose
The Settings tab gives users control over app behavior, thresholds, export, and advanced native features.

### Exact fields shown and source logic

#### A. Alerts & cues
Fields:
- `settings.soundCues`
- `settings.chargeAlert`
- `settings.dischargeAlert`

Logic:
- `updateSettings({ soundCues: value })` toggles sound cue behavior.
- `threshold()` adjusts the alert thresholds in increments of 5, clamped between 5 and 100.
- `sendBatteryAlert()` triggers device notifications or cues when thresholds are crossed.

#### B. Background sampling
Fields:
- `settings.backgroundSampling`
- `nativeBridgeActive`

Logic:
- Only available if native Android bridge is active.
- `updateSettings({ backgroundSampling: value })` saves the preference.
- Native code uses WorkManager to capture data periodically.

#### C. Dashboard order
Fields:
- `settings.dashboardOrder`

Logic:
- A reorderable list of cards:
  - `status`
  - `telemetry`
  - `curve`
- `moveDashboardCard()` swaps the order in pure, testable logic.

#### D. Device capabilities list
Fields:
- `capabilities.current`
- `capabilities.voltage`
- `capabilities.temperature`
- `capabilities.chargeCounter`
- `capabilities.technology`
- `capabilities.health`
- `capabilities.rawSamples`
- `capabilities.screenTracking`
- `capabilities.cycleCount`
- `capabilities.designCapacity`

Logic:
- `detectCapabilities()` reads the current native or fallback environment and populates which features are available.
- The UI lists them in `capabilityLabels` and marks each as available or unavailable.

#### E. Data & privacy
Fields:
- `exportCsv()` result
- local device-only storage messaging

Logic:
- CSV export is created using local session data and Expo FileSystem + Sharing.
- The app explicitly communicates that storage is on-device and does not require a remote backend.

#### F. Advanced / native-only options
Fields:
- `settings.usageStatsEnabled`
- `hasUsageStatsPermission()`

Logic:
- Only when native Android bridge is active and the user confirms permission.
- `requestUsageStats()` triggers the Android permission flow.
- If granted, usage stats are used for app-ranking and screen usage analysis.

---

## 7. Exact data model fields used in the app

The core data model is defined in `frontend/src/data/cyclesense.ts`.

### BatteryStatus
- `available`
- `level`
- `mode`
- `lowPowerMode`
- `updatedAt`
- `temperatureCelsius`
- `voltageMv`
- `currentNowMicroA`
- `currentAverageMicroA`
- `chargeCounterMicroAh`
- `technology`
- `healthLabel`
- `pluggedLabel`
- `nativeBridge`
- `cycleCount`
- `designCapacityMah`

### Session
- `id`
- `mode`
- `startAt`
- `endAt`
- `startLevel`
- `endLevel`
- `durationMinutes`
- `rate`
- `confidence`
- `chargerType`
- `chargerLabel`
- `chargerCategory`
- `chargerId`
- `chargerName`
- `startVoltageMv`
- `peakCurrentMicroA`
- `screenOnMinutes`
- `screenOffMinutes`
- `startChargeCounterMicroAh`
- `endChargeCounterMicroAh`
- `mAhDelta`
- `topApps`
- `baselineDeviation`
- `note`
- `tags`
- `curve`

### Charger
- `id`
- `name`
- `category`
- `plugLabel`
- `avgPeakMa`
- `avgVoltageMv`
- `avgDurationMinutes`
- `uses`
- `createdAt`
- `lastUsedAt`

### CycleSettings
- `soundCues`
- `chargeAlert`
- `dischargeAlert`
- `backgroundSampling`
- `usageStatsEnabled`
- `dashboardOrder`

---

## 8. Value creation summary by tab

| Tab | Main values | Where they come from |
|---|---|---|
| Today | battery percent, charging state, current, voltage, temperature, battery health, session status | `status`, `openSession`, `batteryHealth`, `samples`, `settings` |
| Timeline | session list, charger list, compare sessions, session detail fields | `sessions`, `chargers`, `normalizeCurve()`, `computeBaseline()` |
| Insights | 24H curve, 30D trend, digest summary, drain average, app ranking | `samples`, `sessions`, `computeDigest()`, `computeHealthTrend()`, `computeWeeklyAppRanking()` |
| Settings | thresholds, sound toggles, export, native capability flags | `settings`, `capabilities`, `exportCsv()`, `requestUsageStats()` |

---

## 9. High-level interpretation

The app is effectively one shared-state application:

- The telemetry layer reads battery data.
- The session layer records transitions when the device is plugged/unplugged.
- The analytics layer processes the recorded sessions and raw samples.
- The screen layer simply renders the right subset of values for each tab.

This is why the app does not need a backend for its core functionality. The information is created locally, persisted locally, and displayed locally.

---

## 10. Final note

This project is intentionally local-first. The “value creation logic” is mainly happening in the frontend via:
- native battery telemetry listeners
- AsyncStorage persistence
- local state calculations and analytics functions
- native Android bridge integration

The backend is not a required part of this value flow.
