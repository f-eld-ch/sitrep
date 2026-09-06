-- +goose Up
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';

-- Drop the email uniqueness constraint — emails change when users update their IdP
-- profile, and we upsert on sub (the stable OIDC identifier).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS user_email_key;

-- +goose Down
ALTER TABLE public.users DROP COLUMN IF EXISTS name;
ALTER TABLE public.users ADD CONSTRAINT user_email_key UNIQUE (email);
