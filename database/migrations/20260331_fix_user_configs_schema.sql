-- Migration: aligner user_configs avec le backend actuel
-- Date: 2026-03-31
-- Objectif:
--   - garantir les colonnes: user_id, api_key, provider, updated_at
--   - rendre api_key nullable pour supporter provider=local-rag
--   - ajouter contraintes et index utiles
--   - poser des policies RLS minimales

BEGIN;

-- 1) Table de base
CREATE TABLE IF NOT EXISTS public.user_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  api_key text NULL,
  provider text NOT NULL DEFAULT 'openai',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Colonnes manquantes (si la table existe deja)
ALTER TABLE public.user_configs ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.user_configs ADD COLUMN IF NOT EXISTS api_key text;
ALTER TABLE public.user_configs ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.user_configs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.user_configs ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 3) Valeurs par defaut / not null
UPDATE public.user_configs
SET provider = 'openai'
WHERE provider IS NULL OR provider = '';

UPDATE public.user_configs
SET updated_at = now()
WHERE updated_at IS NULL;

ALTER TABLE public.user_configs
  ALTER COLUMN provider SET DEFAULT 'openai';

ALTER TABLE public.user_configs
  ALTER COLUMN provider SET NOT NULL;

ALTER TABLE public.user_configs
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.user_configs
  ALTER COLUMN updated_at SET NOT NULL;

-- api_key doit rester nullable (mode local-rag)
ALTER TABLE public.user_configs
  ALTER COLUMN api_key DROP NOT NULL;

-- 4) Contraintes metier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_configs_provider_check'
  ) THEN
    ALTER TABLE public.user_configs
      ADD CONSTRAINT user_configs_provider_check
      CHECK (provider IN ('openai', 'gemini', 'local-rag'));
  END IF;
END $$;

-- provider local-rag => api_key autorisee NULL/empty
-- provider openai/gemini => api_key requise
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_configs_api_key_by_provider_check'
  ) THEN
    ALTER TABLE public.user_configs
      ADD CONSTRAINT user_configs_api_key_by_provider_check
      CHECK (
        (provider = 'local-rag')
        OR (api_key IS NOT NULL AND length(trim(api_key)) > 0)
      );
  END IF;
END $$;

-- 5) Index / unicite user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_configs_user_id
  ON public.user_configs (user_id);

-- 6) Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_user_configs_updated_at'
  ) THEN
    CREATE TRIGGER update_user_configs_updated_at
      BEFORE UPDATE ON public.user_configs
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 7) RLS et policies minimales
ALTER TABLE public.user_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_configs'
      AND policyname = 'Users can select own config'
  ) THEN
    CREATE POLICY "Users can select own config"
      ON public.user_configs
      FOR SELECT
      USING (auth.uid()::text = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_configs'
      AND policyname = 'Users can insert own config'
  ) THEN
    CREATE POLICY "Users can insert own config"
      ON public.user_configs
      FOR INSERT
      WITH CHECK (auth.uid()::text = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_configs'
      AND policyname = 'Users can update own config'
  ) THEN
    CREATE POLICY "Users can update own config"
      ON public.user_configs
      FOR UPDATE
      USING (auth.uid()::text = user_id)
      WITH CHECK (auth.uid()::text = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_configs'
      AND policyname = 'Users can delete own config'
  ) THEN
    CREATE POLICY "Users can delete own config"
      ON public.user_configs
      FOR DELETE
      USING (auth.uid()::text = user_id);
  END IF;
END $$;

COMMIT;
