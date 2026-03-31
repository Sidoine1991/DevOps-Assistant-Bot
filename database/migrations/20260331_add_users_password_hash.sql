BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash text;

CREATE INDEX IF NOT EXISTS idx_users_email_password_hash
  ON public.users(email, password_hash);

COMMIT;
