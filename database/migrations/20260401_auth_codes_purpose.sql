BEGIN;

ALTER TABLE public.auth_verification_codes
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'verify';

COMMENT ON COLUMN public.auth_verification_codes.purpose IS 'verify = vérification email ; password_reset = réinitialisation mot de passe';

CREATE INDEX IF NOT EXISTS idx_auth_codes_email_purpose_created
  ON public.auth_verification_codes (email, purpose, created_at DESC);

COMMIT;
