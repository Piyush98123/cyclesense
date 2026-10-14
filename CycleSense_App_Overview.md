# CycleSense App Overview

## 1. General information

CycleSense is a mobile-first battery monitoring and charging insight application designed for Android-first use, but with graceful fallbacks for preview and web environments. It is built in Expo + React Native and focuses on understanding how a phone charges and discharges over time without storing user data in the cloud.

The app treats charging and discharging as one continuous timeline and turns raw battery measurements into readable, insight-driven summaries. Core goals are:

- Track live battery state and charging patterns
- Automatically record sessions when the charger is plugged in or unplugged
- Provide historical timeline analytics for charge/discharge behavior
- Highlight battery health and discharge drift using local estimates
- Keep everything on-device with no account or server sync by default
- Support Android native telemetry when available, while degrading gracefully elsewhere

The main application lives in the frontend React Native project, while the backend folder contains a separate FastAPI/MongoDB prototype that is not the main execution path of the product.

## 2. Product purpose and user value

The app serves users who want to understand battery behavior in a neutral, non-judgmental way. It helps answer questions such as:

- How quickly is the device charging or draining?
- Which charger type or cable is being used?
- Is the battery health degrading over time?
- How long until the next charge alert or full charge threshold?
- What are the recent battery trends over the last day, 30 days, or a digest period?

This matches the product statement captured in the project PRD: a battery-aware utility that keeps raw observations local and converts them into understandable insights.

## 3. High-level architecture

### Frontend

Technology stack:

- Expo SDK + React Native
- Expo Router for tab-based navigation
- AsyncStorage for local persistence
- Expo Battery for baseline battery APIs
- Android native bridge for advanced telemetry and background sampling
- FileSystem + Sharing for CSV export
- MaterialCommunityIcons and custom theme styling

### Native Android bridge

The app includes an Android native module under `frontend/modules/cyclesense-native` that exposes advanced battery telemetry such as:

- Voltage
- Temperature
- Current draw
- Charge counter values
- Technology and health metadata
- Raw sample capture
- Screen tracking and usage statistics integration
- Background sampling and widget updates

This is the path that enables advanced features beyond the basic Expo `expo-battery` APIs.

### Persistence model

User data is stored locally on device, including:

- Session history
- Charger metadata
- Settings such as alerts and dashboard order
- Screen-on totals and daily counts

The app uses AsyncStorage as the local state layer. The design goal is privacy-first local operation without cloud sync.

### Backend

The Python backend under `backend/server.py` is a minimal FastAPI app that stores status records in MongoDB. It is not part of the core mobile app flow and appears to be a starter API or prototype rather than the live product backend.

## 4. Core app functionality

### 4.1 Today dashboard

The Today screen is the main command center. It shows:

- Current battery percentage
- Charge/discharge state
- Native vs live capability badge
- Quick telemetry cards (current, temperature, health, voltage)
- Session status and auto-tracking state
- Live battery curve placeholder/data visualization
- Charger recognition greeting when a known or new charger is detected

This is implemented primarily through the `useCycleSense` hook and the dashboard screen in `frontend/app/(tabs)/index.tsx`.

### 4.2 Automatic session tracking

Sessions are auto-created based on real power transitions rather than manual start/stop controls. The app listens for charger-connected and charger-disconnected events, then opens or closes session windows automatically.

This is a notable design decision in the PRD and codebase: session creation is plug/unplug driven rather than user-initiated.

### 4.3 Timeline and charge history

The Timeline tab shows:

- Recorded charging/discharging sessions
- Known chargers list
- Charger rename / forget functionality
- Session comparison mode
- Bottom-sheet style detail view with per-session metadata
- Normalized curves, rate, start/end levels, and duration

This is the historic trace of a user’s battery activity and is a major part of the app’s utility.

### 4.4 Insights and analytics

The Insights tab provides:

- 24H view
- 30D view
- Digest view
- Confidence-aware messaging
- Battery health trend analysis
- Discharge baseline comparisons
- Charging habit summaries
- Weekly app ranking and screen-time analytics when native usage stats are enabled

This layer converts raw battery data into understandable summaries rather than showing raw numbers alone.

### 4.5 Settings and controls

The Settings screen includes:

- Sound cues toggle
- Charging threshold alert configuration
- Discharge threshold alert configuration
- Background sampling toggle
- Dashboard ordering adjustments
- Device capability display
- CSV export for session history
- Native-only advanced section for usage stats and related Android settings

### 4.6 Native-specific features

A set of Android-only features are enabled when the native module is active:

- Background sampling
- Battery temperature and voltage telemetry
- Current and charge counter readings
- Usage stats access
- Notification and cue integration
- Widget refresh support

These features are intentionally gated to native Android builds and are not expected to work in the Expo preview environment.

### 4.7 CSV export and local portability

The app can export local sessions to CSV using shared file-system utilities. This supports a portable record of session history without requiring a cloud backend.

## 5. Functional requirements

The following functional requirements are derived from the product PRD and the implemented codebase.

### Functional requirements

1. Live battery monitoring
   - The app must show the device’s battery percentage and charging/discharging state.

2. Automatic session management
   - Charging and discharging sessions must be tracked automatically based on plug-in and unplug events.

3. Historical session timeline
   - Past sessions must be retained locally and displayed in a timeline view.

4. Charger recognition
   - The app should learn charger identities and differentiate known vs new chargers.

5. Battery insights and health summaries
   - The app should estimate battery health and display discharge or charge trends.

6. Raw sample and advanced telemetry
   - When supported, the app should collect raw battery samples and advanced values such as current, voltage, temperature, health, and charge counters.

