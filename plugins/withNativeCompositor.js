cat > plugins/withNativeCompositor.js << 'EOF'
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
    const importLine = isKotlin
      ? 'import com.lightdirector.NativeCompositorPackage'
      : 'import com.lightdirector.NativeCompositorPackage;';
    const addLine = isKotlin
      ? 'packages.add(NativeCompositorPackage())'
      : 'packages.add(new NativeCompositorPackage());';

    // Add import if missing
    if (!src.includes('NativeCompositorPackage')) {
      const lines = src.split('\n');
      const firstImportIdx = lines.findIndex(l => l.trim().startsWith('import '));
      if (firstImportIdx >= 0) {
        lines.splice(firstImportIdx, 0, importLine);
      } else {
        lines.unshift(importLine);
      }
      src = lines.join('\n');
    }

    // AGGRESSIVE injection: try multiple patterns
    if (!src.includes('NativeCompositorPackage()')) {
      // Pattern 1: Kotlin - PackageList(this).packages
      if (src.includes('PackageList(this).packages')) {
        src = src.replace(
          /(PackageList\(this\)\.packages)/,
          '$1.also { it.add(NativeCompositorPackage()) }'
        );
      }
      // Pattern 2: Java/Kotlin - return packages
      else if (src.includes('return packages')) {
        src = src.replace(
          /(return packages)/,
          `${addLine}\n    $1`
        );
      }
      // Pattern 3: Nuclear option - inject before the last closing brace of getPackages
      else {
        const getPackagesMatch = src.match(/(override fun getPackages\(\)[^{]*\{[\s\S]*?)(\n\s*\})/);
        if (getPackagesMatch) {
          src = src.replace(getPackagesMatch[0], `${getPackagesMatch[1]}\n    ${addLine}${getPackagesMatch[2]}`);
        } else {
          // Last resort: inject before any "return" statement
          src = src.replace(
            /(\n\s*return )/,
            `\n    ${addLine}$1`
          );
        }
      }
    }

    // Final verification
    if (!src.includes('NativeCompositorPackage()')) {
      throw new Error('withNativeCompositor: CRITICAL - Could not inject NativeCompositorPackage into MainApplication. Manual intervention required.');
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
EOF
