/** Validación de entrada compartida por formularios y acciones. No corrige datos inválidos en silencio. */
export function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9999-12-31") return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function requireDay(value: string): string {
  if (!validDay(value)) throw new Error("La fecha no existe. Usa el formato AAAA-MM-DD.");
  return value;
}

export function requireTime(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("La hora debe estar entre 00:00 y 23:59.");
  return value;
}

export function choice<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new Error(`${label}: el valor no está permitido.`);
  return value as T;
}

export function enumField(fd: FormData, name: string, catalog: Record<string, unknown>, fallback?: string): string {
  const raw = fd.get(name);
  const value = typeof raw === "string" ? raw.trim() : "";
  return choice(value || fallback || "", Object.keys(catalog), name);
}

export function boundedNumber(value: number, min: number, max: number, label: string, integer = false): number {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${label}: indica ${integer ? "un entero" : "un número"} entre ${min} y ${max}.`);
  }
  return value;
}

export function parseNumber(value: string, label: string): number {
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(value)) throw new Error(`${label}: el número no es válido.`);
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number)) throw new Error(`${label}: el número es demasiado grande.`);
  return number;
}
