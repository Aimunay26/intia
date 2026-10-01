import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/** Perfiles y marcas de Equipo en tarjetas (kill-switch EQUIPO_PERFILES_TARJETAS). */
const flag = load("src/lib/team-profile-cards.ts");
const form = readFileSync(new URL("../src/app/(app)/equipo/user-form.tsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("../src/components/forms.tsx", import.meta.url), "utf8");

test("EQUIPO_PERFILES_TARJETAS: encendido por defecto; solo \"false\" lo apaga", () => {
  assert.equal(flag.profileCardsEnabled(undefined), true);
  assert.equal(flag.profileCardsEnabled(""), true);
  assert.equal(flag.profileCardsEnabled("true"), true);
  assert.equal(flag.profileCardsEnabled("0"), true);
  assert.equal(flag.profileCardsEnabled("false"), false);
  assert.equal(flag.profileCardsEnabled(" FALSE "), false);
});

test("las tarjetas envían los mismos campos que la lista de casillas", () => {
  // Dos veces cada campo: modo tarjetas y modo de siempre. El servidor no distingue.
  assert.equal(form.match(/type="checkbox" name="profiles"/g)?.length, 2);
  assert.equal(form.match(/type="checkbox" name="brandIds"/g)?.length, 2);
  // La casilla real sigue en el formulario (oculta, no eliminada) para teclado y lector de pantalla.
  assert.equal(form.match(/name="(profiles|brandIds)"[^>]*className="sr-only"/g)?.length, 2);
});

test("el Modal no hereda la alineación de la celda que lo contiene", () => {
  assert.match(modal, /className="card fade-in relative w-full text-left whitespace-normal/);
});
