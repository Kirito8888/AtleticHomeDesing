-- índice GIN de texto en DocumentChunk
-- This is an empty migration.


-- v2.6 · Búsqueda por texto en apuntes: to_tsvector('spanish', content) se calculaba por fila en cada consulta.
-- Índice GIN de expresión (la consulta de rag.ts usa exactamente esa expresión). Aditivo; Prisma no lo modela.
CREATE INDEX IF NOT EXISTS "DocumentChunk_content_tsv_idx"
  ON "DocumentChunk" USING gin (to_tsvector('spanish', "content"));
