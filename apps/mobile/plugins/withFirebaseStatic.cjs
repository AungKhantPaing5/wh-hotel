const { withPodfile } = require("expo/config-plugins");
module.exports = function withFirebaseStatic(config) {
  return withPodfile(config, (config) => {
    const flag = "$RNFirebaseAsStaticFramework = true";
    if (!config.modResults.contents.includes(flag)) {
      config.modResults.contents = flag + "\n" + config.modResults.contents;
    }
    return config;
  });
};
