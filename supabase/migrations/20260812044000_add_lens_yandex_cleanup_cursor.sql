alter table public.companion_lens_cleanup_state
  add column if not exists yandex_cursor text,
  add column if not exists yandex_swept_at timestamptz;
