const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// These names are also referenced from the native side (CycleSenseNativeModule.kt)
// when toggling which one is enabled - keep the two in sync if you ever rename them.
const ALIAS_CHARGING = "expo.modules.cyclesense.LauncherCharging";
const ALIAS_DISCHARGING = "expo.modules.cyclesense.LauncherDischarging";

/**
 * Copies the two pre-generated launcher icon PNGs (see assets/dynamic-icon/)
 * into the generated Android project's mipmap folder. Runs on every prebuild,
 * so regenerating android/ never loses these - unlike hand-editing the
 * generated manifest/res folders directly, which prebuild --clean wipes.
 */
function withDynamicIconAssets(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const resDir = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "res", "mipmap-xxxhdpi");
      fs.mkdirSync(resDir, { recursive: true });
      const assetsDir = path.join(mod.modRequest.projectRoot, "assets", "dynamic-icon");
      fs.copyFileSync(path.join(assetsDir, "ic_launcher_charging.png"), path.join(resDir, "ic_launcher_charging.png"));
      fs.copyFileSync(path.join(assetsDir, "ic_launcher_discharging.png"), path.join(resDir, "ic_launcher_discharging.png"));
      return mod;
    },
  ]);
}

/**
 * Moves the LAUNCHER intent-filter off the real MainActivity and onto two
 * activity-aliases instead - one per icon. Only one alias is ever enabled at
 * a time (toggled natively via PackageManager.setComponentEnabledSetting),
 * so exactly one launcher icon shows on the home screen at any moment.
 */
function withDynamicIconManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const androidManifest = mod.modResults;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
    const activityName = mainActivity.$["android:name"];

    mainActivity["intent-filter"] = (mainActivity["intent-filter"] || []).filter((filter) => {
      const categories = filter.category || [];
      const isLauncher = categories.some((c) => c.$["android:name"] === "android.intent.category.LAUNCHER");
      return !isLauncher;
    });

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
    application["activity-alias"] = (application["activity-alias"] || []).filter(
      (alias) => alias.$["android:name"] !== ALIAS_CHARGING && alias.$["android:name"] !== ALIAS_DISCHARGING
    );

    const makeAlias = (name, icon, enabledByDefault) => ({
      $: {
        "android:name": name,
        "android:targetActivity": activityName,
        "android:enabled": enabledByDefault ? "true" : "false",
        "android:exported": "true",
        "android:icon": `@mipmap/${icon}`,
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
          category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
        },
      ],
    });

    // Charging is the default-enabled alias on first install - it flips to
    // whichever is actually true the moment the native module observes real
    // state (see the boot-reconciliation effect in useCycleSense.ts).
    application["activity-alias"].push(
      makeAlias(ALIAS_CHARGING, "ic_launcher_charging", true),
      makeAlias(ALIAS_DISCHARGING, "ic_launcher_discharging", false)
    );

    return mod;
  });
}

function withDynamicIcon(config) {
  config = withDynamicIconAssets(config);
  config = withDynamicIconManifest(config);
  return config;
}

module.exports = withDynamicIcon;
module.exports.ALIAS_CHARGING = ALIAS_CHARGING;
module.exports.ALIAS_DISCHARGING = ALIAS_DISCHARGING;
