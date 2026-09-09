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

function withPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    let src = config.modResults.contents;
    const isKotlin = config.modResults.language === 'kotlin';
    
    // Add import if missing
    const importLine = isKotlin 
      ? 'import com.lightdirector.NativeCompositorPackage' 
      : 'import com.lightdirector.NativeCompositorPackage;';
    
    if (!src.includes('NativeCompositorPackage')) {
      const packageMatch = src.match(/^package\s+[\w.]+;?\s*$/m);
      if (packageMatch) {
        const insertIdx = packageMatch.index + packageMatch[0].length;
        src = src.slice(0, insertIdx) + '\n' + importLine + src.slice(insertIdx);
      }
    }
    
    // Add package to the list
    if (isKotlin) {
      if (!src.includes('NativeCompositorPackage()')) {
        // Try multiple patterns for Kotlin
        src = src.replace(
          /(PackageList\(this\)\.packages)/,
          '$1.apply { add(NativeCompositorPackage()) }'
        );
        // Fallback: if that didn't work, try adding after packages list
        if (!src.includes('NativeCompositorPackage()')) {
          src = src.replace(
            /(return\s+packages)/,
            'packages.add(NativeCompositorPackage())\n    $1'
          );
        }
      }
    } else {
      if (!src.includes('new NativeCompositorPackage()')) {
        // Java: find getPackages and inject before return
        const getPackagesRegex = /(protected\s+List<ReactPackage>\s+getPackages\s*\(\s*\)\s*\{[^}]*?)(return\s+packages;)/s;
        const match = src.match(getPackagesRegex);
        if (match) {
          src = src.replace(getPackagesRegex, '$1packages.add(new NativeCompositorPackage());\n    $2');
        } else {
          // Fallback: just append before any "return packages"
          src = src.replace(
            /(return\s+packages;)/,
            'packages.add(new NativeCompositorPackage());\n    $1'
          );
        }
      }
    }
    
    config.modResults.contents = src;
    return config;
  });
}

module.exports = (config) => {
  return withCopyNativeJavaFiles(
    withRtmpDependency(
      withGlobalFrescoExclude(
        withPermissions(
          withPackageRegistration(config)
        )
      )
    )
  );
};
