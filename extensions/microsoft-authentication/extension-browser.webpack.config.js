/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const path = require('path');
const withBrowserDefaults = require('../shared.webpack.config').browser;

module.exports = withBrowserDefaults({
	context: __dirname,
	node: false,
	entry: {
		extension: './src/extension.ts',
	},
	externals: {
		'keytar': 'commonjs keytar'
	},
	resolve: {
		alias: {
			'@env': path.resolve(__dirname, 'src/env/browser'),
			'buffer': path.resolve(__dirname, 'node_modules/buffer/index.js'),
			'node-fetch': path.resolve(__dirname, 'node_modules/node-fetch/browser.js'),
			'randombytes': path.resolve(__dirname, 'node_modules/randombytes/browser.js'),
			'stream': path.resolve(__dirname, 'node_modules/stream/index.js'),
			'uuid': path.resolve(__dirname, 'node_modules/uuid/dist/esm-browser/index.js')
		}
	},
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: /node_modules/,
			use: [{
				// configure TypeScript loader:
				// * enable sources maps for end-to-end source maps
				loader: 'ts-loader',
				options: {
					configFile: 'tsconfig.browser.json',
					compilerOptions: {
						'sourceMap': true,
					}
				}
			}]
		}]
	},
});
