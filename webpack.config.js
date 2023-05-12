//@ts-check

'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
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
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'i18n/*.nls.*.json',
          to: path.resolve(__dirname, '[name][ext]')
        }
      ]
    }),
    new webpack.DefinePlugin({
      EXTENSION_ID: JSON.stringify(require("./package.json").name),
      VERSION: JSON.stringify(require("./package.json").version),
      IS_WEB_EXT: false,
    }),
  ],
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: /\w*Loader$/,
        },
        extractComments: false,
      })
    ]
  }
};

/**@type {import('webpack').Configuration}*/
const mainWebConfig = {
  target: 'webworker', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'web-extension.js',
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
    extensions: ['.ts', '.js'],
    fallback: {
      assert: require.resolve('assert/'),
      buffer: require.resolve('buffer/'),
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser'),
      stream: require.resolve('stream-browserify'),
      url: require.resolve('url/'),
      util: require.resolve('util'),
      zlib: require.resolve("browserify-zlib"),
    },
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
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'i18n/*.nls.*.json',
          to: path.resolve(__dirname, '[name][ext]')
        }
      ]
    }),
    new webpack.DefinePlugin({
      EXTENSION_ID: JSON.stringify(require("./package.json").name),
      VERSION: JSON.stringify(require("./package.json").version),
      IS_WEB_EXT: true,
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser', // provide a shim for the global `process` variable
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: /\w*Loader$/,
        },
        extractComments: false,
      })
    ]
  }
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
    // @ts-ignore
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'resource/**/*',
          to: path.resolve(__dirname, 'static', '[name][ext]')
        },
        {
          from: 'node_modules/@vscode/codicons/dist/codicon.css',
          to: path.resolve(__dirname, 'static', '[name][ext]')
        },
        {
          from: 'node_modules/@vscode/codicons/dist/codicon.ttf',
          to: path.resolve(__dirname, 'static', '[name][ext]')
        }
      ]
    })
  ],
  optimization: {
    splitChunks: {
      cacheGroups: {
        common: {
          name: 'common',
          chunks: 'initial',
          minChunks: 2,
          priority: 2,
        }
      }
    }
  }
};

module.exports = [ mainConfig, mainWebConfig, webviewJsConfig ];
