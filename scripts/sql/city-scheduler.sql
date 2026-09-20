-- Run only after deploying city-reconcile and creating these two Vault secrets:
-- city_function_origin = https://<project>.supabase.co/functions/v1
-- city_reconcile_secret = the same value as Edge CITY_RECONCILE_SECRET
-- Never commit secret values. Requires pg_cron and pg_net enabled in the project.
do $$ begin
  if (select count(*) from vault.decrypted_secrets where name in ('city_function_origin','city_reconcile_secret'))<>2 then
    raise exception 'Configure city_function_origin and city_reconcile_secret in Vault first';
  end if;
end $$;
select cron.schedule('synarc-city-reconcile','* * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='city_function_origin') || '/city-reconcile',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='city_reconcile_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
$job$);
