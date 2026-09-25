import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/**
 * Regresión del parser de PDF de branding y de brief maestro.
 *
 * Las fixtures son anónimas: misma maquetación que los PDF reales de Ai Munay
 * (encabezados con letras separadas, marcadores «2 / 13», pies del brief),
 * pero con nombres, RUC, teléfonos, correos, direcciones y cifras de ejemplo.
 *
 * Ejecutar: node --test tests/branding-parser.test.mjs
 */

const pdf = load("src/lib/pdf.ts");
const parser = load("src/lib/branding-parser.ts");

const fixture = (name) =>
  fs.readFileSync(path.resolve(import.meta.dirname, "fixtures", name), "utf8");

const informeCrudo = fixture("informe-branding-eru.txt");
const briefCrudo = fixture("brief-maestro-marca-ejemplo.txt");
const informe = pdf.limpiarTextoInforme(informeCrudo);
const brief = pdf.limpiarTextoInforme(briefCrudo);

test("la limpieza junta los encabezados espaciados y quita marcadores de página", () => {
  const lineas = informe.split("\n");
  for (const encabezado of ["INFORME DE BRANDING", "TONO", "EVITA", "SUENA ASÍ", "VOCABULARIO", "NOTA METODOLÓGICA", "HACIA DÓNDE EVOLUCIONAR"]) {
    assert.ok(lineas.includes(encabezado), `falta ${encabezado} en línea propia`);
  }
  assert.doesNotMatch(informe, /^\d{1,2} \/ \d{1,2}$/m);
  assert.doesNotMatch(brief, /BRIEF DE MARCA · AIMUNAY/);
  assert.ok(brief.split("\n").includes("BRIEF MAESTRO DE MARCA"));
  // El nombre de la portada queda solo en su línea, delante del título.
  assert.equal(lineas[lineas.indexOf("INFORME DE BRANDING") - 1], "Eru");
  // Y no se toca texto corriente que casualmente contenga las letras de un encabezado.
  assert.equal(pdf.limpiarTextoInforme("ESTO NO ES UN TONO NUEVO"), "ESTO NO ES UN TONO NUEVO");
});

test("detecta el tipo de documento", () => {
  assert.equal(parser.detectarTipoDocumento(informe), "branding");
  assert.equal(parser.detectarTipoDocumento(brief), "brief");
  assert.equal(parser.detectarTipoDocumento("Un PDF cualquiera sin nada que ver."), null);
});

