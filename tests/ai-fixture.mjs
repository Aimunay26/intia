/** Solo simulaciones: jamás usar este adaptador sin cupos en código de aplicación. */
export const simulatedRequest = work => work({ timeoutMs: 240000, signal: new AbortController().signal });
export const validScript = {
  title: 'Guion fixture', avatar: '', focus: '', hook: '', cta: '', totalSeconds: 5, castNotes: '', propsSummary: [],
  scenes: [{ beat: 'Inicio', startSec: 0, endSec: 5, voiceType: 'EN_CAMARA', voice: 'Texto ficticio para la prueba.', shot: 'Plano medio', action: 'Presenta el producto ficticio.', actors: [], emotion: '', props: [], lighting: '', sound: '', onScreenText: '', location: '', notes: '' }],
};
