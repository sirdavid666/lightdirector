const { withDangerousMod, withProjectBuildGradle } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');
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
  // Force ONLY compileSdk (the original error). Do NOT touch minSdk/targetSdk —
  // Expo's own modules require minSdk 23+, overriding them breaks Fabric.
  config = withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') return mod;
    const injection = `
allprojects {
    afterEvaluate { project ->
        if (project.hasProperty("android")) {
            project.android {
                compileSdkVersion 34
                buildToolsVersion "34.0.0"
            }
        }
    }
}`;
    mod.modResults.contents = mergeContents({
      tag: 'withRtmpFix-sdk-override',
      src: mod.modResults.contents,
      newSrc: injection,
      anchor: /.*/,
      offset: 0,
      comment: '//',
    }).contents;
    return mod;
  });

  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const androidRoot = mod.modRequest.platformProjectRoot;
      const libRoot = path.join(mod.modRequest.projectRoot, 'node_modules', 'react-native-nodemediaclient', 'android');

      let pkg = 'com.nodemediaclient';
      const libManifest = path.join(libRoot, 'src', 'main', 'AndroidManifest.xml');
      if (fs.existsSync(libManifest)) {
        let m = fs.readFileSync(libManifest, 'utf8');
        const pm = m.match(/package="([^"]+)"/);
        if (pm) { pkg = pm[1]; m = m.replace(/package="[^"]+"\s*/, ''); }
        m = m.replace(/<(activity|service|receiver)(?![^>]*android:exported)/g, '$1 android:exported="true"');
        fs.writeFileSync(libManifest, m, 'utf8');
      }
      const gradlePath = path.join(libRoot, 'build.gradle');
      if (fs.existsSync(gradlePath)) {
        let g = fs.readFileSync(gradlePath, 'utf8');
        if (!/namespace/.test(g)) {
          g = g.replace(/android\s*{/, "android {\n    namespace '" + pkg + "'");
          fs.writeFileSync(gradlePath, g, 'utf8');
        }
      }
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

  return config;
};
