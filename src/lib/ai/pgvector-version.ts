/** `hnsw.iterative_scan` (filtrar tras el índice sin quedarse corto de resultados) existe desde pgvector 0.8.0. */
export function supportsIterativeScan(version: string | null | undefined): boolean {
  const m = /^(\d+)\.(\d+)/.exec(version ?? "");
  if (!m) return false;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > 0 || minor >= 8;
}