7. Alert configuration
   - Users must be able to set charging and discharging alert thresholds.

8. Export
   - Session history should be exportable as a CSV file.

9. On-device privacy
   - User data should remain local and not require any cloud account or backend sync.

10. Capability-aware fallback
   - The app should degrade gracefully when advanced native features are unavailable.

## 6. Non-functional requirements

### Performance
- UI should remain responsive on normal mobile devices.
- Background sampling and telemetry should be lightweight and bounded.
- Session history should be capped to avoid unbounded storage growth.

### Reliability
- The app should continue to function even when advanced capabilities are unavailable.
- Local persistence should survive app restarts and navigation changes.
- Fallback paths should not crash the app when native telemetry is missing.

### Privacy and security
- The app should store sensitive battery data locally on device.
- No user account should be required.
- Usage stat access must be explicit and permission-gated.

### Usability and accessibility
- Controls should be touch-friendly and readable.
- Dark-first UI should maintain good contrast.
- Real capability labels and neutral confidence messaging should help users interpret data correctly.

### Maintainability
- The app should separate domain logic (analytics, charger memory, health, settings) from screen code.
- The use of typed data models and the `useCycleSense` hook helps keep state logic centralized.

## 7. Completed functionality

The app has significantly implemented the main product vision. Based on the code and PRD, the following items are completed or largely completed:

| Feature | Status | Notes |
|---|---|---|
| Live battery state | Completed | Today tab and `useCycleSense` telemetry hook |
| Auto session tracking | Completed | Plug/unplug auto transitions |
| Session timeline | Completed | Session rows, metadata, detail modal |
| Charger recognition | Completed | Charger memory and greeting flow |
| Local persistence | Completed | AsyncStorage-based settings and sessions |
| Insights dashboard | Completed | 24H/30D/digest analytics |
| Health estimation | Completed | Battery health calculations and confidence labels |
| Alerts and settings | Completed | Charge/discharge threshold controls |
| CSV export | Completed | Local session export workflow |
| Native Android bridge | Completed | Native module available in Android builds |
| Background sampling | Completed | WorkManager and sample capture |
| Usage-stat aware insights | Completed (native-only) | Opt-in usage permission flow |
| Widget and cues | Completed | Sound cues and widget refresh support |
| Capability fallback | Completed | Preview-safe behavior |

## 8. What appears incomplete or partially completed

The codebase is strong in front-end battery intelligence, but a few areas are only partially integrated or remain prototype-level:

- The Python backend is a minimal FastAPI starter, not the primary application runtime.
- The app is designed to be local-only; therefore, cloud sync or multi-device support is intentionally absent.
- Some advanced features only work on Android native builds and are intentionally unavailable in Expo Go or web preview.
- Usage stats and other advanced Android controls are opt-in and may require system permissions.

## 9. Bug findings and risk observations

I did not find an app-breaking defect in the core session/analytics logic based on the passing unit tests (`43/43` passing in the analytics and session modules). That said, here are the main issues and risk areas I found in the current codebase.

### 9.1 Backend startup crash risk

File: `backend/server.py`

Observation:
- The application reads `MONGO_URL` and `DB_NAME` directly from environment variables with `os.environ[...]`.
- If those variables are missing, the backend crashes immediately at import time.

Impact:
- The FastAPI backend cannot start without a configured environment.
- This is a real startup reliability issue for the backend prototype.

Severity: Medium

### 9.2 Backend is disconnected from the actual app workflow

Observation:
- The app is designed for local-only battery tracking and store-to-device persistence.
- The backend API in `backend/server.py` is not integrated with the React Native app or its real data model.

Impact:
- The app does not currently use the backend for user-facing functionality.
- This is more an architectural gap than a runtime bug, but it creates confusion about product ownership and data flow.

Severity: Low to Medium

### 9.3 Advanced features are platform-gated and can feel incomplete in preview mode

Observation:
- Features such as usage stats, advanced battery telemetry, and background sampling are conditioned on the native bridge.
- The app intentionally degrades gracefully, but some screens can show “Requires native bridge” or “Native build required” states.

Impact:
- Some features appear incomplete when tested in Expo Go or web preview.
- This is intentional by design, but it may confuse users who expect the same product behavior on non-native environments.

Severity: Low

### 9.4 Storage and sampling assumptions may vary by device

Observation:
- The app depends on device-level battery telemetry, OS permission gates, WorkManager, and access to system-level data.
- Some devices can expose incomplete or inconsistent readings for temperature, current, and health.

Impact:
- Confidence labels and analytics may degrade or be partially unavailable on unsupported hardware.

Severity: Medium

## 10. Overall assessment

CycleSense is a well-structured mobile product prototype with real product intent and substantial implementation depth. The app already covers the majority of the PRD’s core requirements and demonstrates a thoughtful architecture around local-first battery intelligence, native Android support, and analytics-driven UX.

The most important conclusion is:

- The core app is functionally strong and largely aligned with the product vision.
- The native Android implementation is the most complete part of the system.
- The backend is still a minimal prototype and not yet product-critical.
- The main limitations are platform-specific functionality and the lack of broader end-to-end validation beyond the existing unit tests.

## 11. Summary

CycleSense is already a solid mobile-first battery tracking application with:

- clear product positioning
- strong local-first design
- meaningful analytics and session tracking
- Android native capability depth
- a credible implementation plan for battery insights and alerts

It is functionally mature enough to be considered a real app prototype, with the biggest remaining gaps being full cross-platform parity and tighter backend integration if the project ever grows beyond local-only operation.
