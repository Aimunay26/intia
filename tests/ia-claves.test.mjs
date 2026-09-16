import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

import { load } from "./load-module.mjs";
import { simulatedRequest, validScript } from "./ai-fixture.mjs";

const require = createRequire(import.meta.url);
const AnthropicSdk = require("@anthropic-ai/sdk");
const Genai = require("@google/genai");

/** Fabrica el mismo error tipado que lanzaría el SDK de Anthropic ante ese status. */
function errorClaude(status, type, message) {
  return AnthropicSdk.APIError.generate(status, { error: { type, message } }, undefined, new Headers());
}

function errorGemini(status, message) {
  return new Genai.ApiError({ status, message });
}

const sinPrisma = { "@/lib/prisma": { prisma: new Proxy({}, { get: () => assert.fail("La capa de IA no debe tocar la base en estas pruebas") }) } };

function cargarProviders(extra = {}) {
  return load("src/lib/ai/providers.ts", { ...sinPrisma, ...extra });
}

/* ------------------------------------------------------------- claves -- */

test("la clave guardada en Ajustes manda y la variable de entorno queda de respaldo", async () => {
  const before = { a: process.env.ANTHROPIC_API_KEY, g: process.env.GEMINI_API_KEY, g2: process.env.GOOGLE_API_KEY };
  try {
    process.env.ANTHROPIC_API_KEY = "env-claude";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    const filas = new Map([["ai.anthropic.apiKey", "db-claude"], ["ai.google.apiKey", ""]]);
    const prisma = { appSetting: { findUnique: async ({ where }) => (filas.has(where.key) ? { key: where.key, value: filas.get(where.key) } : null) } };
    const { resolveApiKey, describeKeySource } = load("src/lib/settings.ts", { "@/lib/prisma": { prisma } });

    assert.deepEqual(await resolveApiKey("anthropic"), { key: "db-claude", source: "db" });
    filas.set("ai.anthropic.apiKey", "");
    assert.deepEqual(await resolveApiKey("anthropic"), { key: "env-claude", source: "env" });
    assert.deepEqual(await resolveApiKey("google"), { key: null, source: null });
    process.env.GOOGLE_API_KEY = "env-google";
    assert.deepEqual(await resolveApiKey("google"), { key: "env-google", source: "env" });
    assert.deepEqual(await resolveApiKey("otro"), { key: null, source: null });

    assert.equal(describeKeySource("anthropic", "db"), "guardada en Ajustes");
    assert.match(describeKeySource("anthropic", "env"), /ANTHROPIC_API_KEY/);
    // Solo existe GOOGLE_API_KEY: el mensaje nombra la variable que hay que rotar de verdad.
    assert.match(describeKeySource("google", "env"), /GOOGLE_API_KEY/);
    assert.doesNotMatch(describeKeySource("google", "env"), /GEMINI_API_KEY/);
    process.env.GEMINI_API_KEY = "env-gemini";
    assert.deepEqual(await resolveApiKey("google"), { key: "env-gemini", source: "env" }, "GEMINI_API_KEY manda sobre el alias");
    assert.match(describeKeySource("google", "env"), /GEMINI_API_KEY/);
    delete process.env.GOOGLE_API_KEY;
    assert.match(describeKeySource("google", "env"), /GEMINI_API_KEY/);
    delete process.env.GEMINI_API_KEY;
    assert.match(describeKeySource("google", "env"), /GEMINI_API_KEY/, "sin ninguna definida se nombra la documentada");
  } finally {
    for (const [k, v] of [["ANTHROPIC_API_KEY", before.a], ["GEMINI_API_KEY", before.g], ["GOOGLE_API_KEY", before.g2]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

/* ----------------------------------------------------------- errores -- */

test("un 401 de Claude dice que la clave fue rechazada, de dónde salió y qué hacer", () => {
  const { toAiError, esErrorDeAutenticacion, esErrorDeCuota } = cargarProviders();
  const e = toAiError(errorClaude(401, "authentication_error", "invalid x-api-key"), "anthropic", "env");
  assert.equal(e.code, "auth");
  assert.match(e.message, /rechazada: está revocada o mal copiada/);
  assert.match(e.detail, /variable de entorno ANTHROPIC_API_KEY del servidor/);
  assert.match(e.detail, /console\.anthropic\.com → API keys/);
  assert.match(e.detail, /pégala en Ajustes/);
  assert.equal(esErrorDeAutenticacion(e), true);
  assert.equal(esErrorDeCuota(e), false);

  const guardada = toAiError(errorClaude(403, "permission_error", "forbidden"), "anthropic", "db");
  assert.equal(guardada.code, "auth");
  assert.match(guardada.detail, /clave guardada en Ajustes/);
});

test("esErrorDeAutenticacion reconoce un AiError por su código o por un 401/403 del diagnóstico, aunque llegue sin prototipo", () => {
  const { AiError, esErrorDeAutenticacion, esErrorDeCuota } = cargarProviders();
  // Lo que mira generation-jobs.ts para cortar el lote: el código ya clasificado…
  assert.equal(esErrorDeAutenticacion(new AiError("clave", undefined, "auth")), true);
  // …o, si llegó sin código, el status del diagnóstico.
  assert.equal(esErrorDeAutenticacion(new AiError("sin código", undefined, undefined, false, { provider: "Gemini", status: 401 })), true);
  assert.equal(esErrorDeAutenticacion(new AiError("sin código", undefined, undefined, false, { provider: "Claude", status: 403 })), true);
  // Un AiError de otra instancia del módulo o de un paso del workflow solo conserva sus campos.
  assert.equal(esErrorDeAutenticacion(Object.assign(new Error("x"), { name: "AiError", code: "auth" })), true);
  assert.equal(esErrorDeAutenticacion({ name: "AiError", diagnostic: { provider: "Gemini", status: 403 } }), true);
  // Un AiError ya clasificado con otro código no es de clave aunque el texto mencione la api key.
  assert.equal(esErrorDeAutenticacion(new AiError("api key quota", undefined, "quota", true, { provider: "Gemini", status: 429 })), false);
  assert.equal(esErrorDeAutenticacion(new AiError("Falló la generación.", "algo raro")), false);
  assert.equal(esErrorDeAutenticacion(new AiError("servidor", undefined, "server", true, { provider: "Claude", status: 500 })), false);
  assert.equal(esErrorDeCuota(new AiError("x", undefined, "auth")), false);
  // Los errores crudos del SDK siguen pasando por la clasificación de siempre.
  assert.equal(esErrorDeAutenticacion(errorGemini(403, "PERMISSION_DENIED")), true);
  assert.equal(esErrorDeAutenticacion(new Error("algo raro")), false);
});

test("un 429 de Gemini se explica como cuota del proyecto con los pasos a seguir, y el trabajo puede reintentarlo", () => {
  const { toAiError, esErrorDeCuota, esErrorDeAutenticacion } = cargarProviders();
  const e = toAiError(errorGemini(429, "Resource has been exhausted (e.g. check quota)."), "google", "env");
  assert.equal(e.code, "quota");
  assert.match(e.message, /Gemini está limitando las peticiones o agotó la cuota del proyecto/);
  assert.match(e.detail, /menos estructuras/);
  assert.match(e.detail, /activa facturación/);
  assert.match(e.detail, /medianoche/);
  assert.equal(esErrorDeCuota(e), true);
  assert.equal(esErrorDeAutenticacion(e), false);
  // Lo que mira el trabajo en segundo plano: cuota se reintenta; el diagnóstico solo lleva metadatos.
  assert.equal(e.retryable, true);
  assert.deepEqual(e.diagnostic, { provider: "Gemini", status: 429, code: undefined });

  const claude = toAiError(errorClaude(429, "rate_limit_error", "rate limited"), "anthropic", "db");
  assert.equal(claude.code, "quota");
  assert.match(claude.message, /Claude está limitando las peticiones o la cuenta se quedó sin saldo/);
  assert.equal(claude.retryable, true);

  // Clave y modelo no se reintentan; servidor y timeout sí.
  assert.equal(toAiError(errorClaude(401, "authentication_error", "invalid x-api-key"), "anthropic", "db").retryable, false);
  assert.equal(toAiError(errorGemini(404, "models/gemini-9 is not found for API version v1beta"), "google", "db").retryable, false);
  assert.equal(toAiError(errorGemini(503, "The model is overloaded."), "google", "db").retryable, true);
  const timeout = toAiError(new DOMException("The operation timed out", "TimeoutError"), "google", "db");
  assert.equal(timeout.code, "timeout");
  assert.equal(timeout.retryable, true);
  assert.match(timeout.message, /tardó demasiado/);
  const transporte = toAiError(Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_HEADERS_TIMEOUT" } }), "google", "db");
  assert.equal(transporte.code, "timeout");
  assert.equal(transporte.diagnostic.code, "UND_ERR_HEADERS_TIMEOUT");
});

test("Claude avisa la falta de saldo como 400 invalid_request_error y se clasifica como cuota", () => {
  const { toAiError, clasificarError, esErrorDeCuota } = cargarProviders();
  const sinSaldo = errorClaude(
    400,
    "invalid_request_error",
    "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."
  );
  assert.ok(sinSaldo instanceof AnthropicSdk.BadRequestError, "el SDK lo tipa como BadRequestError, no como RateLimitError");
  assert.equal(clasificarError(sinSaldo), "quota");
  assert.equal(esErrorDeCuota(sinSaldo), true);
  const e = toAiError(sinSaldo, "anthropic", "db");
  assert.equal(e.code, "quota");
  assert.match(e.message, /la cuenta se quedó sin saldo/);
  assert.match(e.detail, /console\.anthropic\.com → Billing/);

  // El mismo texto por la rama genérica de status 400 (envoltorio sin clase del SDK).
  assert.equal(clasificarError(errorGemini(400, "credit balance is too low")), "quota");
});

test("Gemini avisa una clave mal copiada como 400 y se clasifica como autenticación", () => {
  const { toAiError } = cargarProviders();
  const e = toAiError(errorGemini(400, "API key not valid. Please pass a valid API key."), "google", "db");
  assert.equal(e.code, "auth");
  assert.match(e.detail, /guardada en Ajustes/);
  assert.match(e.detail, /aistudio\.google\.com → Get API key/);
});

test("las clases tipadas del SDK mandan sobre el texto: un 400 de esquema que menciona 'model' no es 'modelo desconocido'", () => {
  const { toAiError, esErrorDeEsquema, clasificarError } = cargarProviders();
  const esquema = toAiError(
    errorClaude(400, "invalid_request_error", "output_config.format: schema not supported for this model"),
    "anthropic",
    "db"
  );
  assert.equal(esquema.code, "schema");
  assert.equal(esErrorDeEsquema(esquema), true);

  assert.equal(clasificarError(errorClaude(404, "not_found_error", "model: claude-x")), "model");
  assert.equal(clasificarError(errorClaude(500, "api_error", "Internal server error")), "server");
  assert.equal(clasificarError(errorClaude(529, "overloaded_error", "Overloaded")), "server");
  assert.equal(clasificarError(errorGemini(404, "models/gemini-9 is not found for API version v1beta")), "model");
  assert.equal(clasificarError(errorGemini(503, "The model is overloaded.")), "server");
  assert.equal(clasificarError(errorGemini(400, 'Invalid JSON payload received. Unknown name "responseJsonSchema"')), "schema");
  assert.equal(clasificarError(new Error("fetch failed")), "server");
  assert.equal(clasificarError(new Error("algo raro")), null);

  const generico = toAiError(new Error("algo raro"), "google", null);
  assert.equal(generico.code, undefined);
  assert.equal(generico.detail, "algo raro");
});

/* ------------------------------------------------- Gemini sin doble llamada -- */

function providersConGemini(respuestas) {
  const llamadas = [];
  class GoogleGenAI {
    constructor() {
      this.models = {
        generateContent: async (req) => {
          llamadas.push(req);
          const r = respuestas.shift();
          if (r instanceof Error) throw r;
          return r;
        },
      };
    }
  }
  const mod = cargarProviders({ "@google/genai": { ApiError: Genai.ApiError, GoogleGenAI } });
  return { ...mod, llamadas };
}

const respuestaValida = { text: JSON.stringify({ ...validScript, title: "Guion" }), usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 } };
const llamadaGemini = { request: simulatedRequest, apiKey: "k", model: "gemini-3.8-flash", system: "s", user: "u", keySource: "env" };

test("Gemini: un 429, un 401, un 5xx, un 400 de clave/modelo/configuración se reportan a la primera, sin gastar una segunda petición", async () => {
  for (const [error, code, mensaje] of [
    [errorGemini(429, "quota exceeded"), "quota", /limitando/],
    [errorGemini(403, "PERMISSION_DENIED"), "auth", /clave/],
    [errorGemini(503, "overloaded"), "server", /error de servidor/],
    [errorGemini(400, "API key not valid. Please pass a valid API key."), "auth", /clave/],
    [errorGemini(404, "models/gemini-9 is not found for API version v1beta"), "model", /no reconoce/],
    // Un 400 de configuración (parámetro que el modelo no acepta) no es esquema ni modelo desconocido.
    [errorGemini(400, "generateContent: Model does not support temperature"), undefined, /configuración/],
  ]) {
    const { generateWithGemini, llamadas } = providersConGemini([error, respuestaValida]);
    await assert.rejects(
      generateWithGemini(llamadaGemini),
      (e) => e.name === "AiError" && e.code === code && mensaje.test(e.message)
    );
    assert.equal(llamadas.length, 1, `con ${code ?? "configuración"} no debe reintentar`);
  }
});

test("Gemini: un 400 de esquema, o el 400 genérico «invalid argument», provoca el reintento sin responseJsonSchema", async () => {
  for (const error of [
    errorGemini(400, 'Invalid JSON payload received. Unknown name "responseJsonSchema"'),
    // Así responde Gemini a varias combinaciones de esquema que no soporta, sin nombrarlo.
    errorGemini(400, "Request contains an invalid argument."),
  ]) {
    const { generateWithGemini, llamadas } = providersConGemini([error, respuestaValida]);
    const result = await generateWithGemini(llamadaGemini);
    assert.equal(llamadas.length, 2, `debe reintentar ante: ${error.message}`);
    assert.ok("responseJsonSchema" in llamadas[0].config);
    assert.ok(!("responseJsonSchema" in llamadas[1].config));
    assert.ok(!("temperature" in llamadas[0].config), "Gemini 3.8 no acepta temperature");
    assert.equal(result.script.title, "Guion");
    assert.equal(result.inputTokens, 1);
  }

  // Si el reintento también falla, el error que se reporta es el del segundo intento.
  const { generateWithGemini, llamadas } = providersConGemini([
    errorGemini(400, "Request contains an invalid argument."),
    errorGemini(429, "quota exceeded"),
  ]);
  await assert.rejects(
    generateWithGemini(llamadaGemini),
    (e) => e.name === "AiError" && e.code === "quota"
  );
  assert.equal(llamadas.length, 2);
});

/* ------------------------------------------------- modelo por defecto -- */

test("el generador usa el 'Modelo por defecto' de Ajustes entre la estructura y el catálogo, y pasa keySource", async () => {
  const ajustes = new Map([["ai.anthropic.model", "claude-sonnet-5"], ["ai.anthropic.apiKey", "db-claude"]]);
  const prisma = {
    structure: { findUnique: async () => ({ id: "s1", name: "E", category: "VENDE", family: "f", summary: "", beats: "[]", systemPrompt: "", rules: "[]", examples: "[]", defaultDurationSec: 30, defaultProvider: "anthropic", defaultModel: "", temperature: 0.7 }) },
    asset: { findMany: async () => [] },
    appSetting: {
      findUnique: async ({ where }) => (ajustes.has(where.key) ? { key: where.key, value: ajustes.get(where.key) } : null),
      findMany: async ({ where }) => where.key.in.filter((k) => ajustes.has(k)).map((k) => ({ key: k, value: ajustes.get(k) })),
    },
  };
  const capturadas = [];
  const providers = cargarProviders({ "@/lib/prisma": { prisma } });
  const { generateScript } = load("src/lib/ai/index.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/ai/providers": {
      ...providers,
      generateWithClaude: async (call) => { capturadas.push(call); return { script: { title: "x" }, raw: "{}", provider: "anthropic", model: call.model }; },
      generateWithGemini: async () => assert.fail("no debía llamar a Gemini"),
    },
  });

  await generateScript({ structureId: "s1", request: "hola" });
  assert.equal(capturadas[0].model, "claude-sonnet-5");
  assert.equal(capturadas[0].keySource, "db");

  ajustes.delete("ai.anthropic.model");
  await generateScript({ structureId: "s1", request: "hola" });
  assert.equal(capturadas[1].model, "claude-opus-5", "sin ajuste cae en el predeterminado del catálogo");

  await generateScript({ structureId: "s1", request: "hola", model: "claude-haiku-4-5" });
  assert.equal(capturadas[2].model, "claude-haiku-4-5", "lo elegido en el generador sigue mandando");

  // Un modelo fuera del catálogo se rechaza antes de llamar al proveedor.
  await assert.rejects(generateScript({ structureId: "s1", request: "hola", model: "claude-inventado" }), /catálogo/);
  assert.equal(capturadas.length, 3);

  ajustes.delete("ai.anthropic.apiKey");
  const sinEnv = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(generateScript({ structureId: "s1", request: "hola" }), (e) => e.code === "auth" && /ANTHROPIC_API_KEY/.test(e.detail));
  } finally {
    if (sinEnv !== undefined) process.env.ANTHROPIC_API_KEY = sinEnv;
  }
});

/* ------------------------------------------------------ probar clave -- */

function cargarProbarClave({ nivel, clave, sdkClaude, sdkGemini }) {
  const settings = load("src/lib/settings.ts", sinPrisma);
  const providers = cargarProviders();
  class FakeAnthropic extends AnthropicSdk.default {
    constructor(opts) {
      super({ apiKey: opts.apiKey });
      this.messages = { create: async (req) => sdkClaude(req, opts) };
    }
  }
  class FakeGenAI {
    constructor(opts) {
      this.models = {
        get: async (req) => sdkGemini(req, opts),
        generateContent: async () => assert.fail("probar la clave de Gemini no debe generar tokens"),
      };
    }
  }
  return load("src/app/actions/probar-clave.ts", {
    ...sinPrisma,
    "@/lib/ai/request-budget": { createAiRequest: () => simulatedRequest },
    "@anthropic-ai/sdk": { __esModule: true, default: FakeAnthropic },
    "@google/genai": { ApiError: Genai.ApiError, GoogleGenAI: FakeGenAI },
    "@/lib/ai/providers": providers,
    "@/lib/settings": {
      ...settings,
      resolveApiKey: async () => clave,
    },
    "@/lib/auth": {
      requirePermission: async (capability) => {
        assert.equal(capability, "admin.settings");
        if (nivel < 2) throw new Error("No tienes permisos para hacer esto.");
        return { id: "u", role: "OWNER" };
      },
    },
  });
}

test("probar una clave exige la capacidad de ajustes (dueño) y avisa cuando no hay ninguna en uso", async () => {
  const miembro = cargarProbarClave({ nivel: 1, clave: { key: "k", source: "db" }, sdkClaude: () => assert.fail("no debe llamar") });
  await assert.rejects(miembro.probarClaveIA({ provider: "anthropic" }), /permisos/);
  await assert.rejects(miembro.probarClaveIA({ provider: "anthropic", apiKey: "sk-escrita" }), /permisos/);

  const sinClave = cargarProbarClave({ nivel: 2, clave: { key: null, source: null }, sdkClaude: () => assert.fail("no debe llamar") });
  const r = await sinClave.probarClaveIA({ provider: "anthropic", apiKey: "" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "auth");
  assert.match(r.error, /ni guardada en Ajustes ni en la variable de entorno/);
});

test("probar la clave en uso usa un modelo barato vigente y dice el origen y los ms", async () => {
  const peticiones = [];
  const mod = cargarProbarClave({
    nivel: 2,
    clave: { key: "sk-env", source: "env" },
    sdkClaude: async (req, opts) => { peticiones.push({ req, apiKey: opts.apiKey }); return {}; },
  });
  const r = await mod.probarClaveIA({ provider: "anthropic" });
  assert.equal(r.ok, true);
  assert.equal(r.origen, "env");
  assert.equal(peticiones[0].req.model, "claude-haiku-4-5");
  assert.equal(peticiones[0].req.max_tokens, 1);
  assert.equal(peticiones[0].apiKey, "sk-env");
  assert.match(r.mensaje, /Clave de Claude válida · de la variable de entorno ANTHROPIC_API_KEY del servidor · \d+ ms/);
  assert.match(r.mensaje, /claude-haiku-4-5/);
});

test("probar la clave de Gemini consulta el modelo del catálogo sin generar y no afirma saldo", async () => {
  const consultas = [];
  const mod = cargarProbarClave({
    nivel: 2,
    clave: { key: "AIza-db", source: "db" },
    sdkGemini: async (req, opts) => { consultas.push({ req, apiKey: opts.apiKey, timeout: opts.httpOptions?.timeout }); return { name: req.model }; },
  });
  const r = await mod.probarClaveIA({ provider: "google" });
  assert.equal(r.ok, true);
  assert.equal(r.origen, "db");
  assert.deepEqual(consultas.map((c) => c.req.model), ["gemini-3.8-flash"]);
  assert.equal(consultas[0].apiKey, "AIza-db");
  assert.equal(consultas[0].timeout, 15000);
  assert.match(r.mensaje, /Clave de Gemini válida · guardada en Ajustes · \d+ ms/);
  assert.match(r.mensaje, /cuota.*al generar/);
  assert.doesNotMatch(r.mensaje, /saldo verificado/);

  // Un valor heredado se normaliza; uno fuera del catálogo no llega al proveedor.
  const heredado = await mod.probarClaveIA({ provider: "google", model: "gemini-2.5-pro" });
  assert.equal(heredado.ok, true);
  assert.equal(consultas.at(-1).req.model, "gemini-3.8-flash");
  const raro = await mod.probarClaveIA({ provider: "google", model: "gemini-inventado" });
  assert.equal(raro.ok, false);
  assert.equal(raro.code, "model");
  assert.match(raro.error, /catálogo/);
  assert.equal(consultas.length, 2);
});

test("probar una clave escrita no la guarda y usa el mismo criterio de errores que el generador", async () => {
  const mod = cargarProbarClave({
    nivel: 2,
    clave: { key: "no-se-usa", source: "db" },
    sdkClaude: async () => { throw errorClaude(401, "authentication_error", "invalid x-api-key"); },
    sdkGemini: async (req) => { assert.equal(req.model, "gemini-3.8-flash"); throw errorGemini(429, "quota"); },
  });
  const claude = await mod.probarClaveIA({ provider: "anthropic", apiKey: "  sk-ant-escrita  " });
  assert.equal(claude.ok, false);
  assert.equal(claude.code, "auth");
  assert.equal(claude.origen, "input");
  assert.match(claude.error, /rechazada: está revocada o mal copiada/);
  assert.match(claude.error, /Se probó la clave que escribiste, sin guardarla/);

  const gemini = await mod.probarClaveIA({ provider: "google", apiKey: "AIza-escrita" });
  assert.equal(gemini.code, "quota");
  assert.match(gemini.error, /limitando las peticiones o agotó la cuota del proyecto/);

  const raro = await mod.probarClaveIA({ provider: "otro", apiKey: "x" });
  assert.match(raro.error, /Proveedor desconocido/);
});

test("probar la clave: el 400 sin saldo de Claude avisa de saldo, y un error sin código no habla de «generación»", async () => {
  const mod = cargarProbarClave({
    nivel: 2,
    clave: { key: "sk-db", source: "db" },
    sdkClaude: async () => {
      throw errorClaude(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.");
    },
    sdkGemini: async () => { throw new Error("algo raro"); },
  });
  const sinSaldo = await mod.probarClaveIA({ provider: "anthropic" });
  assert.equal(sinSaldo.ok, false);
  assert.equal(sinSaldo.code, "quota");
  assert.match(sinSaldo.error, /la cuenta se quedó sin saldo/);
  assert.match(sinSaldo.error, /console\.anthropic\.com → Billing/);
  assert.doesNotMatch(sinSaldo.error, /credit balance|generación/);

  const raro = await mod.probarClaveIA({ provider: "google", apiKey: "AIza-escrita" });
  assert.equal(raro.ok, false);
  assert.equal(raro.code, undefined);
  assert.match(raro.error, /^No se pudo probar la clave de Gemini\. algo raro$/);
  assert.doesNotMatch(raro.error, /generación/);
});