test("informe de branding → ficha de la persona, sin inventar nada", () => {
  const { campos, fuentes, avisos } = parser.parseInformeBranding(informe);

  assert.equal(campos.name, "Eru");
  assert.equal(campos.archetypePrimary, "El Gobernante");
  assert.equal(campos.archetypeSecondary, "El Forajido");
  assert.equal(campos.archetypeTertiary, "El Héroe");
  assert.match(campos.archetypeSummary, /^Tu marca representa el estándar/);
  assert.doesNotMatch(campos.archetypeSummary, /Deseo central/);

  assert.equal(campos.coreDesire, "Control: crear una comunidad o sistema próspero y ordenado.");
  assert.equal(campos.coreFear, "El caos, ser derrocado y perder el control de lo que ha construido.");
  assert.equal(campos.coreTalent, "Liderazgo, criterio, capacidad de organizar y de asumir la responsabilidad final.");
  // La trampa ocupa dos líneas en el PDF: se lee completa.
  assert.equal(
    campos.coreTrap,
    "El autoritarismo y la rigidez: controlar por miedo, aplastar la disidencia y confundir orden con obediencia."
  );
  assert.match(campos.evolveToward, /^Pasar del control al servicio/);
  assert.equal(campos.coherenceIndex, 9.4);
  assert.match(campos.watchOut, /^Tu centro de gravedad está en otro sitio/);
  assert.doesNotMatch(campos.watchOut, /test complaciente/);

  assert.equal(
    campos.voiceTone,
    "Sobrio, seguro, afirmativo. Habla poco y con peso. Establece criterios en lugar de opinar. No compite: define la referencia."
  );
  assert.match(campos.messageStructure, /^Definir el estándar del sector/);
  assert.equal(campos.vocabulary.length, 14);
  assert.equal(campos.vocabulary[0], "referencia");
  assert.deepEqual(campos.avoidInVoice, [
    "La informalidad excesiva",
    "los memes",
    "el descuento agresivo",
    "el victimismo",
    "el tono suplicante",
    "prometer más de lo que puedes garantizar",
  ]);
  assert.equal(campos.soundsLike, "El estándar no se discute. Se sostiene.");
  assert.deepEqual(campos.sameArchetypeIcons, [
    "Rolex", "Mercedes-Benz", "American Express", "Rolls-Royce", "Microsoft",
    "Isabel II", "Nelson Mandela", "Angela Merkel",
  ]);

  // Solo la paleta «La tuya»: 5 colores, ni el arquetipo puro ni la polarizante.
  assert.equal(campos.palette.length, 5);
  assert.deepEqual(campos.palette[0], { name: "Verde", hex: "#2E7D46" });
  assert.ok(!campos.palette.some((c) => c.hex === "#00FF55" || c.hex === "#FFFFFF"));
  assert.equal(campos.color, "#2e7d46");
  assert.equal(campos.typography, "Titulares: Marcellus, Cormorant Garamond. Texto: Jost.");
  assert.match(campos.aesthetics, /^Simetría, márgenes generosos/);
  assert.match(campos.aesthetics, /Texturas: mármol/);
  assert.equal(
    campos.visualAvoid,
    "Desorden, tipografías informales, color chillón, collage, urgencia comercial y todo lo que sugiera improvisación."
  );

  // Derivados del perfil, todos literales del informe.
  assert.deepEqual(campos.strengths, ["Liderazgo", "criterio", "capacidad de organizar y de asumir la responsabilidad final"]);
  assert.deepEqual(campos.toneKeywords, ["Sobrio", "seguro", "afirmativo"]);
  assert.equal(campos.summary, "El estándar no se discute. Se sostiene.");
  assert.match(campos.brandingNotes, /Índice de audacia: AUDAZ \(96\.4\/100\)/);
  assert.match(campos.brandingNotes, /Lo que hace El Gobernante:\n- Publicar un estándar/);

  // Los referentes de tono los elige el equipo: el parser ni siquiera los devuelve.
  assert.equal("toneReferences" in campos, false);
  assert.ok(!JSON.stringify(campos).includes("Rihanna"));

  assert.equal(fuentes.voiceTone, "pdf");
  assert.equal(fuentes.coherenceIndex, "pdf");
  assert.deepEqual(avisos, []);
});

test("un informe sin las secciones deja los campos vacíos y avisa, nunca inventa", () => {
  const { campos, fuentes, avisos } = parser.parseInformeBranding("Pepe\nINFORME DE BRANDING\nNada más.");
  assert.equal(campos.name, "Pepe");
  assert.equal(campos.voiceTone, "");
  assert.equal(campos.archetypePrimary, "");
  assert.deepEqual(campos.palette, []);
  assert.equal(campos.coherenceIndex, null);
  assert.equal(fuentes.voiceTone, "vacio");
  assert.equal(fuentes.name, "pdf");
  assert.ok(avisos.some((a) => /TONO/.test(a)));
  assert.ok(avisos.some((a) => /paleta/.test(a)));
});

test("brief maestro → ficha de la marca", () => {
  const { campos, fuentes, avisos } = parser.parseBriefMaestro(brief);

  assert.equal(campos.name, "MARCA EJEMPLO");
  assert.equal(campos.tagline, "Nos mueve convertir un simple antojo en un momento bonito para recordar.");
  assert.match(campos.description, /^Somos Marca Ejemplo, una wafflería rosa/);
  assert.match(campos.description, /solucionamos las ganas de salir/);
  assert.equal(campos.toneOfVoice, "Cercana y amigable, Divertida, Elegante / premium");
  assert.match(campos.identity, /^Cómo debe sonar: Cercana y amigable/);
  assert.match(campos.audience, /^Cliente ideal: Nuestro público principal/);
  assert.match(campos.audience, /\nQué los frena antes de comprar: /);

  assert.equal(campos.instagram, "@marca.ejemplo.oficial");
  assert.equal(campos.tiktok, "@marca.ejemplo.oficial");
  assert.equal(campos.website, "");
  assert.equal(campos.whatsapp, "");

  // Rosa protagonista, blanco y tonos cálidos: nada de morado por defecto.
  assert.equal(campos.colorPrimary, "#ec4899");
  assert.equal(campos.colorSecondary, "#ffffff");
  assert.equal(campos.colorAccent, "#f59e0b");

  assert.equal(campos.valueProps.length, 5);
  assert.equal(campos.valueProps[0], "Por qué comprarles a ellos: Por la experiencia.");
  assert.equal(campos.doNots.length, 1);
  assert.match(campos.doNots[0], /^Todo contenido debe cuidar la percepción/);
  assert.deepEqual(campos.keywords, []);
  assert.equal(fuentes.keywords, "vacio");
  assert.equal(fuentes.whatsapp, "vacio");

  assert.match(campos.brief, /^Qué venden: WAFFLES Y CREPES DULCES, PANCAKES, /);
  assert.match(campos.brief, /Temporadas y fechas clave: FEBRERO, JULIO, AGOSTO - día del niño/);
  assert.match(campos.brief, /Métodos de pago: Yape \/ Plin, Tarjeta, Transferencia/);
  assert.match(campos.brief, /Competidores: COMPETIDOR UNO, COMPETIDOR DOS, COMPETIDOR TRES$/m);
  // Lo reservado no entra en ningún campo de la ficha.
  const todo = JSON.stringify(campos);
  for (const reservado of ["10123456789", "999000111", "contacto@ejemplo.test", "cifra de ejemplo", "EJEMPLO SOCIEDAD"]) {
    assert.ok(!todo.includes(reservado), `se coló ${reservado}`);
  }
  assert.deepEqual(avisos, []);
});

