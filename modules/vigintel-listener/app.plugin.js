const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
];

const SERVICE_NAME = 'expo.modules.vigintellistener.ListenerService';

function withVigintelListener(config) {
  config = AndroidConfig.Permissions.withPermissions(config, PERMISSIONS);

  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return config;

    if (!app.service) app.service = [];

    let service = app.service.find((entry) => entry.$?.['android:name'] === SERVICE_NAME);
    if (!service) {
      service = {
        $: {
          'android:name': SERVICE_NAME,
        },
      };
      app.service.push(service);
    }

    service.$['android:exported'] = 'false';
    service.$['android:foregroundServiceType'] = 'microphone';
    service.$['android:stopWithTask'] = 'false';

    return config;
  });
}

module.exports = withVigintelListener;
