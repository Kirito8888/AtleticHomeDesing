-- =============================================================================
-- pgvector: SQL complementario a la migración inicial.
-- Prisma crea la extensión (datasource.extensions) y la columna vector(768),
-- pero NO puede declarar índices sobre columnas Unsupported(). Este bloque se
-- pegará al final de la primera migración (`prisma migrate dev --create-only`)
-- tras aprobar el schema.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Índice ANN por distancia coseno (embeddings de gemini-embedding-001 @768).
-- m / ef_construction: valores por defecto de pgvector, adecuados < 1M filas.
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
  ON "DocumentChunk"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Invariante de partida doble a nivel de BD: cada transacción debe sumar 0.
-- Trigger diferido (se evalúa al COMMIT) para permitir insertar las líneas
-- de un asiento una a una dentro de la misma transacción SQL.
CREATE OR REPLACE FUNCTION check_transaction_balanced() RETURNS trigger AS $$
DECLARE
  tx_id TEXT := COALESCE(NEW."transactionId", OLD."transactionId");
  total BIGINT;
BEGIN
  SELECT COALESCE(SUM("amountCents"), 0) INTO total
    FROM "Posting" WHERE "transactionId" = tx_id;
  IF total <> 0 THEN
    RAISE EXCEPTION 'FinancialTransaction % no cuadra: suma de postings = % céntimos', tx_id, total;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posting_balanced ON "Posting";
CREATE CONSTRAINT TRIGGER posting_balanced
  AFTER INSERT OR UPDATE OR DELETE ON "Posting"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_transaction_balanced();
