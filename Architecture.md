# CycleSense Architecture

## Overview

CycleSense is an Android-first battery monitoring app built with Expo and React Native. Battery readings, session history, settings, and charger profiles are processed and stored on the device. The mobile app does not currently depend on the repository's backend for its core features.

```text
Expo Router screens
        |
        v
useCycleSense hook -----> feature/data helpers
        |                       |
        |                       v
        |                analytics, health,
        |                charger matching
        |
        +----> local storage (AsyncStorage)
        |
        +----> CycleSenseNative (Android) ----> Android system APIs
        |
        +----> expo-battery (native fallback / preview)
        |
        +----> local notifications and CSV sharing
```

## Frontend

The Expo application lives in [`frontend/`](./frontend/). Expo Router defines navigation:

- [`frontend/app/_layout.tsx`](./frontend/app/_layout.tsx) installs the app-wide error boundary, query client, and keyboard provider.
- [`frontend/app/(tabs)/_layout.tsx`](./frontend/app/(tabs)/_layout.tsx) configures Today, Timeline, Insights, and Settings tabs. It selects native tabs where supported and otherwise uses the standard tab navigator.
- Screen components in `frontend/app/(tabs)/` render UI and use the shared CycleSense hook.

[`frontend/src/hooks/useCycleSense.ts`](./frontend/src/hooks/useCycleSense.ts) is the central application-state and orchestration layer. It loads and persists local state, refreshes telemetry, detects power transitions, manages charge/discharge sessions, and coordinates alerts, sampling, screen tracking, charger matching, and widget updates.

Pure domain types and operations are in `frontend/src/data/`. This includes session and settings models, charger classification and matching, capability detection, health calculations, analytics, and digest calculations. Screens consume the resulting state and derived values rather than accessing Android APIs directly.

## Battery data and native Android module

The TypeScript API in [`frontend/modules/cyclesense-native/src/`](./frontend/modules/cyclesense-native/src/) is the boundary between JavaScript and the optional native module. The hook uses it on Android when the module is available. On other platforms or in previews without the module, it falls back to `expo-battery` for supported basic readings; Android-specific fields are capability-gated.

The Kotlin implementation is in `frontend/modules/cyclesense-native/android/`:

- `BatteryTelemetry` reads available battery fields from Android system APIs.
- `CycleSenseNativeModule` exposes telemetry, sample storage, usage/network statistics, screen state, widget updates, and native events to JavaScript.
- `BatterySamplingWorker` and `SampleStore` provide periodic background samples and bounded local sample retention.
- `PowerBroadcastReceiver` handles power-connected and power-disconnected events, including configured sound cues.
- `SessionForegroundService` supports an active charge or discharge session.
- `UsageStatsHelper` accesses usage statistics only through the explicitly granted Android permission flow.
- `CycleSenseWidgetProvider` renders the home-screen widget from locally persisted state.

The local Expo config plugin (`frontend/modules/cyclesense-native/app.plugin.js`) wires module-specific Android configuration into the app build.

## Persistence and privacy

General application data uses the shared storage abstraction in `frontend/src/utils/storage/`, backed by AsyncStorage. Persisted values include session history, settings, charger profiles, power-state reconciliation data, and daily screen-time totals. Storage keys and domain types are defined in `frontend/src/data/cyclesense.ts`.

Raw native battery samples are kept in the Android module's local sample store. No account or cloud synchronization is part of the current product design. Usage statistics are optional and require the user to grant Android's special usage-access permission before they are queried. CSV export is generated locally and passed to the platform share sheet.

## Notifications and export

`frontend/src/notifications.ts` contains the JavaScript notification setup and alert helpers. The app schedules local threshold and power-transition notifications; Android-specific sound behavior is also handled by the native receiver. Session history export is produced on-device and shared using Expo FileSystem and Expo Sharing.

## Backend status

`backend/server.py` is a FastAPI starter service with sample status-check endpoints backed by MongoDB. The current mobile app's battery, session, settings, analytics, and export flows do not use these endpoints. Treat this backend as separate scaffolding unless a future product requirement explicitly introduces a server-backed feature.

## Validation

Frontend checks are defined by the scripts in `frontend/package.json`:

- `yarn lint` runs Expo linting.
- `yarn test` runs Jest tests, including unit tests under `frontend/src/data/__tests__/`.

Android-native changes may additionally require building and validating the Android app because Expo previews without a native build cannot exercise the custom module.
