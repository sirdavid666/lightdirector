const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withAppBuildGradle,
  withAndroidManifest,
  withMainApplication,
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

const RTMP_DEP = `implementation('com.github.pedroSG94.rtmp-rtsp-stream-client-java:rtplibrary:2.2.2') {
    exclude group: 'com.facebook.fresco', module: 'animated-gif'
}`;
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
    if (!contents.includes(RTMP_DEP)) {
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
    const { modResults } = config;
    const src = modResults.contents;
    const isKotlin = modResults.language === 'kotlin';
    const importLine = isKotlin ? "import com.lightdirector.NativeCompositorPackage" : "import com.lightdirector.NativeCompositorPackage;";
    if (!src.includes(importLine.trim())) {
      const packageLineMatch = src.match(/^package\s+[\w.]+;?\s*$/m);
      const insertIdx = packageLineMatch ? packageLineMatch.index + packageLineMatch[0].length : 0;
      modResults.contents = src.slice(0, insertIdx) + `\n${importLine}` + src.slice(insertIdx);
    }
    if (isKotlin) {
      const applyMatch = modResults.contents.match(/PackageList\(this\)\.packages\.apply\s*{\s*([^}]*)}/s);
      if (applyMatch && !/NativeCompositorPackage\(\)/.test(applyMatch[1])) {
        modResults.contents = modResults.contents.replace(applyMatch[0], `PackageList(this).packages.apply {${applyMatch[1]}\n    add(NativeCompositorPackage())\n}`);
      }
    } else {
      const getPackagesMatch = modResults.contents.match(/protected\s+java\.util\.List<\s*ReactPackage\s*>\s+getPackages\(\)\s*{\s*([\s\S]*?)return\s+packages;\s*}/);
      if (getPackagesMatch && !/new\s+NativeCompositorPackage\(\)/.test(getPackagesMatch[1])) {
        modResults.contents = modResults.contents.replace(getPackagesMatch[0], `protected java.util.List<ReactPackage> getPackages() {\n${getPackagesMatch[1]}\n    packages.add(new NativeCompositorPackage());\n    return packages;\n}`);
      }
    }
    return config;
  });
}

module.exports = (config) => {
  return withCopyNativeJavaFiles(
    withRtmpDependency(
      withPermissions(
        withPackageRegistration(config)
      )
    )
  );
};
