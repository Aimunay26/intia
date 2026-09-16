/** Impide publicar un bundle antiguo recuperado de la caché de Webpack. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const directory = new URL('../.next/static/chunks/', import.meta.url);
const renderers = fs.readdirSync(directory).filter(name => name.endsWith('.js')).map(name => ({
  name, code: fs.readFileSync(new URL(name, directory), 'utf8'),
})).filter(({code}) => code.includes('19.2.0-canary-0bdb9206-20250818') && code.includes('hydrateRoot='));
assert.equal(renderers.length, 1, 'Revisar la verificación del runtime al cambiar Next o su bundler');
for (const {name, code} of renderers) {
  assert.ok(/0x3f00000|66060288/.test(code), 'El navegador debe recibir el backport de React: ' + name);
  assert.ok(!/0x3e00000|65011712/.test(code), 'Bundle obsoleto de React: ' + name);
}
console.log('Runtime de React del bundle de navegador verificado.');
