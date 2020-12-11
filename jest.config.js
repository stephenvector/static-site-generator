module.exports = {
  collectCoverage: true,
  verbose: true,
  transform: {
    "^.+\\.ts$": "babel-jest",
  },
  transformIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/*.json",
    "<rootDir>/stories/",
  ],
};
