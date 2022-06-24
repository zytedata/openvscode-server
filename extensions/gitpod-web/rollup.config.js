const svelte = require('rollup-plugin-svelte');
const commonjs = require('@rollup/plugin-commonjs');
const resolve = require('@rollup/plugin-node-resolve');
const livereload = require('rollup-plugin-livereload');
const { terser } = require('rollup-plugin-terser');
const sveltePreprocess = require('svelte-preprocess');
const typescript = require('@rollup/plugin-typescript');
const css = require('rollup-plugin-css-only');
const path = require('path');
const copy = require('rollup-plugin-copy');
const json = require('@rollup/plugin-json');

// copy before packet
require('./rollup.copy');

const production = !process.env.ROLLUP_WATCH;

function serve() {
	let server;

	function toExit() {
		if (server) { server.kill(0); }
	}

	return {
		writeBundle() {
			if (server) { return; }
			server = require('child_process').spawn('npm', ['run', 'start', '--', '--dev'], {
				stdio: ['ignore', 'inherit', 'inherit'],
				shell: true
			});

			process.on('SIGTERM', toExit);
			process.on('exit', toExit);
		}
	};
}

module.exports = {
	input: path.join(__dirname, './portsview/src/main.ts'),
	output: [
		{
			sourcemap: true,
			format: 'iife',
			name: 'app',
			file: path.join(__dirname, './public/portsview.js'),
		},
	],
	plugins: [
		svelte({
			preprocess: sveltePreprocess({
				typescript: {
					tsconfigFile: './portsview/tsconfig.json'
				},
				sourceMap: !production
			}),
			compilerOptions: {
				// enable run-time checks when not in production
				dev: !production
			}
		}),
		copy({
			targets: [
				{ src: 'node_modules/@vscode/codicons/dist/codicon.ttf', dest: 'public' },
				// { src: '../package.nls.json', dest: 'public' },
			],
		}),
		json(),
		// we'll extract any component CSS out into
		// a separate file - better for performance
		css({ output: 'portsview.css' }),

		// If you have external dependencies installed from
		// npm, you'll most likely need these plugins. In
		// some cases you'll need additional configuration -
		// consult the documentation for details:
		// https://github.com/rollup/plugins/tree/master/packages/commonjs
		resolve.nodeResolve({
			browser: true,
			dedupe: ['svelte']
		}),
		commonjs(),
		typescript({
			tsconfig: './portsview/tsconfig.json'
		}),

		// In dev mode, call `npm run start` once
		// the bundle has been generated
		!production && serve(),

		// Watch the `public` directory and refresh the
		// browser on changes when not in production
		!production && livereload('public'),

		// If we're building for production (npm run build
		// instead of npm run dev), minify
		production && terser()
	],
	watch: {
		clearScreen: false
	}
};
