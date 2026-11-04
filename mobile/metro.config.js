const { getDefaultConfig } = require("expo/metro-config");
const fs = require("node:fs");
const config = getDefaultConfig(__dirname);
// Support externally installed local dependencies; cloud builds use normal npm ci.
const modules = fs.realpathSync(
  require("node:path").join(__dirname, "node_modules"),
);
config.watchFolders = [...(config.watchFolders || []), modules];
module.exports = config;
