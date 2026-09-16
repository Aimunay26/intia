/** Backport temporal de React, licencia MIT (Meta Platforms, Inc. y colaboradores).
 * Fuentes: https://github.com/react/react/pull/35518 y /pull/35521.
 * Next 15.5.24 incorpora React de agosto de 2025, anterior a estas correcciones.
 * Eliminar al actualizar a una versión que las incluya y pase las regresiones.
 * Falla ante otro paquete/contenido; nunca modifica dependencias desconocidas.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root = new URL('../node_modules/next/', import.meta.url);
const version = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8')).version;
assert.equal(version, '15.5.24', 'Revisar y retirar/adaptar el backport de React al actualizar Next');
const masks = [['65011712', '66060288'], ['65011714', '66060290']];
const patches = [
  ['react-dom/cjs/react-dom-client.production.js', '9bcaacd92279559075407d2fb09b19893f03f9b93ad74eb0ef42b31b66f6053e', masks],
  ['react-dom/cjs/react-dom-client.development.js', '14c33685b88f2e39827dc6f0515f9d44411958758aef6573686468163465f6bb', masks],
  ['react-dom/cjs/react-dom-profiling.profiling.js', '2a2f9a79c0d5906720e6833f1d0cc605379b004279ca1b1ef37142a5fe392178', masks],
  ['react/cjs/react.production.js', '125bcbc3a09182b916dce9d7e0d4b1b569f8e994f4bb98ae0d54855f9b74bfb7', [
    ['if (0 === payload._status || -1 === payload._status)\n          (payload._status = 1), (payload._result = moduleObject);',
     'if (0 === payload._status || -1 === payload._status) {\n          (payload._status = 1), (payload._result = moduleObject);\n          if (void 0 === ctor.status) { ctor.status = "fulfilled"; ctor.value = moduleObject; }\n        }'],
    ['if (0 === payload._status || -1 === payload._status)\n          (payload._status = 2), (payload._result = error);',
     'if (0 === payload._status || -1 === payload._status) {\n          (payload._status = 2), (payload._result = error);\n          if (void 0 === ctor.status) { ctor.status = "rejected"; ctor.reason = error; }\n        }'],
  ]],
];
const hash = text => createHash('sha256').update(text).digest('hex');
const writes = [];
for (const [file, originalHash, replacements] of patches) {
  const path = new URL('dist/compiled/' + file, root);
  const text = fs.readFileSync(path, 'utf8');
  if (hash(text) === originalHash) {
    let patched = text;
    for (const [before, after] of replacements) {
      assert.ok(patched.includes(before), 'No se encontró el bloque de ' + file);
      patched = patched.replaceAll(before, after);
    }
    writes.push([path, patched]);
  } else {
    let restored = text;
    for (const [before, after] of replacements) restored = restored.replaceAll(after, before);
    assert.equal(hash(restored), originalHash, 'Contenido inesperado en ' + file);
  }
}
// Verificar TODOS los archivos antes de escribir para evitar un backport parcial.
for (const [path, text] of writes) fs.writeFileSync(path, text);
console.log(`React: backport 35518/35521 verificado (Next ${version}; ${writes.length} archivos actualizados).`);
