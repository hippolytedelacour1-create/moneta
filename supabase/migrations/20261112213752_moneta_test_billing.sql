-- Test billing only: customer mappings and events are server-only.
create table public.moneta_billing_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 customer_id text not null unique,
 checkout_id text,
 checkout_url text,
 checkout_expires_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.moneta_billing_subscriptions (
 subscription_id text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 customer_id text not null,
 status text not null,
 paid boolean not null default false,
 valid_until timestamptz,
 cancel_at_period_end boolean not null default false,
 observed_at timestamptz not null,
 mode text not null default 'test' check (mode='test')
);
create index moneta_billing_user on public.moneta_billing_subscriptions(user_id);
create table public.moneta_billing_events (
 event_id text primary key,
 processed_at timestamptz not null default now()
);
alter table public.moneta_billing_accounts enable row level security;
alter table public.moneta_billing_subscriptions enable row level security;
alter table public.moneta_billing_events enable row level security;
revoke all on public.moneta_billing_accounts,public.moneta_billing_subscriptions,public.moneta_billing_events from public,anon,authenticated;
grant all on public.moneta_billing_accounts,public.moneta_billing_subscriptions,public.moneta_billing_events to service_role;
create policy moneta_billing_server_accounts on public.moneta_billing_accounts to service_role using (true) with check (true);
create policy moneta_billing_server_subscriptions on public.moneta_billing_subscriptions to service_role using (true) with check (true);
create policy moneta_billing_server_events on public.moneta_billing_events to service_role using (true) with check (true);

create function moneta_private.billing_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select jsonb_build_object('plus',status='active' and paid and valid_until>now(),'status',status,'valid_until',valid_until,'cancel_at_period_end',cancel_at_period_end,'mode','test') into result
 from public.moneta_billing_subscriptions where user_id=owner_id
 order by (status='active' and paid and valid_until>now()) desc,observed_at desc limit 1;
 return coalesce(result,jsonb_build_object('plus',false,'status','free','mode','test'));
end;
$$;
revoke all on function moneta_private.billing_status() from public,anon;
grant execute on function moneta_private.billing_status() to authenticated,service_role;
create function public.moneta_billing_status()
returns jsonb language sql security invoker set search_path='' as $$ select moneta_private.billing_status(); $$;
revoke all on function public.moneta_billing_status() from public,anon;
grant execute on function public.moneta_billing_status() to authenticated;

create function public.moneta_apply_billing_event(p_event_id text,p_user_id uuid,p_customer_id text,p_subscription_id text,p_status text,p_paid boolean,p_valid_until timestamptz,p_cancel_at_period_end boolean,p_observed_at timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.moneta_billing_accounts where user_id=p_user_id and customer_id=p_customer_id) then
   raise exception 'Billing owner mismatch' using errcode='42501';
 end if;
 if exists(select 1 from public.moneta_billing_subscriptions where subscription_id=p_subscription_id and (user_id<>p_user_id or customer_id<>p_customer_id)) then
   raise exception 'Subscription owner mismatch' using errcode='42501';
 end if;
 insert into public.moneta_billing_events(event_id) values(p_event_id) on conflict do nothing;
 if not found then return false; end if;
 insert into public.moneta_billing_subscriptions(subscription_id,user_id,customer_id,status,paid,valid_until,cancel_at_period_end,observed_at)
 values(p_subscription_id,p_user_id,p_customer_id,p_status,p_paid,p_valid_until,p_cancel_at_period_end,p_observed_at)
 on conflict(subscription_id) do update set status=excluded.status,paid=excluded.paid,valid_until=excluded.valid_until,cancel_at_period_end=excluded.cancel_at_period_end,observed_at=excluded.observed_at
 where public.moneta_billing_subscriptions.observed_at<=excluded.observed_at;
 return true;
end;
$$;
revoke all on function public.moneta_apply_billing_event(text,uuid,text,text,text,boolean,timestamptz,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.moneta_apply_billing_event(text,uuid,text,text,text,boolean,timestamptz,boolean,timestamptz) to service_role;

-- Only the backend can fetch this single encrypted Vault secret.
create function moneta_private.billing_signing_secret()
returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then
   raise exception 'Server only' using errcode='42501';
 end if;
 select decrypted_secret into result from vault.decrypted_secrets where name='moneta_stripe_test_webhook' limit 1;
 return result;
end;
$$;
revoke all on function moneta_private.billing_signing_secret() from public,anon,authenticated;
grant usage on schema moneta_private to service_role;
grant execute on function moneta_private.billing_signing_secret() to service_role;
create function public.moneta_billing_signing_secret()
returns text language sql security invoker set search_path='' as $$ select moneta_private.billing_signing_secret(); $$;
revoke all on function public.moneta_billing_signing_secret() from public,anon,authenticated;
grant execute on function public.moneta_billing_signing_secret() to service_role;
