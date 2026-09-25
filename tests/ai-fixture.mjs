/** Solo simulaciones: omite autorización, telemetría y plazo compartido de la aplicación. */
export const simulatedRequest = work => work({ timeoutMs: 240000, signal: new AbortController().signal });
export const validScript = {
  title: 'Guion fixture', avatar: '', focus: '', hook: '', cta: '', totalSeconds: 5, castNotes: '', propsSummary: [],
  scenes: [{ beat: 'Inicio', startSec: 0, endSec: 5, voiceType: 'EN_CAMARA', voice: 'Texto ficticio para la prueba.', shot: 'Plano medio', action: 'Presenta el producto ficticio.', actors: [], emotion: '', props: [], lighting: '', sound: '', onScreenText: '', location: '', notes: '' }],
};

/** Forma de error de Google: el SDK incluye QuotaFailure dentro del mensaje JSON. */
export function geminiQuotaBody(quotaId = 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaMetric = 'generativelanguage.googleapis.com/generate_content_free_tier_requests') {
  return JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota, please check your plan and billing details.', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric, quotaId, quotaDimensions: { project: 'PRIVATE-FIXTURE' } }] }] } });
}
