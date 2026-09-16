"use client";

export function DocumentAiChoice({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="block space-y-1"><span className="label">Lectura del documento</span>
    <select className="input" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
      <option value="local">Lectura local · sin enviar a IA</option>
      <option value="google">Mejorar con Gemini</option>
      <option value="anthropic">Mejorar con Claude</option>
    </select>
    <span className="hint">La mejora envía el texto al proveedor elegido y usa el cupo compartido de IA. Una llamada por archivo, proveedor y día. Si falla, se conserva la lectura local.</span>
  </label>;
}
