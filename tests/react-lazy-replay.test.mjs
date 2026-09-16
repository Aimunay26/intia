// Contrato que consume resolveLazy del React incluido en Next (corrección upstream 35521).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const React = require('next/dist/compiled/react/cjs/react.production.js');

test('la promesa lazy resuelta permite reanudar el render de producción', async () => {
  const module = {default: () => null};
  const promise = Promise.resolve(module);
  const lazy = React.lazy(() => promise);
  assert.throws(() => lazy._init(lazy._payload), error => error === promise);
  await promise;
  assert.equal(promise.status, 'fulfilled');
  assert.equal(promise.value, module);
  assert.equal(lazy._init(lazy._payload), module.default);
});

test('la promesa lazy rechazada permite propagar el fallo sin quedar pendiente', async () => {
  const reason = new Error('Fallo de módulo de prueba');
  const promise = Promise.reject(reason);
  const lazy = React.lazy(() => promise);
  assert.throws(() => lazy._init(lazy._payload), error => error === promise);
  await assert.rejects(promise, error => error === reason);
  assert.equal(promise.status, 'rejected');
  assert.equal(promise.reason, reason);
  assert.throws(() => lazy._init(lazy._payload), error => error === reason);
});

test('lazy respeta una promesa que ya tiene estado definido', async () => {
  const module = {default: () => null};
  const promise = Promise.resolve(module);
  promise.status = 'custom-status';
  const lazy = React.lazy(() => promise);
  assert.throws(() => lazy._init(lazy._payload), error => error === promise);
  await promise;
  assert.equal(promise.status, 'custom-status');
  assert.equal(lazy._init(lazy._payload), module.default);
});
