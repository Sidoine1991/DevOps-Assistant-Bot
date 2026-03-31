BEGIN;

-- Corrige le blocage RLS pour l'API backend (clé anon Supabase)
-- afin de permettre l'inscription + émission/validation de code OTP.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_verification_codes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'Users can insert own user row'
  ) THEN
    DROP POLICY "Users can insert own user row" ON public.users;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'Backend can manage users'
  ) THEN
    CREATE POLICY "Backend can manage users"
      ON public.users
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'auth_verification_codes'
      AND policyname = 'Backend can manage auth codes'
  ) THEN
    CREATE POLICY "Backend can manage auth codes"
      ON public.auth_verification_codes
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMIT;
