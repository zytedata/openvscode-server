// @ts-check

const fs = require('fs');
const { join } = require('path');

const targets = [
	{ src: 'package.nls.json', dest: './public/package.nls.json' },
];

if (!fs.existsSync('./public')) {
	fs.mkdirSync('./public');
}

for (const t of targets) {
	fs.copyFileSync(join(__dirname, t.src), join(__dirname, t.dest));
}
