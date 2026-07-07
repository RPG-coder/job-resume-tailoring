const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const dotenv = require("dotenv");
const webpack = require("webpack");

// Load the .env file
const env = dotenv.config().parsed;

// Convert it into an object that Webpack can inject
const envKeys = Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {});

module.exports = {
  mode: "development", // Switch to 'production' for release optimization
  devtool: "cheap-module-source-map", // Safe for Chrome Extension security policies
  entry: {
    background: path.resolve(__dirname, "src/background/index.ts"),
    content: path.resolve(__dirname, "src/content/index.ts"),
    sidepanel: path.resolve(__dirname, "src/sidepanel/index.tsx"),
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js", // Outputs background.js, content.js, sidepanel.js
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin(envKeys),
    new CleanWebpackPlugin(), // Clears dist/ before every build
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, "public"),
          to: path.resolve(__dirname, "dist"),
        },
      ],
    }),
  ],
};
