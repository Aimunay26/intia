import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/** Estado de presentación del visor de guiones (src/components/scripts/viewer-state.ts). */
const visor = load("src/components/scripts/viewer-state.ts");

test("GUIONES_AJUSTE_PANTALLA: encendido por defecto; solo \"false\" lo apaga", () => {
  assert.equal(visor.fitModeEnabled(undefined), true);
  assert.equal(visor.fitModeEnabled(""), true);
  assert.equal(visor.fitModeEnabled("true"), true);
  assert.equal(visor.fitModeEnabled("0"), true);
  assert.equal(visor.fitModeEnabled("false"), false);
  assert.equal(visor.fitModeEnabled(" FALSE "), false);
});

test("?escena se lee de la búsqueda o de URLSearchParams y rechaza valores extraños", () => {
  assert.equal(visor.readSceneParam("?escena=cm1abc_2-x"), "cm1abc_2-x");
  assert.equal(visor.readSceneParam("q=1&escena=abc"), "abc");
  assert.equal(visor.readSceneParam(new URLSearchParams("escena=abc")), "abc");
  assert.equal(visor.readSceneParam("?escena="), null);
  assert.equal(visor.readSceneParam("?escena=a%20b"), null);
  assert.equal(visor.readSceneParam("?escena=" + "x".repeat(65)), null);
  assert.equal(visor.readSceneParam("?otra=1"), null);
  assert.equal(visor.readSceneParam(null), null);
});

test("withSceneParam conserva ruta, otros parámetros y ancla", () => {
  assert.equal(visor.withSceneParam("http://localhost:3000/guiones/g1?x=1#top", "e2"), "/guiones/g1?x=1&escena=e2#top");
  assert.equal(visor.withSceneParam("/guiones/g1?escena=e1", "e3"), "/guiones/g1?escena=e3");
  assert.equal(visor.withSceneParam("/guiones/g1?escena=e1&x=1", null), "/guiones/g1?x=1");
  assert.equal(visor.withSceneParam("/guiones/g1", "no válido"), "/guiones/g1");
});

test("resolveSceneIndex sigue el ID y, si desaparece, acota la posición anterior", () => {
  const ids = ["a", "b", "c"];
  assert.equal(visor.resolveSceneIndex(ids, "c", 0), 2);
  assert.equal(visor.resolveSceneIndex(ids, "borrada", 1), 1);
  assert.equal(visor.resolveSceneIndex(ids, "borrada", 9), 2);
  assert.equal(visor.resolveSceneIndex(ids, null, -3), 0);
  assert.equal(visor.resolveSceneIndex([], "a", 4), 0);
});

test("sceneKeyStep: ←/→ solo fuera de campos, widgets y sin modificadores", () => {
  const button = { tagName: "BUTTON" };
  assert.equal(visor.sceneKeyStep({ key: "ArrowRight" }, button), 1);
  assert.equal(visor.sceneKeyStep({ key: "ArrowLeft" }, null), -1);
  assert.equal(visor.sceneKeyStep({ key: "ArrowDown" }, button), 0);
  assert.equal(visor.sceneKeyStep({ key: "ArrowRight" }, { tagName: "textarea" }), 0);
  assert.equal(visor.sceneKeyStep({ key: "ArrowRight" }, { tagName: "SELECT" }), 0);
  assert.equal(visor.sceneKeyStep({ key: "ArrowRight" }, { tagName: "DIV", isContentEditable: true }), 0);
  assert.equal(visor.sceneKeyStep({ key: "ArrowRight" }, { tagName: "BUTTON", inWidget: true }), 0);
  assert.equal(visor.sceneKeyStep({ key: "ArrowRight", altKey: true }, button), 0);
  assert.equal(visor.sceneKeyStep({ key: "ArrowLeft", defaultPrevented: true }, button), 0);
});
