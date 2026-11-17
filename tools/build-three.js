// Bouwt assets/vendor/three.min.js opnieuw: Three.js als één los script
// (globale variabele THREE), zodat de app en de HTML-export ook zonder
// internet en zonder ES-modules werken (bijv. als los bestand geopend).
//
//   npm install            (haalt three en esbuild binnen)
//   npm run build:three
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'node_modules', 'three', 'build', 'three.module.js');
const out = path.join(root, 'assets', 'vendor', 'three.min.js');
if (!fs.existsSync(entry)) {
  console.error('three niet gevonden. Draai eerst: npm install');
  process.exit(1);
}
const esbuild = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
execFileSync(esbuild, [entry, '--bundle', '--format=iife', '--global-name=THREE', '--minify', '--legal-comments=inline', '--outfile=' + out], { stdio: 'inherit', shell: process.platform === 'win32' });
fs.copyFileSync(path.join(root, 'node_modules', 'three', 'LICENSE'), path.join(root, 'assets', 'vendor', 'THREE-LICENSE.txt'));
const v = require(path.join(root, 'node_modules', 'three', 'package.json')).version;
console.log('Klaar: assets/vendor/three.min.js (three ' + v + ')');
