const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

const PERMISSIONS = [
  "android.permission.PACKAGE_USAGE_STATS",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.RECEIVE_BOOT_COMPLETED",
];

/**
 * Injects the permissions CycleSense's native bridge needs into the merged
 * AndroidManifest. PACKAGE_USAGE_STATS is a special (signature|appop) permission
 * that must be granted from system Settings; we declare it so the app can
 * request it, but the module keeps UsageStats OFF until the user opts in.
 */
function withCycleSenseNative(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    manifest["$"] = manifest["$"] || {};
    if (!manifest["$"]["xmlns:tools"]) {
      manifest["$"]["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    // Ensure @expo/config-plugins helper preserves existing permissions
    AndroidConfig.Permissions.ensurePermissions(manifest, PERMISSIONS);

    // Tag PACKAGE_USAGE_STATS with tools:ignore so lint accepts the special permission
    const permissionNodes = manifest.manifest["uses-permission"] || [];
    for (const node of permissionNodes) {
      if (node.$ && node.$["android:name"] === "android.permission.PACKAGE_USAGE_STATS") {
        node.$["tools:ignore"] = "ProtectedPermissions";
      }
    }

    return mod;
  });
}

module.exports = withCycleSenseNative;