test("el informe de una persona cargado en una marca solo traslada lo literal", () => {
  const persona = parser.parseInformeBranding(informe).campos;
  const { campos, fuentes } = parser.marcaDesdePersona(persona);
  assert.equal(campos.name, "Eru");
  assert.equal(campos.tagline, "El estándar no se discute. Se sostiene.");
  assert.match(campos.identity, /^Arquetipo: El Gobernante · El Forajido · El Héroe\n/);
  assert.match(campos.toneOfVoice, /^Sobrio, seguro, afirmativo\./);
  assert.deepEqual(campos.keywords, persona.vocabulary);
  assert.deepEqual(campos.doNots, persona.avoidInVoice);
  assert.equal(campos.colorPrimary, "#2e7d46");
  assert.equal(campos.colorSecondary, "#12212e");
  assert.equal(campos.audience, "");
  assert.equal(fuentes.audience, "vacio");
  assert.equal(fuentes.brief, "vacio");
  assert.equal(fuentes.instagram, "vacio");
});

test("el catálogo de preguntas lee cada respuesta hasta la siguiente pregunta o sección", () => {
  const r = parser.leerRespuestasBrief(brief);
  assert.deepEqual(r["CUAL ES EL NOMBRE COMERCIAL DE LA MARCA"], ["MARCA EJEMPLO"]);
  assert.equal(r["QUE VENDEN"].length, 22);
  assert.deepEqual(r["HACEN DELIVERY"], ["Sí, por courier o agencia"]);
  // La sección «04 Números del negocio» corta la respuesta anterior.
  // Las claves van normalizadas: sin tildes ni signos.
  assert.deepEqual(r["TEMPORADAS ALTAS, BAJAS Y FECHAS CLAVE DEL ANO"], ["FEBRERO,", "JULIO", "AGOSTO - día del niño"]);
});

test("el diccionario de colores respeta el orden de aparición y no inventa", () => {
  assert.deepEqual(parser.coloresDesdeTexto("Usamos negro con detalles dorados y un poco de verde."), ["#111111", "#f59e0b", "#16a34a"]);
  assert.deepEqual(parser.coloresDesdeTexto("Colores corporativos según el manual."), []);
});

test("la redacción oculta RUC, teléfonos, correos, números del negocio y ventas antes de ir a la IA", () => {
  const { texto, redactado } = parser.redactarDatosSensibles(brief);
  assert.equal(redactado, true);
  for (const reservado of ["10123456789", "999000111", "contacto@ejemplo.test", "cuentas@ejemplo.test", "cifra de ejemplo", "EJEMPLO SOCIEDAD ANÓNIMA", "REPRESENTANTE DE EJEMPLO", "2 SEMANAS", "MARZO, JUNIO, AGOSTO"]) {
    assert.ok(!texto.includes(reservado), `sigue visible: ${reservado}`);
  }
  // Lo que sí sirve para escribir guiones se conserva.
  assert.ok(texto.includes("Nos mueve convertir un simple antojo"));
  assert.ok(texto.includes("@marca.ejemplo.oficial"));
  assert.ok(texto.includes("04 Números del negocio"));
  assert.ok(texto.includes(parser.MARCA_REDACCION));
  // Un informe personal no tiene nada que redactar.
  assert.equal(parser.redactarDatosSensibles(informe).redactado, false);
});

