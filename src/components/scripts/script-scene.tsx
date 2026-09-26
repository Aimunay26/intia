import type { ReactNode } from "react";
import type { SceneData } from "@/app/(app)/guiones/[id]/scene-editor";
import { Badge, Card } from "@/components/ui";
import { VOICE_TYPE_MAP } from "@/lib/constants";
import { formatRange } from "@/lib/utils";
import styles from "./script-workspace.module.css";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.detail}><span className={styles.label}>{label}</span>{children}</div>;
}

export function ScriptScene({ scene, editor }: { scene: SceneData; editor?: ReactNode }) {
  const technical = scene.emotion || scene.lighting || scene.sound || scene.location || scene.props.length || scene.actors.length || scene.notes;
  return <Card className={styles.sceneCard}>
    <header className={styles.sceneHeader}>
      <div className="min-w-0"><h2 className="text-ink text-lg font-bold"><span className="text-brand mr-2 font-mono">{String(scene.order + 1).padStart(2, "0")}</span>{scene.beat || "Escena sin nombre"}</h2>
        <div className="text-inkmuted mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="font-mono">{formatRange(scene.startSec, scene.endSec)}</span><span>· {Math.max(0, scene.endSec - scene.startSec)} s</span><Badge option={VOICE_TYPE_MAP[scene.voiceType]} fallback={scene.voiceType} /></div>
      </div>{editor}
    </header>
    <div className={styles.sceneMain}>
      {scene.voice ? <div><span className={styles.label}>{scene.voiceType === "TEXTO" ? "Texto del guion" : "Lo que se oye"}</span><p className={styles.voice}>«{scene.voice}»</p></div> : <p className="text-inkmuted text-sm">{scene.voiceType === "TEXTO" ? "Escena con texto en pantalla." : "Sin diálogo registrado."}</p>}
      <Detail label="Lo que se ve">{scene.action || "Sin acción registrada."}</Detail>
      {scene.shot || scene.onScreenText ? <div className={styles.detailGrid}>
        {scene.shot ? <Detail label="Encuadre / cámara">{scene.shot}</Detail> : null}
        {scene.onScreenText ? <Detail label="Texto en pantalla"><span className="bg-surface2 block rounded-lg px-3 py-2 font-semibold">{scene.onScreenText}</span></Detail> : null}
      </div> : null}
    </div>
    {technical ? <details className={styles.details} data-scene-details>
      <summary>Actores y detalles de producción</summary>
      <div className={styles.detailGrid}>
        {scene.emotion ? <Detail label="Emoción">{scene.emotion}</Detail> : null}
        {scene.lighting ? <Detail label="Iluminación">{scene.lighting}</Detail> : null}
        {scene.sound ? <Detail label="Sonido">{scene.sound}</Detail> : null}
        {scene.location ? <Detail label="Locación">{scene.location}</Detail> : null}
        {scene.props.length ? <Detail label="Utilería"><ul className="list-inside list-disc">{scene.props.map((prop, i) => <li key={i}>{prop}</li>)}</ul></Detail> : null}
        {scene.actors.length ? <Detail label="Actores"><ul className="space-y-3">{scene.actors.map((actor, i) => <li key={i}><span className="font-semibold">{actor.role || "Sin papel"}</span>{actor.archetype ? <span> · {actor.archetype}</span> : null}{actor.notes ? <p className="text-inkmuted">{actor.notes}</p> : null}</li>)}</ul></Detail> : null}
        {scene.notes ? <Detail label="Notas de producción">{scene.notes}</Detail> : null}
      </div>
    </details> : <p className="text-inkmuted mt-6 text-xs">Sin detalles de producción adicionales.</p>}
  </Card>;
}
