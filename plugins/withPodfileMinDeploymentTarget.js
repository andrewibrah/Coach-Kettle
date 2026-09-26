const { withPodfile } = require('expo/config-plugins');

// Several third-party pods (RNSVG, RevenueCat, RNCAsyncStorage, SDWebImage, etc.)
// ship podspecs with iOS deployment targets older than current Xcode supports, which makes
// `pod install` / `xcodebuild` fail with:
//   "The iOS Simulator deployment target ... is set to X, but the range of supported
//    deployment target versions is 15.0 to Y.x."
// This plugin patches the generated Podfile's post_install hook to bump every pod target's
// IPHONEOS_DEPLOYMENT_TARGET up to the app's minimum whenever it's lower.
const MARKER = '# @generated withPodfileMinDeploymentTarget';

const INJECTION = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_configuration|
        deployment_target = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        min_deployment_target = podfile_properties['ios.deploymentTarget'] || '15.1'
        if deployment_target && deployment_target.to_f < min_deployment_target.to_f
          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = min_deployment_target
        end
      end
    end
`;

function withPodfileMinDeploymentTarget(config) {
  return withPodfile(config, (config) => {
    const contents = config.modResults.contents;

    if (contents.includes(MARKER)) {
      return config;
    }

    const postInstallMatch = contents.match(/(post_install do \|installer\|[\s\S]*?)\n(\s*)end/);
    if (!postInstallMatch) {
      console.warn(
        '[withPodfileMinDeploymentTarget] Could not find `post_install` block in Podfile; skipping deployment target patch.'
      );
      return config;
    }

    const [fullMatch, body, indent] = postInstallMatch;
    const patched = `${body}\n${INJECTION}${indent}end`;
    config.modResults.contents = contents.replace(fullMatch, patched);

    return config;
  });
}

module.exports = withPodfileMinDeploymentTarget;
