const { withDangerousMod } = require('@expo/config-plugins');
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
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const androidRoot = path.join(mod.modRequest.platformProjectRoot);
      const libRoot = path.join(mod.modRequest.projectRoot, 'node_modules', 'react-native-nodemediaclient', 'android');

      // 1) Patch library manifest: namespace + android:exported
      let pkg = 'com.nodemediaclient';
      const libManifest = path.join(libRoot, 'src', 'main', 'AndroidManifest.xml');
      if (fs.existsSync(libManifest)) {
        let m = fs.readFileSync(libManifest, 'utf8');
        const pm = m.match(/package="([^"]+)"/);
        if (pm) { pkg = pm[1]; m = m.replace(/package="[^"]+"\s*/, ''); }
        m = m.replace(/<(activity|service|receiver)(?![^>]*android:exported)/g, '$1 android:exported="true"');
        fs.writeFileSync(libManifest, m, 'utf8');
      }

      // 2) Patch library build.gradle: namespace + compileSdk/targetSdk/minSdk (the actual fix for the Gradle error)
      const gradlePath = path.join(libRoot, 'build.gradle');
      if (fs.existsSync(gradlePath)) {
        let g = fs.readFileSync(gradlePath, 'utf8');
        if (!/namespace/.test(g)) {
          g = g.replace(/android\s*{/, "android {\n    namespace '" + pkg + "'");
        }
        if (!/compileSdk/.test(g)) {
          g = g.replace(/android\s*{/, 'android {\n    compileSdkVersion 34\n    buildToolsVersion "34.0.0"');
        }
        if (!/defaultConfig[\s\S]*?minSdk/.test(g)) {
          g = g.replace(/defaultConfig\s*{/, 'defaultConfig {\n        minSdkVersion 21\n        targetSdkVersion 34');
        }
        fs.writeFileSync(gradlePath, g, 'utf8');
      }

      // 3) Add foreground-service permissions to the app manifest
      const appManifest = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
      if (fs.existsSync(appManifest)) {
        let am = fs.readFileSync(appManifest, 'utf8');
        let added = false;
        PERMS.forEach((p) => {
          if (!am.includes(p)) {
            am = am.replace(/<manifest([^>]*)>/, '$&\n    <uses-permission android:name="' + p + '" />');
            added = true;
          }
        });
        if (added) fs.writeFileSync(appManifest, am, 'utf8');
      }

      return mod;
    },
  ]);
};
