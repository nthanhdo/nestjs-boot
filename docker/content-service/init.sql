-- PostgreSQL extensions required for content-service full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Create content schema
CREATE SCHEMA IF NOT EXISTS content;
