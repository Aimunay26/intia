# Activación en producción — 09/09/2026

La entrega ya está publicada en [intia-lovat.vercel.app](https://intia-lovat.vercel.app/).
Vercel confirmó **Ready**, entorno Production, commit
`d8a9a3b21513d8750c54fb524d899ebbfeb879d9`, despliegue
`dpl_EP3wLJ8KsnZSbAR1F9QUEK4uXMzA`.
El dominio público figura entre sus aliases. Se retiró la pausa de `main`;
las dos ramas de ensayo conservan desactivado su despliegue automático.

## Base de datos y respaldo

Se comprobó nuevamente el esquema de 24 tablas de Neon y se registró
`00000000000000_baseline` sin ejecutar sus CREATE TABLE sobre datos existentes.
Se aplicaron correctamente, primero en una copia aislada y luego en producción:

- `20260909190000_weekly_consistency`.
- `20260909220000_jobs_private_storage_decimal`.

La base tiene ahora 29 tablas de negocio. Los conteos y las huellas de los datos
de las 24 tablas originales coinciden antes y después de migrar. La comparación
normaliza la representación de los importes al pasar a Decimal y excluye únicamente
las columnas nuevas. Las 38 métricas históricas permanecen LEGACY/UNATTRIBUTED;
los cuatro archivos y sus bytes originales siguen en PostgreSQL. Las 21 relaciones
video/plataforma coinciden exactamente con las listas existentes. Los cuatro
controles de integridad devolvieron cero incidencias.

Se crearon únicamente las dos copias autorizadas, con eliminación automática a los
siete días y sin ampliar el plan Free:

| Copia | Identificador | Caducidad, hora de Lima | Verificación |
|---|---|---|---|
| staging-predeploy-20260909 | br-sparkling-butterfly-auirunbn | 16/09/2026 16:47 | Migraciones, conservación de datos y pruebas transaccionales |
| backup-predeploy-20260909 | br-lingering-river-aul423se | 16/09/2026 17:07 | Datos y huella del esquema iguales a producción con escrituras detenidas |

El respaldo definitivo se creó después de cerrar las escrituras y antes de las
migraciones. Conserva también el control de mantenimiento cerrado. No se restauró
producción ni se borraron sus registros. La restauración de un dump sigue comprobada
con fixtures locales; la comprobación de Neon fue la lectura y comparación de sus
copias reales. Son evidencias diferentes.

## Cambio de versión

El control operativo `intia_ops.deployment_gate` bloqueó las escrituras durante la
ventana de actualización. Se instaló de nuevo tras migrar para incluir las tablas
nuevas. Se abrió después de confirmar Ready y la asignación del dominio público.

Las pruebas sobre el pool real de Neon comprobaron que la versión nueva puede
escribir y que un cliente antiguo sigue rechazado. Las consultas de comprobación
usaron UPDATE con condición falsa; no modificaron usuarios reales. Las pestañas
antiguas deben recargarse antes de guardar. El control es de compatibilidad del
despliegue, no una implementación de multitenancy ni RLS.

## Configuración activada

- Vercel Hobby, Fluid Compute e `iad1`; Neon Free en AWS us-east-1.
- `AI_JOBS_ENABLED=true` y `BLOB_PRIVATE_ENABLED=true` en Production.
- `CRON_SECRET` independiente y sensible, generado sin imprimirlo ni guardarlo
  localmente; mantenimiento diario a las 10:00 UTC.
- Se conservan los topes de aplicación para Workflow y Blob. No se modificaron
  suscripciones ni proveedores de IA.
- Preview usa la copia de Neon, variables limitadas a `codex/predeploy-20260909`,
  una clave de sesión propia y la protección de Vercel existente. IA y Blob están
  apagados en ese preview. Su base expira; no usarlo como entorno permanente.

## Validación y límites

El commit de código `fdf82b032af9ea0210fcfd2f673ab610f6a470df` pasó el
[CI completo](https://github.com/conamormarket-lgtm/intia/actions/runs/34409995746):
dependencias, lint, tipos, pruebas, ensayo de migración/restauración, build,
ejecutor local de Workflow y navegador. El cambio siguiente únicamente reactivó
el despliegue de `main`. Su build en Vercel pasó.

En la copia real de Neon se comprobó una semana con dos plataformas, suma exacta
0,1 + 0,2 = 0,3, rechazo de revisión desactualizada y lectura de un adjunto de
prueba. La transacción de prueba se revirtió completamente.

La comprobación HTTP de producción obtuvo:

| Ruta sin sesión | Resultado |
|---|---|
| /login | 200 |
| /generador/trabajos | 307 hacia /login |
| /api/maintenance | 401 |
| /api/assets/release-check-missing | 401 |

La sesión del usuario sigue pendiente en el navegador de ensayo. No se presentan
estas comprobaciones públicas como una prueba autenticada completa. Tampoco se
hicieron llamadas reales a IA, se ejecutó la cola administrada de Vercel ni se
subieron archivos reales a Blob durante esta activación. Esos recorridos y la
migración por lotes de los cuatro adjuntos históricos quedan pendientes de su
validación funcional. Los flags están activados; eso no sustituye probar el proveedor.

No se repitió una medición estadística de navegación en producción. Las mejoras
de tiempo documentadas en la entrega anterior siguen siendo resultados locales.

Los scripts de operación usaron las conexiones únicamente en memoria y en el
entorno del proceso hijo; no se guardaron cadenas de conexión ni secretos en este
informe o en Git.
