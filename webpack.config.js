//@ts-check

'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

/**@type {import('webpack').Configuration}*/
const mainConfig = {
  target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    'original-fs': 'original-fs',
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.(css|html)$/,
        use: 'raw-loader',
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  plugins: [
    new CopyWebpackPlugin([
      {
        from: 'i18n/*.nls.*.json',
        to: __dirname,
        flatten: true
      }
    ]),
    new webpack.DefinePlugin({
      EXTENSION_ID: JSON.stringify(require("./package.json").name),
      VERSION: JSON.stringify(require("./package.json").version),
    }),
  ]
};

/**@type {import('webpack').Configuration}*/
const webviewJsConfig = {
  target: "web",

  entry: {
    focustree: './webviewsrc/focustree.ts',
    gfx: './webviewsrc/gfx.ts',
    techtree: './webviewsrc/techtree.ts',
    worldmap: './webviewsrc/worldmap/index.ts',
    eventtree: './webviewsrc/eventtree.ts',
  },
  
  output: {
    path: path.resolve(__dirname, 'static'),
    filename: '[name].js',
    library: 'window',
  },

  devtool: 'source-map',

  resolve: {
    extensions: ['.ts', '.js']
  },
  
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  plugins: [
    new CopyWebpackPlugin([
      {
        from: 'resource/**/*',
        to: path.resolve(__dirname, 'static'),
        flatten: true
      },
      {
        from: 'node_modules/vscode-codicons/dist/codicon.css',
        to: path.resolve(__dirname, 'static'),
        flatten: true
      },
      {
        from: 'node_modules/vscode-codicons/dist/codicon.ttf',
        to: path.resolve(__dirname, 'static'),
        flatten: true
      }
    ])
  ]
};

module.exports = [ mainConfig, webviewJsConfig ];