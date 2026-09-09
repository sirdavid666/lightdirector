const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withAppBuildGradle,
  withAndroidManifest,
  withMainApplication,
  withProjectBuildGradle,
} = require('@expo/config-plugins');

const JAVA_FILES = [
  'OverlayGlFilter.java',
  'GradeFilters.java',
  'NativeOverlayRenderer.java',
  'NativeCompositorModule.java',
  'CompositorView.java',
  'CompositorViewManager.java',
  'NativeCompositorPackage.java',
];

const RTMP_DEP = "implementation 'com.github.pedroSG94.rtmp-rtsp-stream-client-java:rtplibrary:2.2.2'";
const PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.WAKE_LOCK',
];

function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function withCopyNativeJavaFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const srcDir = path.join(projectRoot, 'native-src', 'com', 'lightdirector');
      const destDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'lightdirector');
      ensureDirExists(destDir);
      for (const file of JAVA_FILES) {
        const srcPath = path.join(srcDir, file);
        const destPath = path.join(destDir, file);
        if (!fs.existsSync(srcPath)) throw new Error(`Missing source file: ${srcPath}`);
        await fs.promises.copyFile(srcPath, destPath);
      }
      return config;
    },
  ]);
}

function withRtmpDependency(config) {
  return withAppBuildGradle(config, (config) => {
    const { contents } = config.modResults;
    if (!contents.includes('rtplibrary:2.2.2')) {
      const depsBlock = /dependencies\s*{([^}]*)}/s;
      const match = contents.match(depsBlock);
      if (match) {
        const insertPos = match.index + match[0].length - 1;
        config.modResults.contents = contents.slice(0, insertPos) + `\n    ${RTMP_DEP}` + contents.slice(insertPos);
      }
    }
    return config;
  });
}

function withGlobalFrescoExclude(config) {
  return withProjectBuildGradle(config, (config) => {
    const { contents } = config.modResults;
    const marker = 'allprojects {';
    if (contents.includes(marker) && !contents.includes('animated-gif')) {
      config.modResults.contents = contents.replace(
        marker,
        `${marker}\n    configurations.all {\n        exclude group: 'com.facebook.fresco', module: 'animated-gif'\n    }`
      );
    }
    return config;
  });
}

function withPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    PERMISSIONS.forEach((perm) => {
      const exists = manifest['uses-permission'].some(
        (item) => item && item.$ && item.$['android:name'] === perm
      );
      if (!exists) {
        manifest['uses-permission'].push({ $: { 'android:name': perm } });
      }
    });
    return config;
  });
}

// ---------------------------------------------------------------------------
// GUARANTEED package registration: line-based injection (no fragile regex)
// + LOUD failure if anything goes wrong (build errors instead of silent break)
// ---------------------------------------------------------------------------
function withPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    const isKotlin = config.modResults.language === 'kotlin';
    const addLine = isKotlin
      ? 'packages.add(NativeCompositorPackage())'
      : 'packages.add(new NativeCompositorPackage());';
    const importLine = isKotlin
      ? 'import com.lightdirector.NativeCompositorPackage'
      : 'import com.lightdirector.NativeCompositorPackage;';

    const lines = config.modResults.contents.split('\n');
    const out = [];
    let injected = false;

    for (const line of lines) {
      out.push(line);
      if (!injected && line.includes('PackageList(this)') && line.includes('packages')) {
        const indent = line.match(/^\s*/)[0];
        out.push(indent + addLine);
        injected = true;
      }
    }

    // Fallback: inject right before "return packages"
    if (!injected) {
      const out2 = [];
      for (const line of out) {
        if (line.trim().startsWith('return packages')) {
          const indent = line.match(/^\s*/)[0];
          out2.push(indent + addLine);
          injected = true;
        }
        out2.push(line);
      }
      out.length = 0;
      out.push(...out2);
    }

    let src = out.join('\n');

    // Import at top (before first existing import)
    if (!src.includes('NativeCompositorPackage')) {
      throw new Error('withNativeCompositor: injection FAILED - PackageList line not found in MainApplication');
    }
    if (!src.includes(importLine)) {
      const srcLines = src.split('\n');
      const idx = srcLines.findIndex((l) => l.trim().startsWith('import '));
      if (idx >= 0) srcLines.splice(idx, 0, importLine);
      else srcLines.unshift(importLine);
      src = srcLines.join('\n');
    }

    // LOUD verification
    if (!src.includes('NativeCompositorPackage()')) {
      throw new Error('withNativeCompositor: VERIFICATION FAILED - package not registered in MainApplication');
    }

    config.modResults.contents = src;
    return config;
  });
}

// Post-prebuild disk verification: if the generated MainApplication on disk
// doesn't contain our package, FAIL THE BUILD with a clear message.
function withVerifyRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const root = config.modRequest.projectRoot;
      const candidates = [
        path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'lightdirector', 'app', 'MainApplication.kt'),
        path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'lightdirector', 'app', 'MainApplication.java'),
      ];
      let found = false;
      for (const c of candidates) {
        if (fs.existsSync(c) && fs.readFileSync(c, 'utf8').includes('NativeCompositorPackage')) found = true;
      }
      if (!found) {
        throw new Error('withNativeCompositor: POST-PREBUILD VERIFICATION FAILED - NativeCompositorPackage missing from generated MainApplication');
      }
      return config;
    },
  ]);
}

module.exports = (config) => {
  return withCopyNativeJavaFiles(
    withRtmpDependency(
      withGlobalFrescoExclude(
        withPermissions(
          withVerifyRegistration(
            withPackageRegistration(config)
          )
        )
      )
    )
  );
};
