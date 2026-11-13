-- Moneta production billing: isolated live records.
-- REVIEW AND APPLY BEFORE enabling Stripe Live checkout or webhooks.
-- Existing test tables and RPCs are deliberately left unchanged.
begin;
create table if not exists public.moneta_live_billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique check (customer_id ~ '^cus_[A-Za-z0-9]+$'),
  checkout_id text,
  checkout_url text,
  checkout_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.moneta_live_billing_subscriptions (
  subscription_id text primary key check (subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null references public.moneta_live_billing_accounts(customer_id),
  status text not null,
  paid boolean not null default false,
  valid_until timestamptz,
  cancel_at_period_end boolean not null default false,
  observed_at timestamptz not null,
  mode text not null default 'live' check (mode='live')
);
create index if not exists moneta_live_subscriptions_user_idx on public.moneta_live_billing_subscriptions(user_id);
create table if not exists public.moneta_live_billing_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now()
);
alter table public.moneta_live_billing_accounts enable row level security;
alter table public.moneta_live_billing_subscriptions enable row level security;
alter table public.moneta_live_billing_events enable row level security;
revoke all on public.moneta_live_billing_accounts,public.moneta_live_billing_subscriptions,public.moneta_live_billing_events from anon,authenticated;
grant select,insert,update,delete on public.moneta_live_billing_accounts,public.moneta_live_billing_subscriptions,public.moneta_live_billing_events to service_role;
-- No user-facing policies: the server reads/writes these with service_role,
-- after validating JWT for client actions and Stripe signatures for webhooks.
commit;
