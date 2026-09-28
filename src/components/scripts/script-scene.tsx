import type { ReactNode } from "react";
import type { SceneData } from "@/app/(app)/guiones/[id]/scene-editor";
import { Badge, Card } from "@/components/ui";
import { VOICE_TYPE_MAP } from "@/lib/constants";
import { formatRange } from "@/lib/utils";
import { SceneNav } from "./scene-nav";
import styles from "./script-workspace.module.css";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.detail}><span className={styles.label}>{label}</span>{children}</div>;
}

/**
 * Una escena: cabecera de una fila (número, beat, tiempo, navegación y edición),
 * lo que se oye y se ve, y los detalles técnicos. En pantallas anchas los
 * detalles van en una columna lateral siempre visible; en el resto, plegables.
 */
export function ScriptScene({ scene, editor }: { scene: SceneData; editor?: ReactNode }) {
  const quick = scene.emotion || scene.lighting || scene.sound || scene.location;
  const technical = quick || scene.props.length || scene.actors.length || scene.notes;
  const beat = scene.beat || "Escena sin nombre";
  return <Card className={styles.sceneCard}>
    <header className={styles.sceneHeader}>
      <div className={styles.sceneHeading}>
        <h2 className={styles.sceneTitle} title={beat}><span className={styles.sceneNumber}>{String(scene.order + 1).padStart(2, "0")}</span><span className={styles.sceneTitleText}>{beat}</span></h2>
        <div className={styles.sceneMeta}><span className={`font-mono ${styles.sceneRange}`}>{formatRange(scene.startSec, scene.endSec)} ·</span><span>{Math.max(0, scene.endSec - scene.startSec)} s</span><Badge option={VOICE_TYPE_MAP[scene.voiceType]} fallback={scene.voiceType} /></div>
      </div>
      <SceneNav />
      {editor}
    </header>
    <div className={technical ? styles.sceneBody : `${styles.sceneBody} ${styles.single}`}>
      <div className={styles.sceneMain}>
        {scene.voice ? <div><span className={styles.label}>{scene.voiceType === "TEXTO" ? "Texto del guion" : "Lo que se oye"}</span><p className={styles.voice}>«{scene.voice}»</p></div> : <p className="text-inkmuted text-sm">{scene.voiceType === "TEXTO" ? "Escena con texto en pantalla." : "Sin diálogo registrado."}</p>}
        <Detail label="Lo que se ve">{scene.action || "Sin acción registrada."}</Detail>
        {scene.shot || scene.onScreenText ? <div className={styles.detailGrid}>
          {scene.shot ? <Detail label="Encuadre / cámara">{scene.shot}</Detail> : null}
          {scene.onScreenText ? <Detail label="Texto en pantalla"><span className={styles.screenText}>{scene.onScreenText}</span></Detail> : null}
        </div> : null}
        {technical ? null : <p className={styles.noDetails}>Sin detalles de producción adicionales.</p>}
      </div>
      {technical ? <div className={styles.aside}>
        <details className={styles.details} data-scene-details>
          <summary>Actores y detalles de producción</summary>
          <div className={styles.techBody}>
            {quick ? <div className={styles.techGrid}>
              {scene.emotion ? <Detail label="Emoción">{scene.emotion}</Detail> : null}
              {scene.lighting ? <Detail label="Iluminación">{scene.lighting}</Detail> : null}
              {scene.sound ? <Detail label="Sonido">{scene.sound}</Detail> : null}
              {scene.location ? <Detail label="Locación">{scene.location}</Detail> : null}
            </div> : null}
            {scene.props.length ? <Detail label="Utilería"><ul className={styles.propList}>{scene.props.map((prop, i) => <li key={i} className={`chip chip-plain ${styles.prop}`}>{prop}</li>)}</ul></Detail> : null}
            {scene.actors.length ? <Detail label="Actores"><ul className={styles.actorList}>{scene.actors.map((actor, i) => <li key={i}><span className="font-semibold">{actor.role || "Sin papel"}</span>{actor.archetype ? <span> · {actor.archetype}</span> : null}{actor.notes ? <p className="text-inkmuted">{actor.notes}</p> : null}</li>)}</ul></Detail> : null}
            {scene.notes ? <Detail label="Notas de producción">{scene.notes}</Detail> : null}
          </div>
        </details>
      </div> : null}
    </div>
  </Card>;
}
