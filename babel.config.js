module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    "@babel/preset-typescript",
  ],
  plugins: [
    "babel-plugin-replace-ts-export-assignment",
    "@babel/plugin-transform-runtime",
    "@babel/plugin-transform-modules-commonjs",
  ],
};
