const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PERMS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_CAMERA',
  'android.permission.WAKE_LOCK',
  'android.permission.POST_NOTIFICATIONS',
];

module.exports = function withRtmpFix(config) {
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const libRoot = path.join(mod.modRequest.projectRoot, 'node_modules', 'react-native-nodemediaclient', 'android');

      // Read library manifest: grab its package name, remove deprecated package attr, add android:exported (API 31+ rule)
      let pkg = 'com.nodemediaclient';
      const manifestPath = path.join(libRoot, 'src', 'main', 'AndroidManifest.xml');
      if (fs.existsSync(manifestPath)) {
        let m = fs.readFileSync(manifestPath, 'utf8');
        const pm = m.match(/package="([^"]+)"/);
        if (pm) { pkg = pm[1]; m = m.replace(/package="[^"]+"\s*/, ''); }
        m = m.replace(/<(activity|service|receiver)(?![^>]*android:exported)/g, '$1 android:exported="true"');
        fs.writeFileSync(manifestPath, m, 'utf8');
      }

      // Inject namespace into library build.gradle (AGP 8 requirement)
      const gradlePath = path.join(libRoot, 'build.gradle');
      if (fs.existsSync(gradlePath)) {
        let g = fs.readFileSync(gradlePath, 'utf8');
        if (!/namespace/.test(g)) {
          g = g.replace(/android\s*{/, "android {\n    namespace '" + pkg + "'");
          fs.writeFileSync(gradlePath, g, 'utf8');
        }
      }
      return mod;
    },
  ]);

  config = withAndroidManifest(config, (mod) => {
    const main = mod.results.manifest;
    if (!main['uses-permission']) main['uses-permission'] = [];
    const have = main['uses-permission'].map((p) => p.$ && p.$['android:name']);
    PERMS.forEach((p) => { if (!have.includes(p)) main['uses-permission'].push({ $: { 'android:name': p } }); });
    return mod;
  });

  return config;
};
