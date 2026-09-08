/** Consulta conteo y filas en paralelo; corrige enlaces a páginas que ya no existen. */
export async function loadPage<T>(
  requested: string | undefined,
  pageSize: number,
  count: () => PromiseLike<number>,
  read: (range: { skip: number; take: number }) => PromiseLike<T[]>,
) {
  const number = Number(requested);
  const requestedPage = Number.isSafeInteger(number) && number > 0 && number <= 1_000_000 ? number : 1;
  const [total, firstItems] = await Promise.all([
    count(),
    read({ skip: (requestedPage - 1) * pageSize, take: pageSize }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const items = page === requestedPage
    ? firstItems
    : await read({ skip: (page - 1) * pageSize, take: pageSize });
  return { items, total, page, pageCount };
}
