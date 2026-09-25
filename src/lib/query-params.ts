import { validDay } from "@/lib/validation";

/** Untrusted URL values never reach SQL offsets or Date constructors directly. */
export function pageNumber(value: unknown, maximum = 100_000): number {
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return 1;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= maximum ? number : 1;
}

export function optionalDateRange(from: unknown, to: unknown) {
  let desde = typeof from === "string" && validDay(from) ? from : undefined;
  let hasta = typeof to === "string" && validDay(to) ? to : undefined;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  return { desde, hasta };
}

export function queryText(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Repeated query keys are arrays in Next; accept only single string values. */
export function singleQueryValues<T extends Record<string, unknown>>(query: T): { [K in keyof T]: string | undefined } {
  return Object.fromEntries(Object.entries(query).map(([key,value]) => [key, typeof value === "string" ? value : undefined])) as { [K in keyof T]: string | undefined };
}
