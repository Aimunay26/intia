import { Prisma } from "@prisma/client";

/** Nunca pasa por Number antes de persistir. La UI recibe una cadena decimal exacta. */
export function parseMoney(raw: string, label = "Importe") {
  const value = raw.trim().replace(",", ".") || "0";
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) throw new Error(`${label}: usa un importe positivo con hasta seis decimales.`);
  const amount = new Prisma.Decimal(value);
  if (amount.gt("1000000000000")) throw new Error(`${label}: supera el máximo permitido.`);
  return amount;
}

export function parseCsvMoney(raw: string) {
  let value = raw.trim().replace(/^(?:S\/|PEN|USD|\$)\s*/i, "").trim();
  if (value.includes(".") && value.includes(",")) {
    if (/^\d{1,3}(?:\.\d{3})+,\d{1,6}$/.test(value)) value = value.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(?:,\d{3})+\.\d{1,6}$/.test(value)) value = value.replace(/,/g, "");
    else throw new Error("Los separadores del importe no son válidos.");
  } else if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(value)) {
    throw new Error("Importe ambiguo: escribe 1234 para miles o 1.234000 para decimales.");
  }
  return parseMoney(value);
}
