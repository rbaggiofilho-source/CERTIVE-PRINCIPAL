CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the job to run daily at 8:00 AM America/Sao_Paulo (which is 11:00 AM UTC in standard time, or just run at 11:00 UTC)
-- '0 11 * * *' = 11:00 AM UTC = 8:00 AM BRT
SELECT cron.schedule(
    'daily-notify-bills',
    '0 11 * * *',
    $$
    SELECT net.http_post(
        url:='https://aeajxahdflzqxmydxtgv.supabase.co/functions/v1/notify-bills',
        headers:='{"Content-Type": "application/json"}'::jsonb
    );
    $$
);
