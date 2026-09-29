/**
 * Resumen del Manual de procedimientos (tarjetas, orden y conteos).
 * GENERADO por scripts/manual-content.mjs desde reports/manual-procedimientos/curriculo.json.
 * No editar a mano: cambia la fuente y vuelve a ejecutar el script.
 */

export type ManualRoleId = "GUIONISTA" | "FILMMAKER" | "ACTOR" | "EDITOR" | "JEFE_EDITORES" | "COMMUNITY" | "ATC" | "DUENO";
export type ManualLevel = "PRINCIPIANTE" | "INTERMEDIO" | "AVANZADO";
export type ManualRoleSummary = {
  id: ManualRoleId;
  slug: string;
  name: string;
  tagline: string;
  profiles: readonly string[];
  modules: number;
  lessons: number;
  videos: number;
  scenes: number;
  levels: readonly { level: ManualLevel; modules: number }[];
  sopPreview: readonly string[];
};

export const MANUAL_VERSION = {"version":1,"fecha":"2026-09-28"} as const;

export const MANUAL_ROLE_INDEX: readonly ManualRoleSummary[] = [
  {
    "id": "GUIONISTA",
    "slug": "guionista",
    "name": "Guionista",
    "tagline": "Convierte cada idea en un guion listo para grabar.",
    "profiles": [
      "WRITER"
    ],
    "modules": 19,
    "lessons": 87,
    "videos": 54,
    "scenes": 4,
    "levels": [
      {
        "level": "PRINCIPIANTE",
        "modules": 6
      },
      {
        "level": "INTERMEDIO",
        "modules": 7
      },
      {
        "level": "AVANZADO",
        "modules": 6
      }
    ],
    "sopPreview": [
      "LUNES 9:00 · Lectura de datos: revisar en Intia las métricas semanales de los videos PUBLICADOS (vistas, retención 3 s, guardados, compartidos, clics, leads, pedidos, ingresos). Recibir de ATC el top 5 de preguntas y objeciones de DM/WhatsApp, y de community los comentarios destacados, los pedidos de «parte 2» y los audios en tendencia que sí están disponibles para cuentas de empresa.",
      "LUNES · Sesión de ideas (45 min) con coordinación: ganadores y perdedores, fechas del calendario estacional de las próximas 4 semanas, matriz ángulo × gancho × formato, priorización por impacto y facilidad de producción, y carga de las IDEAS en el tablero con avatar, objetivo (venta o comunidad), formato, nivel de conciencia y responsable.",
      "IDEA → GUION: por cada idea asignada, validar con el dueño o coordinación los datos de la ficha (precio final en S/, tallas, tiempos de entrega por zona, stock, vigencia de la oferta) y completar el Generador IA: video al que se unirá, marca, producto, «Qué debe saber la IA sobre el producto», quién actúa frente a cámara, idea en 3 frases, estructura, ángulo, variante, objetivo del cierre, gatillo de venta o cierre de comunidad y duración objetivo (20-45 s para venta; 30-60 s por defecto; hasta 90 s para vlog o storytime).",
      "Autorrevisión antes de enviar (15 min): cabecera coherente (título, avatar, enfoque, gancho, CTA), tiempos continuos, acciones filmables, planos posibles con el equipo real, lectura del diálogo en voz alta con cronómetro, búsqueda de datos inventados, revisión legal (afirmaciones, promociones, divulgación, rubro regulado), audio con licencia y redacción del gancho B.",
      "GUION → APROBADO: pasar la tarjeta a GUION con una nota que incluya objetivo, avatar, por qué este gancho, gancho B, hipótesis, destino (orgánico o pauta) y riesgos (locación, permisos, talento, stock). Responder cada observación de coordinación en menos de 24 h. Meta: IDEA → APROBADO en 48 h o menos."
    ]
  },
  {
    "id": "FILMMAKER",
    "slug": "filmmaker",
    "name": "Filmmaker",
    "tagline": "Graba en 4K a 60 fps material nítido y bien encuadrado, con buena luz y audio limpio.",
    "profiles": [
      "CAMERA"
    ],
    "modules": 21,
    "lessons": 100,
    "videos": 74,
    "scenes": 61,
    "levels": [
      {
        "level": "PRINCIPIANTE",
        "modules": 8
      },
      {
        "level": "INTERMEDIO",
        "modules": 7
      },
      {
        "level": "AVANZADO",
        "modules": 6
      }
    ],
    "sopPreview": [
      "Etapa GUION (antes de la aprobación): cuando coordinación comparte un guion en revisión, leerlo y comentar en la ficha de Intia en menos de 24 h si alguna escena no se puede grabar (locación, permisos, presupuesto, seguridad o tiempo), proponiendo una alternativa.",
      "LUNES – Planificación (1 h): en Intia, filtrar los videos asignados en estado APROBADO (check 'Guion aprobado por la marca' marcado); leer cada guion escena por escena; armar la lista de tomas y el plan por bloques (locación > luz > talento); pedir a producción props, vestuario, locación y permisos, y confirmar con ella los checks de PREPRODUCCIÓN 'Actor asignado y confirmado' y 'Props / vestuario conseguidos'.",
      "D-1 – Preproducción: hacer el scouting de las locaciones nuevas a la hora de grabación (foto de prueba 9:16, luz, ruido, enchufes, prueba de parpadeo); confirmar por escrito el permiso del local; enviar al talento la lista de tomas, marcas y vestuario; cargar baterías (celulares, luz LED de mano, power banks y, si la hay, la cámara), vaciar las memorias ya respaldadas, formatear el SSD si se graba ProRes Log en iPhone, limpiar lentes y cargar el overlay de zona segura; marcar 'Locación e iluminación listas'.",
      "DÍA DE GRABACIÓN, al llegar: pasar los videos del día de APROBADO a GRABACION en Intia.",
      "T-45 min – Montaje: revisar la seguridad (pesos en trípodes, cables con cinta), montar luces según el esquema (principal, relleno y luz trasera de color si el guion lo pide), apagar fluorescentes o fijar la obturación en 1/120 (o 1/60) contra el parpadeo de la red de 60 Hz, y dejar la luz LED de mano lista para las zonas con poca luz."
    ]
  },
  {
    "id": "ACTOR",
    "slug": "actor",
    "name": "Actor",
    "tagline": "Da vida al guion frente a cámara, dentro de su marca personal.",
    "profiles": [
      "TALENT"
    ],
    "modules": 17,
    "lessons": 73,
    "videos": 52,
    "scenes": 35,
    "levels": [
      {
        "level": "PRINCIPIANTE",
        "modules": 6
      },
      {
        "level": "INTERMEDIO",
        "modules": 6
      },
      {
        "level": "AVANZADO",
        "modules": 5
      }
    ],
    "sopPreview": [
      "1. PERFIL (al ingresar y cada trimestre): en Intia > Personas revisa tu perfil. Solo tienes acceso de lectura, así que pide a coordinación que actualice lo que te sale natural, lo que evitas, tus palabras de tono y tu energía (1-5). Así los guiones generados con IA suenan a ti y llegan menos frases que no te salen.",
      "2. IDEA / GUION (48-72 h antes): en Videos y Calendario revisa los videos que te asignaron y su fecha de grabación. Si el guion sigue en estado GUION, deja en comentarios las frases que no suenan naturales en tu boca y cualquier límite o riesgo (contacto físico, calle con tráfico, alergias con la comida). No cambies datos comerciales.",
      "3. APROBADO (24-48 h antes): lee el guion aprobado completo en voz alta y divídelo por escenas. Marca gancho, palabra clave por bloque, respiraciones (⊥), pausas (/ //), precio y CTA, y anota la energía (1-10) de cada escena. Memoriza con el método del manual: textual el gancho, los claims, el precio, la duración y el stock de la promoción, y el CTA.",
      "4. PREPRODUCCIÓN (24 h antes): confirma tu asistencia a producción para que marque 'Actor asignado y confirmado'. Envía una foto de tus 2 cambios de vestuario (colores lisos medios, sin logos ajenos, sin rayas finas, sin telas ruidosas) para 'Props / vestuario conseguidos'. Si eres talento nuevo o tu autorización venció, fírmala antes de grabar. Si hay tendencia, confirma con el community que el audio está permitido.",
      "5. DÍA DE GRABACIÓN, 30 min antes: llega con el kit listo (agua al tiempo, guion marcado, quitapelusas, polvo matificante) y sin collares ni pulseras ruidosas. Pon el celular en modo avión. Haz 5 min de calentamiento de voz y 5 min de cuerpo, y toma la foto inicial de vestuario para continuidad."
    ]
  },
  {
    "id": "EDITOR",
    "slug": "editor",
    "name": "Editor",
    "tagline": "Monta, ritma y subtitula el corte final en vertical.",
    "profiles": [
      "EDITOR"
    ],
    "modules": 18,
    "lessons": 78,
    "videos": 51,
    "scenes": 2,
    "levels": [
      {
        "level": "PRINCIPIANTE",
        "modules": 6
      },
      {
        "level": "INTERMEDIO",
        "modules": 7
      },
      {
        "level": "AVANZADO",
        "modules": 5
      }
    ],
    "sopPreview": [
      "INICIO DEL DÍA (15 min): en el tablero de Intia, filtra los videos en EDICION y los de GRABACION que ya tengan marcado 'Grabado (todas las tomas)'. Ordénalos por fecha programada de publicación y confirma prioridades con el Jefe de Editores. Los videos en PAUSADO o CANCELADO no se tocan.",
      "RECEPCIÓN (por video): verifica en la ficha que estén marcados 'Guion aprobado por la marca' (preproducción), 'Grabado (todas las tomas)' y 'Audio revisado' (grabación), y mira si está 'B-roll / tomas de apoyo'. Si falta material o el guion no está aprobado, avisa ese mismo día al filmmaker y a coordinación. No se edita sin guion aprobado. Si el video tiene Cámara Escondida, clientes reales o menores, pregunta a coordinación si ya están las autorizaciones de imagen firmadas.",
      "INGESTA: copia el material a MARCA_AAAAMMDD_FORMATO_TEMA/01_BRUTO, compara la cantidad de archivos y el peso, prueba 3 clips y completa el respaldo 3-2-1. Solo después autorizas al filmmaker a formatear la tarjeta. Revisa con MediaInfo si hay fps variable, HDR o Log y conviértelo si hace falta. Pega la ruta en la ficha de Intia.",
      "PREPARACIÓN: abre la plantilla de proyecto (1080x1920 a 30 fps, pistas nombradas y overlay de zona segura) e importa la música con licencia, los SFX y los gráficos de la marca.",
      "SELECCIÓN: ve todo el material una vez, marca las tomas por color (verde, amarillo, rojo) y arma la secuencia SELECTS, relacionando cada toma con su bloque del guion."
    ]
  },
  {
    "id": "JEFE_EDITORES",
    "slug": "jefe-de-editores",
    "name": "Jefe de editores",
    "tagline": "Asigna, revisa y aprueba la calidad de cada edición.",
    "profiles": [
      "EDITOR"
    ],
    "modules": 15,
    "lessons": 81,
    "videos": 42,
    "scenes": 1,
    "levels": [
      {
        "level": "PRINCIPIANTE",
        "modules": 5
      },
      {
        "level": "INTERMEDIO",
        "modules": 6
      },
      {
        "level": "AVANZADO",
        "modules": 4
      }
    ],
    "sopPreview": [
      "DIARIO 09:00 — Tablero de Intia: revisar EDICION, lo que llega de GRABACION y las fechas de PROGRAMADO de los próximos 5 días. Marcar en rojo lo que vence en menos de 48 h.",
      "DIARIO 09:15 — Pre-edición (estado APROBADO): leer cada guion recién aprobado (máximo 10 minutos por guion) y dejar en la ficha la lista de cobertura para filmmaker y producción: plano del hook con 2 s de colchón, B-roll de marca, planos limpios para placas, reacciones y 30 s de sonido ambiente. Si algo no se puede editar tal como está escrito (duración o textos largos), avisar a coordinación y al guionista antes de grabar.",
      "DIARIO 09:30 — Recepción de material (entra a EDICION): verificar los checks «Grabado (todas las tomas)», «Audio revisado» y «B-roll / tomas de apoyo», la carpeta estándar, la doble copia, las especificaciones (fps, parpadeo, HDR y frame rate variable) y la lista de tomas buenas. Si falta algo, comentar al filmmaker en la ficha con una lista y un plazo; si hay que volver a grabar, avisar a coordinación.",
      "DIARIO 09:45 — Asignación: completar el brief de edición en la ficha (formato, duración, talla, si va a pauta, hook, textos obligatorios, oferta con vigencia y stock, música permitida, referencias con el segundo exacto y fechas de la v01 y del FINAL) y asignar respetando el límite de 2 videos en edición + 1 en correcciones por editor.",
      "DIARIO 10:00 — Reunión de pie de 10 minutos con los editores: qué entregan hoy y qué los bloquea (material, música, aprobación). Todo bloqueo que no se resuelva en 2 horas se escala a coordinación con una propuesta."
    ]
  },
  {
    "id": "COMMUNITY",
    "slug": "community-manager",
    "name": "Community manager",
    "tagline": "Programa, publica y cuida la conversación de cada video.",
    "profiles": [
      "PUBLISHER"
    ],
    "modules": 15,
    "lessons": 69,
    "videos": 45,
    "scenes": 1,
    "levels": [
      {
        "level": "PRINCIPIANTE",
        "modules": 5
      },
      {
        "level": "INTERMEDIO",
        "modules": 5
      },
      {
        "level": "AVANZADO",
        "modules": 5
      }
    ],
    "sopPreview": [
      "POR VIDEO · IDEA: aporta tendencias, preguntas y objeciones reales de la comunidad. Envíalas a coordinación con la plantilla de idea (tendencia, formato, hook, producto, cierre, audio con licencia y fecha límite). Coordinación las registra como IDEA en Intia y las asigna al guionista.",
      "POR VIDEO · GUION: tu perfil no abre Guiones. En la reunión de parrilla o por el canal de coordinación, valida la palabra clave del CTA, que la oferta, el stock y el plazo sean reales y que el audio previsto sea de uso comercial.",
      "POR VIDEO · GRABACIÓN: pide a producción material de detrás de cámaras para historias y confirma que se firmen las autorizaciones de imagen de las personas reales (Cámara Escondida, clientes, menores con su padre, madre o tutor).",
      "POR VIDEO · EDICIÓN: cuando la ficha aparece en tu lista ya tiene “Revisión final aprobada”. Lee el brief, el Hook, el CTA y las notas. Descarga el master desde los adjuntos (nunca de WhatsApp) y revísalo en la vista previa de cada app. Si hay un error de texto, precio, logo o zona tapada, comenta en la ficha y avisa a coordinación: solo coordinación reabre la aprobación.",
      "POR VIDEO · PROGRAMADO: escribe el copy por red y marca “Copy y hashtags escritos”. Programa en Meta Business Suite, TikTok Studio y YouTube Studio en hora de Perú (UTC-5). Confirma la Fecha prevista en “Programación y enlace publicado”, anota la hora en un comentario y mueve la ficha a PROGRAMADO. Avisa a ATC la palabra clave y la oferta."
    ]
  },
  {
    "id": "ATC",
    "slug": "atc",
    "name": "ATC",
    "tagline": "Atiende los chats, cotiza y cierra las ventas.",
    "profiles": [],
    "modules": 18,
    "lessons": 80,
    "videos": 51,
    "scenes": 1,
    "levels": [
      {
        "level": "PRINCIPIANTE",
        "modules": 6
      },
      {
        "level": "INTERMEDIO",
        "modules": 6
      },
      {
        "level": "AVANZADO",
        "modules": 6
      }
    ],
    "sopPreview": [
      "IDEA (continuo): cuando una pregunta u objeción se repite en los chats, registrarla en Intia como IDEA escrita como síntoma (qué duele y dónde se nota), con su frecuencia y un ejemplo textual sin datos personales.",
      "GUION → APROBADO: leer en Intia el guion aprobado y su CTA. Recibir de coordinación la ficha de oferta del video (precio total, bonus, garantía, escasez real con duración y stock mínimo, fecha de corte, palabra clave). Si algo no se puede cumplir (stock, capacidad del taller, plazos a provincia), avisarlo a coordinación antes de grabar.",
      "GRABACION (cuando falte material): pedir al filmmaker, vía coordinación, 2 o 3 tomas verticales del producto real para el kit de confianza del chat.",
      "EDICION (antes de la «Revisión final aprobada»): revisar en la vista previa que el precio, el bonus, la fecha de corte y la palabra clave que aparecen en pantalla coincidan con la ficha de oferta. Enviar OK o correcciones a coordinación y al jefe de editores en 2 horas como máximo.",
      "PROGRAMADO (día previo a publicar): crear o actualizar las respuestas rápidas del video, acordar con el community la palabra clave y la automatización de comentario a DM, y agendar la guardia de respuesta para la hora de publicación."
    ]
  },
  {
    "id": "DUENO",
    "slug": "dueno",
    "name": "Dueño de negocio",
    "tagline": "Define ofertas y objetivos, y aprueba lo que sale al público.",
    "profiles": [],
    "modules": 16,
    "lessons": 72,
    "videos": 48,
    "scenes": 1,
    "levels": [
      {
        "level": "PRINCIPIANTE",
        "modules": 6
      },
      {
        "level": "INTERMEDIO",
        "modules": 5
      },
      {
        "level": "AVANZADO",
        "modules": 5
      }
    ],
    "sopPreview": [
      "ARRANQUE DE MARCA (una vez y cada vez que algo cambie): en Marcas completar descripción, identidad, brief operativo (tiempos de producción, envíos por zona, formas de pago y garantía), tono, público, propuestas de valor, no hacer, palabras clave, colores, logo y enlaces. Cargar de 2 a 3 Personas a partir de chats reales y entregar a ATC y al guionista las fichas de producto con precios finales en S/. Verificar que las cuentas de Meta, TikTok y WhatsApp Business estén a nombre de la empresa, con 2FA y al menos 2 administradores.",
      "CIERRE MENSUAL (primer día hábil, de 2 a 3 h): revisar en Métricas y en Objetivos el resultado del mes (logrado, en curso, en riesgo). Fijar el objetivo del mes por marca, aprobar el presupuesto de producción y pauta, aprobar las ofertas del mes y aprobar o devolver con un máximo de 3 cambios la estrategia de coordinación. Hacer las evaluaciones de 20 minutos con la tarjeta de KPIs de cada rol y enviar el informe a cada cliente dentro de los 5 primeros días hábiles.",
      "LUNES 9:00 · RITUAL SEMANAL (45 min): buenas noticias, tablero de 5 a 7 números (en camino o fuera de camino), prioridades del trimestre, titulares de ATC, community y jefe de editores, revisión de tareas, los 3 problemas principales resueltos de raíz y cierre con tareas en Intia.",
      "DIARIO (15 min, misma hora): Panel y Tareas. Resolver solo los bloqueos escalados, los videos detenidos más de 48 h en un mismo estado y las alertas de crisis de nivel 3. No microgestionar.",
      "ETAPA IDEA: validar solo los pilares del mes y los temas sensibles (lanzamientos, precios, sorteos, temas delicados). Las ideas normales las decide coordinación."
    ]
  }
];
