-- COPIA Y PEGA ESTO EN EL EDITOR SQL DE SUPABASE
-- Esto agregará las columnas faltantes para que las nuevas estadisticas se guarden correctamente.

ALTER TABLE follower_history 
ADD COLUMN IF NOT EXISTS engagement_rate float DEFAULT 0,
ADD COLUMN IF NOT EXISTS account_trust_score int DEFAULT 0;

-- Confirmación visual después de correrlo (opcional)
SELECT * FROM follower_history LIMIT 1;
