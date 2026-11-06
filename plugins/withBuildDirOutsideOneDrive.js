const { withSettingsGradle } = require('@expo/config-plugins');

const SNIPPET = `
// vigintel-build-outside-onedrive
// OneDrive marks build outputs as cloud placeholders. Gradle then fails with
// AccessDenied / "not a regular file". Keep those outputs outside the synced folder.
def vigintelBuildRoot = new File("C:/vigintel-build")
def appBuildTarget = new File(vigintelBuildRoot, "app/build")
appBuildTarget.mkdirs()
def appBuildLink = new File(settingsDir, "app/build")
def alreadyLinked = false
try {
  alreadyLinked = appBuildLink.exists() && appBuildLink.canonicalFile.equals(appBuildTarget.canonicalFile)
} catch (Exception ignored) {
  alreadyLinked = false
}
if (!alreadyLinked) {
  if (appBuildLink.exists()) {
    def reparse = false
    try {
      def attrs = java.nio.file.Files.readAttributes(appBuildLink.toPath(), java.nio.file.attribute.DosFileAttributes.class, java.nio.file.LinkOption.NOFOLLOW_LINKS)
      reparse = attrs.isReparsePoint() || attrs.isSymbolicLink()
    } catch (Exception ignored) {
      reparse = false
    }
    def removed = reparse ? appBuildLink.delete() : appBuildLink.deleteDir()
    if (!removed && appBuildLink.exists()) {
      throw new GradleException("Não foi possível substituir android/app/build pelo build fora do OneDrive.")
    }
  }
  appBuildLink.parentFile.mkdirs()
  def linkProc = ["cmd", "/c", "mklink", "/J", appBuildLink.absolutePath, appBuildTarget.absolutePath].execute()
  linkProc.waitFor()
  if (linkProc.exitValue() != 0) {
    throw new GradleException("mklink falhou: " + linkProc.err.text)
  }
}
gradle.beforeProject { project ->
  if (project == project.rootProject) {
    return
  }
  def safeName = project.path.replace(':', '')
  project.layout.buildDirectory.set(new File(vigintelBuildRoot, safeName + "/build"))
}
`;

function withBuildDirOutsideOneDrive(config) {
  return withSettingsGradle(config, (config) => {
    let contents = config.modResults.contents;
    const marker = contents.indexOf('// vigintel-build-outside-onedrive');
    const legacy = contents.indexOf('// OneDrive marks build outputs');
    const start = marker !== -1 ? marker : legacy;
    if (start !== -1) {
      contents = contents.slice(0, start).replace(/\s*$/, '\n');
    }
    if (!contents.includes('// vigintel-build-outside-onedrive')) {
      contents = contents.replace(/\s*$/, '\n') + SNIPPET;
    }
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withBuildDirOutsideOneDrive;
