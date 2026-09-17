-- PostgreSQL extensions required for content-service
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector for RAG embeddings

-- Create content schema
CREATE SCHEMA IF NOT EXISTS content;

-- pgvector: embedding column + HNSW index (run after Prisma migration)
-- ALTER TABLE content.content_embeddings ADD COLUMN IF NOT EXISTS embedding vector(1536);
-- CREATE INDEX IF NOT EXISTS content_embeddings_vector_idx
--   ON content.content_embeddings USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
