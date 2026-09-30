# Identidad de ALSOS · Blanco y cobre

Fecha: 30 de septiembre de 2026. Estado: implementado y validado en local, en la rama
`feature/marca-alsos`. Se publica cuando se integra en `main`, porque Vercel despliega cada push a
`main`.

Reemplaza a Intia como nombre del producto. La identidad visual aprobada el 25/09/2026 (paleta,
tipografía y componentes) se conserva: cambian el nombre, el logotipo y los íconos. El registro
de esa identidad está en [identidad-intia-2026-09-25.md](identidad-intia-2026-09-25.md).

## Nombre

- **ALSOS**, en mayúsculas, en todo texto: títulos, manual, guía, calendario y documentación.
- Lema: «Ideas que se publican», sin cambios.
- Título de las pestañas: «ALSOS · Ideas que se publican»; cada página usa `%s · ALSOS`.
- Nombre de la app guardada en la pantalla de inicio: «ALSOS» (`applicationName`,
  `appleWebApp.title` y `manifest.ts`).
- El nombre de la organización que se configura en la app sigue apareciendo junto al logotipo.

## Logotipo

`src/components/alsos-wordmark.tsx` (`AlsosWordmark`): la palabra `alsos` en minúsculas, Manrope
ExtraBold con interletrado de −0,065 em, en tinta, seguida de un punto en cobre. Para lectores de
pantalla se anuncia como «ALSOS». Tamaños en uso: 30 px en la barra lateral, 24 px en la cabecera
del celular y 48 px en la entrada. Sustituye a `intia-wordmark.tsx`, que se eliminó.

## Favicon e íconos

Una «a» geométrica de una sola panza en tinta `#293238`, con el punto cobre `#A34D2B` del
logotipo, sobre un cuadrado blanco de esquinas redondeadas y borde sutil. El fondo blanco la
mantiene visible en pestañas oscuras.

| Archivo | Uso | Medidas |
|---|---|---|
| `src/app/icon.svg` | Favicon vectorial; fuente de los demás | viewBox 64, esquinas `rx` 15 |
| `src/app/favicon.ico` | Navegadores que piden `/favicon.ico` | 16, 32 y 48 px |
| `src/app/apple-icon.png` | Pantalla de inicio de iPhone | 180 × 180, opaco, sin esquinas ni borde (iOS las recorta) |
| `public/icon-192.png` · `public/icon-512.png` | Pantalla de inicio de Android (manifest) | 192 y 512 px |
| `src/app/manifest.ts` | Nombre, colores (`#f5f6f7`) e íconos | `display: "browser"` |

La app guardada en la pantalla de inicio se abre en el navegador y no como app independiente
(`display: "browser"` y `appleWebApp.capable: false`). Si se abriera aparte, la entrada con Google
quedaría en otra ventana. Si cambia el SVG, se regeneran el ICO y los PNG.

Revisión visual: 16, 32, 64 y 180 px sobre fondo claro y oscuro. La «a.» se lee a 16 px, con el
asta nítida y el punto cobre visible.

## Colores y tipografía

Sin cambios respecto de la identidad del 25/09/2026. Los tokens viven en `src/app/globals.css`.

| Uso | Claro | Oscuro |
|---|---|---|
| Fondo | `#F5F6F7` | `#1B1E22` |
| Superficie y navegación | `#FFFFFF` | `#262B30` |
| Texto principal (tinta) | `#293238` | `#F2F4F5` |
| Texto secundario | `#606B72` | `#B9C2C9` |
| Acción principal (cobre) | `#A34D2B` | `#F1AA83` |
| Texto sobre acción | `#FFFFFF` | `#302017` |
| Selección suave | `#F4E5DC` | `#49362D` |
| Texto seleccionado | `#824021` | `#F4BDA0` |
| Bordes | `#DFE3E6` | `#414950` |

Tipografía: Manrope variable, servida desde el propio despliegue (`@fontsource-variable/manrope`).