/* ------------------------------------------- RUTA DE SUBIDA (asset-import) -- */

// asset-import solo necesita la base para auditar y comprobar permisos: aquí se
// sustituyen por funciones vacías y se deja pasar cualquier archivo como texto.
// El almacenamiento privado se simula: sin flag devuelve null; con flag «sube»
// (fuera de la transacción) y deja constancia de cada adjunto (dentro).
const almacen = { habilitado: false, subidos: [], adjuntados: [] };
const mocks = {
  "@/lib/audit": { auditInTransaction: async () => {} },
  "@/lib/auth-transactions": { assertActor: async () => {} },
  "@/lib/asset-security": { assertAssetOwner: async () => {}, validateAssetContent: () => "text/plain" },
  "@/lib/private-storage": {
    privateStorageEnabled: () => almacen.habilitado,
    stagePrivateFile: async (bytes) => { const id = `blob-${almacen.subidos.length + 1}`; almacen.subidos.push({ id, size: bytes.byteLength }); return id; },
    attachPrivateFile: async (_tx, id) => { almacen.adjuntados.push(id); },
  },
};
const assetImport = load("src/lib/asset-import.ts", mocks);
const schema = load("src/lib/ai/branding-schema.ts");

test("la limpieza de informe solo se aplica a los documentos de Ai Munay; el resto conserva sus párrafos", () => {
  // Brief e informe: mismo resultado que la limpieza directa.
  assert.equal(pdf.limpiarSiEsDocumentoAiMunay(briefCrudo), brief);
  assert.equal(pdf.limpiarSiEsDocumentoAiMunay(informeCrudo), informe);
  // Un brand book cualquiera se queda como está: con sus párrafos y sus «3 / 12».
  const generico = "Manual de marca\n\nPrimer párrafo del documento.\n\nSegundo párrafo.\n3 / 12\n\nTercer párrafo.";
  assert.equal(pdf.limpiarSiEsDocumentoAiMunay(generico), generico);
});

test("el hidden «importado» solo admite colores #RRGGBB en color y en la paleta", () => {
  const base = parser.parseInformeBranding(informe).campos;
  assert.equal(schema.PersonaExtraidaSchema.safeParse(base).success, true);
  assert.equal(schema.PersonaExtraidaSchema.safeParse({ ...base, color: "" }).success, true);
  assert.equal(schema.PersonaExtraidaSchema.safeParse({ ...base, color: "url(javascript:1)" }).success, false);
  assert.equal(
    schema.PersonaExtraidaSchema.safeParse({ ...base, palette: [{ name: "x", hex: "url(https://evil.example/p.png)" }] }).success,
    false
  );
  assert.equal(schema.PersonaExtraidaSchema.safeParse({ ...base, palette: [{ name: "x", hex: "#ABCDEF" }] }).success, true);
});

test("el PDF del formulario de marca viaja en «briefPdf» y no pisa el textarea «brief»", async () => {
  const fd = new FormData();
  fd.append("briefPdf", new File([briefCrudo], "brief.txt", { type: "text/plain" }));
  fd.append("brief", "Catálogo, precios y garantías escritos a mano.");
  fd.append("brandingPdf", new File([informeCrudo], "informe.txt", { type: "text/plain" }));

  // El texto del textarea sigue siendo texto (readBrandFields lee «brief» con fieldOrNull).
  const utils = load("src/lib/utils.ts");
  assert.equal(utils.fieldOrNull(fd, "brief"), "Catálogo, precios y garantías escritos a mano.");
  // Y los archivos se leen de sus propios campos, nunca de «brief»/«branding».
  assert.equal(await assetImport.leerArchivoOpcional(fd, "brief"), null);
  assert.equal(await assetImport.leerArchivoOpcional(fd, "branding"), null);
  const lecturaBrief = await assetImport.leerArchivoOpcional(fd, "briefPdf");
  assert.equal(lecturaBrief.ok, true);
  assert.equal(lecturaBrief.archivo.name, "brief.txt");
  assert.equal(parser.detectarTipoDocumento(lecturaBrief.archivo.texto), "brief");
  const lecturaInforme = await assetImport.leerArchivoOpcional(fd, "brandingPdf");
  assert.equal(lecturaInforme.ok, true);
  assert.equal(parser.detectarTipoDocumento(lecturaInforme.archivo.texto), "branding");

  // Guarda de regresión sobre el código: el formulario y la acción usan esos nombres.
  const form = fs.readFileSync(path.resolve(import.meta.dirname, "..", "src/app/(app)/marcas/brand-form.tsx"), "utf8");
  assert.match(form, /type="file" name="briefPdf"/);
  assert.match(form, /type="file" name="brandingPdf"/);
  assert.doesNotMatch(form, /type="file" name="brief"/);
  assert.doesNotMatch(form, /type="file" name="branding"/);
  const accion = fs.readFileSync(path.resolve(import.meta.dirname, "..", "src/app/actions/brands.ts"), "utf8");
  assert.match(accion, /campo: "briefPdf"/);
  assert.match(accion, /campo: "brandingPdf"/);
});

