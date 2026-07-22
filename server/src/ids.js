// Postgres int4 идентификаторы: оң және 2^31-1 шегінде
export function isDbId(n) {
  return Number.isInteger(n) && n > 0 && n <= 2147483647;
}
