/**
 * Kill-switch del flujo de producción por equipos: PRODUCTION_FLOW_ENABLED === "true".
 *
 * Apagado (o sin valor), ninguna pantalla, acción, gancho del ciclo de vida ni el
 * mantenimiento diario consultan las tablas BrandTeamMember, BrandProductionSettings o
 * ProductionStep: todo se comporta como antes. Orden: migrar 20260928180000_production_flow
 * → desplegar → encender. Apagarlo de nuevo detiene la automatización al instante; lo ya
 * creado (pasos, tareas y asignaciones) se conserva.
 *
 * Módulo sin dependencias a propósito: lo importan el mantenimiento y las pruebas sin
 * arrastrar Prisma ni la sesión.
 */
export function productionFlowEnabled(): boolean {
  return process.env.PRODUCTION_FLOW_ENABLED === "true";
}
