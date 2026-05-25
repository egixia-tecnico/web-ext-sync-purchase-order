-- ============================================================
-- Egixia OC Sync — Seed: 1 cliente de ejemplo
-- Ejecutar DESPUÉS de 001_initial_schema.sql
-- ============================================================

INSERT INTO public.clients (
  client_key,
  name,
  base_url,
  user_name,
  password,
  client_id,
  client_secret,
  primary_color,
  sync_rules,
  batch_size,
  batch_delay_seconds,
  is_active
) VALUES (
  'egixia-demo',
  'Egixia Demo',
  'https://portal-demo.egixia.com',
  'usuario_demo',
  'password_demo',
  'client_id_demo',
  'client_secret_demo',
  '#10b981',
  'Solo sincronizar OC activas con fecha mayor a 2024-01-01. Validar proveedor antes de sincronizar.',
  10,
  3,
  TRUE
)
ON CONFLICT (client_key) DO NOTHING;
