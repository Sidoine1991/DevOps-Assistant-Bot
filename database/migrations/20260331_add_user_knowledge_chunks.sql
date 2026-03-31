-- Migration: base de connaissances utilisateur (RAG personnalisé)
-- Objectif: stocker les chunks issus des documents uploadés

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL DEFAULT 'text/plain',
  chunk_index integer NOT NULL DEFAULT 0,
  chunk_text text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_knowledge_chunks_user_id
  ON public.user_knowledge_chunks (user_id);

CREATE INDEX IF NOT EXISTS idx_user_knowledge_chunks_created_at
  ON public.user_knowledge_chunks (created_at DESC);

ALTER TABLE public.user_knowledge_chunks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_knowledge_chunks'
      AND policyname = 'Users can select own knowledge chunks'
  ) THEN
    CREATE POLICY "Users can select own knowledge chunks"
      ON public.user_knowledge_chunks
      FOR SELECT
      USING (auth.uid()::text = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_knowledge_chunks'
      AND policyname = 'Users can insert own knowledge chunks'
  ) THEN
    CREATE POLICY "Users can insert own knowledge chunks"
      ON public.user_knowledge_chunks
      FOR INSERT
      WITH CHECK (auth.uid()::text = user_id);
  END IF;
END $$;

COMMIT;
