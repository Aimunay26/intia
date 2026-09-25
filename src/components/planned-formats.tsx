export function PlannedFormats({ structures, selected = [] }: { structures: { id: string; name: string }[]; selected?: string[] }) {
  return <fieldset className="space-y-2"><legend className="font-semibold">Formatos previstos</legend>
    <input type="hidden" name="structureIdsForm" value="1" />
    {selected.filter(id => !structures.some(s => s.id === id)).map(id => <input key={id} type="hidden" name="structureIds" value={id} />)}
    {structures.map(s => <label key={s.id} className="mr-3 inline-flex gap-2"><input type="checkbox" name="structureIds" value={s.id} defaultChecked={selected.includes(s.id)} />{s.name}</label>)}
    <p className="text-xs text-inkmuted">La estructura definitiva se establece al vincular el guion.</p>
  </fieldset>;
}