## Dónde cambió el nombre

- Pantallas: barra lateral, cabecera del celular y entrada (`shell.tsx`, `login/page.tsx`).
- Metadatos: `src/app/layout.tsx` y `src/app/manifest.ts`.
- Calendario de Google: el nombre pasa a «ALSOS · <marca>» o «ALSOS · Agenda completa», el
  archivo a `alsos.ics` y el `PRODID` a `-//ALSOS//Calendario//ES`. La dirección de suscripción y
  los UID de los eventos no cambian, así que no hay duplicados.
- Guía interactiva (`src/lib/guia/modulos.ts`) y manual de procedimientos
  (`reports/manual-procedimientos/` y `src/content/manual/`, regenerado con
  `node scripts/manual-content.mjs`).
- Preset de CapCut del manual: `INTIA_9x16_1080_30` pasa a `ALSOS_9x16_1080_30`.
- Paquete npm: `alsos` (antes `marketing-os`). Capturas de auditoría: `.audit/alsos-*.png`.
- Comentarios del código, README, CONTRACT y documentos de operación vigentes.

## Qué se mantuvo técnico y por qué

Los identificadores técnicos conservan `intia` (y las cookies, `mos`). Cambiarlos rompería
producción, el descifrado o los datos. La lista completa y el efecto de cada uno están en
[CONTRACT.md](../CONTRACT.md#nombre-del-producto-e-identificadores-técnicos). En resumen:

- **Base de datos:** esquema `intia_ops`, funciones y triggers `intia_*`, `SAVEPOINT
  intia_production_flow` y migraciones ya aplicadas, que nunca se editan.
- **Conexiones:** `application_name` `intia-*` y `APPLICATION_SCHEMA_VERSION`. La guarda de
  despliegue rechaza a un escritor que no reconoce.
- **Cifrado y archivos:** la AAD `intia:secret:v1:` (sin ella no se descifran las claves guardadas),
  la ruta `intia/assets/` y el almacén `intia-private`.
- **Calendario:** el sufijo `@intia` de los UID. Si cambiara, Google duplicaría los eventos.
- **Navegador:** las cookies `mos_*` y las claves `mos-theme` e `intia.measure-navigation`.
  Cambiarlas cerraría sesiones y perdería preferencias.
- **Pruebas y demo:** las bases `intia_test` / `intia_*_test` y las cuentas `@intia.test`.
- **Infraestructura:** el dominio `intia-lovat.vercel.app`, el proyecto de Vercel, el repositorio
  `conamormarket-lgtm/intia`, la carpeta `intia-main` y la copia del keyring en
  `%LOCALAPPDATA%/Intia/secrets/`.
- **Dudosos, sin cambios:** las etiquetas de log `[marketing-os]` y el nombre `marketing-os` de
  `.claude/launch.json`.

## Qué notará el equipo

- Quien guardó el preset de CapCut con el nombre anterior tiene que renombrarlo a
  `ALSOS_9x16_1080_30`.
- El navegador puede mostrar el favicon anterior hasta recargar. En un celular donde la app ya
  estaba en la pantalla de inicio, puede hacer falta quitarla y volver a agregarla para ver el
  ícono nuevo.
- Los calendarios suscritos cambian de nombre en la próxima lectura de Google y conservan sus
  eventos.

## Validación (30/09/2026)

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` y `npm run lint` | Correctos |
| `npm run build` | Correcto. El HTML enlaza `/favicon.ico`, `/icon.svg`, `/apple-icon.png` y `/manifest.webmanifest`, y no lleva `mobile-web-app-capable` |
| `npm test` | 336 de 336 |
| Texto visible | Sin «Intia» en `src/` salvo identificadores técnicos, y sin «Intia» en el manual |

**Reversa:** no hay migraciones ni datos. Si algo sale mal después de publicar, Vercel permite
volver al despliegue anterior desde el panel (Instant Rollback), sin redeploy de emergencia.
