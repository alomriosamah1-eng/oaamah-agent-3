const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NATIVE_FILES = [
  'EmbeddedOpenCodeServer.kt',
  'EmbeddedOpenCodeModule.kt',
  'EmbeddedOpenCodePackage.kt',
  'EmbeddedSpeechModule.kt',
];

module.exports = function withEmbeddedOpenCode(config) {
  return withDangerousMod(config, ['android', async (cfg) => {
    const root = cfg.modRequest.projectRoot;
    const platformRoot = cfg.modRequest.platformProjectRoot;
    const targetDir = path.join(platformRoot, 'app/src/main/java/com/osa/mah/agent');
    const sourceDir = path.join(root, 'native/android/com/osa/mah/agent');
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of NATIVE_FILES) {
      fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
    }

    const mainApplication = path.join(targetDir, 'MainApplication.kt');
    if (fs.existsSync(mainApplication)) {
      let contents = fs.readFileSync(mainApplication, 'utf8');
      if (!contents.includes('add(EmbeddedOpenCodePackage())')) {
        contents = contents.replace(
          'PackageList(this).packages.apply {',
          'PackageList(this).packages.apply {\n              add(EmbeddedOpenCodePackage())',
        );
      }
      if (!contents.includes('EmbeddedOpenCodeServer.start()')) {
        contents = contents.replace('super.onCreate()\n', 'super.onCreate()\n    EmbeddedOpenCodeServer.start()\n');
      }
      fs.writeFileSync(mainApplication, contents);
    }

    const gradle = path.join(platformRoot, 'app/build.gradle');
    if (fs.existsSync(gradle)) {
      const contents = fs.readFileSync(gradle, 'utf8').replace(/versionCode\s+1\b/, 'versionCode 2');
      fs.writeFileSync(gradle, contents);
    }
    return cfg;
  }]);
};
