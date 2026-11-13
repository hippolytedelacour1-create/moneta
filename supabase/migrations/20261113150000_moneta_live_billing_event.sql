-- Live billing event application: separate from test billing, service-role only.
-- This atomic RPC is invoked only after a Stripe live event signature and subscription ownership checks.
create or replace function public.moneta_apply_live_billing_event(
 p_event_id text,p_user_id uuid,p_customer_id text,p_subscription_id text,
 p_status text,p_paid boolean,p_valid_until timestamptz,
 p_cancel_at_period_end boolean,p_observed_at timestamptz
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_event_id !~ '^evt_[A-Za-z0-9]+$' or p_subscription_id !~ '^sub_[A-Za-z0-9]+$' then
   raise exception 'Malformed Stripe identifiers' using errcode='22023';
 end if;
 if not exists (select 1 from public.moneta_live_billing_accounts
                where user_id=p_user_id and customer_id=p_customer_id) then
   raise exception 'Live billing owner mismatch' using errcode='42501';
 end if;
 if exists (select 1 from public.moneta_live_billing_subscriptions
            where subscription_id=p_subscription_id and
                  (user_id<>p_user_id or customer_id<>p_customer_id)) then
   raise exception 'Live subscription owner mismatch' using errcode='42501';
 end if;
 insert into public.moneta_live_billing_events(event_id)
 values(p_event_id) on conflict do nothing;
 if not found then return false; end if;
 insert into public.moneta_live_billing_subscriptions
 (subscription_id,user_id,customer_id,status,paid,valid_until,cancel_at_period_end,observed_at,mode)
 values
 (p_subscription_id,p_user_id,p_customer_id,p_status,p_paid,p_valid_until,p_cancel_at_period_end,p_observed_at,'live')
 on conflict(subscription_id) do update
 set status=excluded.status,paid=excluded.paid,valid_until=excluded.valid_until,
     cancel_at_period_end=excluded.cancel_at_period_end,observed_at=excluded.observed_at
 where public.moneta_live_billing_subscriptions.observed_at<=excluded.observed_at;
 return true;
end;
$$;
revoke all on function public.moneta_apply_live_billing_event(text,uuid,text,text,text,boolean,timestamptz,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.moneta_apply_live_billing_event(text,uuid,text,text,text,boolean,timestamptz,boolean,timestamptz) to service_role;
