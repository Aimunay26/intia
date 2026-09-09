import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { load } from "./load-module.mjs";
const policy = load("src/lib/auth-policy.ts");
const assets = load("src/lib/asset-security.ts");
const bytes = value => new TextEncoder().encode(value);

test("los secretos públicos, vacíos o con espacios no son válidos", () => {
  for (const secret of [undefined, "", " ".repeat(64), "cambia-esto-por-una-cadena-larga-y-aleatoria-de-al-menos-32-caracteres", "a".repeat(64), "abc123", ` ${randomBytes(32).toString("hex")}`]) assert.equal(policy.isStrongSecret(secret), false);
  const good = randomBytes(32).toString("hex"); assert.equal(policy.isStrongSecret(good), true);
  assert.equal(policy.equalSecret(good, good), true); assert.equal(policy.equalSecret(good, good + "x"), false);
});
test("bcrypt no acepta contraseñas diferentes truncadas al mismo prefijo", () => {
  assert.equal(policy.passwordError("correcta-de-prueba"), null);
  assert.ok(policy.passwordError("x".repeat(73))); assert.ok(policy.passwordError("ñ".repeat(37)));
});
test("la validación de archivos usa extensión y bytes, no el MIME declarado", () => {
  assert.equal(assets.validateAssetContent("nota.txt", bytes("Información de la marca")), "text/plain");
  assert.equal(assets.validateAssetContent("datos.json", bytes('{"key":1}')), "application/json");
  assert.equal(assets.validateAssetContent("documento.pdf", bytes("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF")), "application/pdf");
  for (const [name, data] of [["ataque.html", "hola"], ["falso.pdf", "<html>malicioso</html>"], ["falso.txt", "<svg onload='x'>"], ["doble.pdf.html", "%PDF-1.7\n%%EOF"], ["datos.json", "no es json"], ["../nota.txt", "hola"]]) assert.throws(() => assets.validateAssetContent(name, bytes(data)));
  assert.throws(() => assets.validateAssetContent("binario.txt", new Uint8Array([0,255,3])));
});
test("archivos antiguos también se descargan sin ejecutarse en el origen de la sesión", () => {
  const headers = assets.assetDownloadHeaders('viejo"\r\n.html', 18);
  assert.equal(headers["Content-Type"], "application/octet-stream");
  assert.match(headers["Content-Disposition"], /^attachment;/); assert.doesNotMatch(headers["Content-Disposition"], /[\r\n]/);
  assert.match(headers["Content-Security-Policy"], /sandbox/); assert.equal(headers["X-Content-Type-Options"], "nosniff"); assert.match(headers["Cache-Control"], /no-store/);
});