test("un brief subido desde Documentos se guarda redactado para la IA, como desde Identidad", async () => {
  const fd = new FormData();
  fd.append("file", new File([briefCrudo], "brief.txt", { type: "text/plain" }));
  const lectura = await assetImport.leerArchivoImportado(fd.get("file"));
  assert.equal(lectura.ok, true);
  // Esta es la regla que aplica uploadAsset: detectar el tipo y reutilizar textoDeReferencia.
  const tipo = parser.detectarTipoDocumento(lectura.archivo.texto);
  assert.equal(tipo, "brief");
  const ref = assetImport.textoDeReferencia(tipo, lectura.archivo);
  assert.equal(ref.useForAi, true);
  assert.match(ref.aviso, /Se ocultaron RUC/);
  for (const reservado of ["10123456789", "999000111", "contacto@ejemplo.test"]) {
    assert.ok(!ref.extractedText.includes(reservado), `sigue visible: ${reservado}`);
  }
  assert.ok(ref.extractedText.includes("Nos mueve convertir un simple antojo"));
  // Un informe personal no se toca.
  const fd2 = new FormData();
  fd2.append("file", new File([informeCrudo], "informe.txt", { type: "text/plain" }));
  const lectura2 = await assetImport.leerArchivoImportado(fd2.get("file"));
  const ref2 = assetImport.textoDeReferencia(parser.detectarTipoDocumento(lectura2.archivo.texto), lectura2.archivo);
  assert.equal(ref2.extractedText, lectura2.archivo.texto);
  assert.equal(ref2.aviso, null);
});

test("el Asset se guarda con «data» o con «blobId», nunca ambos, y el Blob se sube antes y se adjunta dentro", async () => {
  const fd = new FormData();
  fd.append("file", new File([informeCrudo], "informe.txt", { type: "text/plain" }));
  const lectura = await assetImport.leerArchivoImportado(fd.get("file"));
  assert.equal(lectura.ok, true);
  const creados = [];
  const tx = { $executeRaw: async () => 0, $queryRaw: async () => [{ bytes: 0n }], asset: { create: async ({ data }) => { creados.push(data); return { id: `asset-${creados.length}` }; } } };
  const user = { id: "u1", role: "OWNER" };

  // Flag apagado: no hay Blob y los bytes van en la fila.
  almacen.habilitado = false;
  assert.equal(await assetImport.prepararArchivoPrivado(lectura.archivo), null);
  await assetImport.guardarDocumentoImportado(tx, { tipo: "branding", ownerType: "archetype", ownerId: "a1", archivo: lectura.archivo, blobId: null, user });
  assert.equal(creados[0].blobId, null);
  assert.ok(Buffer.isBuffer(creados[0].data) && creados[0].data.byteLength === lectura.archivo.size);
  assert.equal(creados[0].label, parser.ETIQUETA_DOCUMENTO.branding);
  assert.equal(almacen.adjuntados.length, 0);

  // Flag encendido: primero se sube y verifica (fuera de la transacción)…
  almacen.habilitado = true;
  const blobId = await assetImport.prepararArchivoPrivado(lectura.archivo);
  assert.equal(blobId, "blob-1");
  assert.deepEqual(almacen.subidos, [{ id: "blob-1", size: lectura.archivo.size }]);
  assert.equal(almacen.adjuntados.length, 0);
  // …y dentro solo se adjunta: la fila lleva blobId y data null.
  await assetImport.crearAssetDesdeArchivo(tx, { ownerType: "brand", ownerId: "b1", archivo: lectura.archivo, blobId, label: null, user, extractedText: lectura.archivo.texto, useForAi: true });
  assert.deepEqual(almacen.adjuntados, ["blob-1"]);
  assert.equal(creados[1].blobId, "blob-1");
  assert.equal(creados[1].data, null);
  almacen.habilitado = false;
});
