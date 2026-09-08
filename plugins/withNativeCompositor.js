hereconst fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withAppBuildGradle,
  withAndroidManifest,
  withSettingsGradle,
  withMainApplication,
  AndroidConfig,
} = require('@expo/config-plugins');

const JAVA_FILES = [
  'NativeOverlayRenderer.java',
  'OverlayGlFilter.java',
  'NativeCompositorModule.java',
  'CompositorView.java',
  'CompositorViewManager.java',
  'NativeCompositorPackage.java',
];

const JITPACK_REPO = "maven { url 'https://www.jitpack.io' }";
const RTMP_DEP = "implementation 'com.github.pedroSG94:rtmp-rtsp-stream-client-java:2.2.2'";
const PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.WAKE_LOCK',
];

function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function withCopyNativeJavaFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const srcDir = path.join(projectRoot, 'native-src', 'com', 'lightdirector');
      const destDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'lightdirector'
      );
      ensureDirExists(destDir);

      for (const file of JAVA_FILES) {
        const srcPath = path.join(srcDir, file);
        const destPath = path.join(destDir, file);
        if (!fs.existsSync(srcPath)) {
          throw new Error(
            `withNativeCompositor: required source file missing → ${srcPath}`
          );
        }
        await fs.promises.copyFile(srcPath, destPath);
      }
      return config;
    },
  ]);
}

function withJitPackRepo(config) {
  config = withSettingsGradle(config, (config) => {
    const content = config.modResults.contents;
    if (!content.includes(JITPACK_REPO)) {
      const reposBlock = /dependencyResolutionManagement\s*{[^}]*repositories\s*{([^}]*)}/s;
      const match = content.match(reposBlock);
      if (match) {
        const before = content.slice(0, match.index + match[0].length - 1);
        const after = content.slice(match.index + match[0].length - 1);
        config.modResults.contents = `${before}\n    ${JITPACK_REPO}\n${after}`;
      }
    }
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    (config) => {
      const filePath = path.join(
        config.modRequest.projectRoot,
        'android',
        'build.gradle'
      );
      if (!fs.existsSync(filePath)) {
        return config;
      }
      let contents = fs.readFileSync(filePath, 'utf8');
      if (!contents.includes(JITPACK_REPO)) {
        const allprojectsRepos = /allprojects\s*{[^}]*repositories\s*{([^}]*)}/s;
        const match = contents.match(allprojectsRepos);
        if (match) {
          const insertPos = match.index + match[0].length - 1;
          contents =
            contents.slice(0, insertPos) +
            `\n    ${JITPACK_REPO}` +
            contents.slice(insertPos);
          fs.writeFileSync(filePath, contents);
        }
      }
      return config;
    },
  ]);

  return config;
}

function withRtmpDependency(config) {
  return withAppBuildGradle(config, (config) => {
    const { contents } = config.modResults;
    if (!contents.includes(RTMP_DEP)) {
      const depsBlock = /dependencies\s*{([^}]*)}/s;
      const match = contents.match(depsBlock);
      if (match) {
        const insertPos = match.index + match[0].length - 1;
        config.modResults.contents =
          contents.slice(0, insertPos) + `\n    ${RTMP_DEP}` + contents.slice(insertPos);
      }
    }
    return config;
  });
}

function withPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const existing = AndroidConfig.Permissions.getPermissions(manifest) || [];
    PERMISSIONS.forEach((perm) => {
      if (!existing.includes(perm)) {
        AndroidConfig.Permissions.addPermission(manifest, perm);
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

    const importLine = isKotlin
      ? "import com.lightdirector.NativeCompositorPackage"
      : "import com.lightdirector.NativeCompositorPackage;";
    if (!src.includes(importLine.trim())) {
      const packageLineMatch = src.match(/^package\s+[\w.]+;?\s*$/m);
      const insertIdx = packageLineMatch
        ? packageLineMatch.index + packageLineMatch[0].length
        : 0;
      modResults.contents =
        src.slice(0, insertIdx) + `\n${importLine}` + src.slice(insertIdx);
    }

    if (isKotlin) {
      const applyMatch = modResults.contents.match(
        /PackageList\(this\)\.packages\.apply\s*{\s*([^}]*)}/s
      );
      if (applyMatch) {
        const block = applyMatch[1];
        if (!/NativeCompositorPackage\(\)/.test(block)) {
          const newBlock = block + `\n    add(NativeCompositorPackage())`;
          modResults.contents =
            modResults.contents.replace(applyMatch[0], `PackageList(this).packages.apply {${newBlock}\n}`);
        }
      }
    } else {
      const getPackagesMatch = modResults.contents.match(
        /protected\s+java\.util\.List<\s*ReactPackage\s*>\s+getPackages\(\)\s*{\s*([\s\S]*?)return\s+packages;\s*}/
      );
      if (getPackagesMatch) {
        const body = getPackagesMatch[1];
        if (!/new\s+NativeCompositorPackage\(\)/.test(body)) {
          const insertion = body + `\n    packages.add(new NativeCompositorPackage());`;
          modResults.contents =
            modResults.contents.replace(
              getPackagesMatch[0],
              `protected java.util.List<ReactPackage> getPackages() {\n${insertion}\n    return packages;\n}`
            );
        }
      }
    }
    return config;
  });
}

module.exports = (config) => {
  return withCopyNativeJavaFiles(
    withJitPackRepo(
      withRtmpDependency(
        withPermissions(
          withPackageRegistration(config)
        )
      )
    )
  );
};
