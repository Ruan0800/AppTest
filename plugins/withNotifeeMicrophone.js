const {
  withAndroidManifest,
  withProjectBuildGradle,
  AndroidConfig,
} = require('@expo/config-plugins');

const NOTIFEE_MAVEN =
  'maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }';

/**
 * Garante permissões, foregroundServiceType=microphone e o Maven local do Notifee.
 */
function withNotifeeMicrophone(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.RECORD_AUDIO',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    'android.permission.WAKE_LOCK',
    'android.permission.VIBRATE',
  ]);

  config = withProjectBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes('@notifee/react-native/android/libs')) {
      if (contents.includes("maven { url 'https://www.jitpack.io' }")) {
        contents = contents.replace(
          "maven { url 'https://www.jitpack.io' }",
          `maven { url 'https://www.jitpack.io' }\n    ${NOTIFEE_MAVEN}`
        );
      } else if (contents.includes('repositories {')) {
        contents = contents.replace(
          'repositories {',
          `repositories {\n    ${NOTIFEE_MAVEN}`
        );
      }
      config.modResults.contents = contents;
    }
    return config;
  });

  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return config;

    if (!app.service) app.service = [];

    const serviceName = 'app.notifee.core.ForegroundService';
    let service = app.service.find(
      (s) => s.$?.['android:name'] === serviceName
    );

    if (!service) {
      service = {
        $: {
          'android:name': serviceName,
          'android:exported': 'false',
        },
      };
      app.service.push(service);
    }

    service.$['android:foregroundServiceType'] = 'microphone';

    return config;
  });
}

module.exports = withNotifeeMicrophone;
