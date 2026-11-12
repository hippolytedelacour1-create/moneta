-- Budget documents are private to their owner; writes use an optimistic revision.
-- This migration only adds Moneta objects and does not modify existing data.
create schema moneta_private;
revoke all on schema moneta_private from public, anon;
grant usage on schema moneta_private to authenticated;

create table public.moneta_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb,
  is_deleted boolean not null default false,
  revision bigint not null default 1 check (revision > 0 and revision <= 9007199254740991),
  updated_at timestamptz not null default now(),
  check ((is_deleted and payload is null) or (not is_deleted and payload is not null))
);
alter table public.moneta_documents enable row level security;
create policy moneta_owner_read on public.moneta_documents
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.moneta_documents from public, anon, authenticated;
grant select on public.moneta_documents to authenticated;

create function moneta_private.moneta_validate_budget(p_payload jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  field text;
  entry jsonb;
  value numeric;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 5242880 then
    raise exception 'Invalid budget document' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload->'name') is distinct from 'string'
    or length(p_payload->>'name') > 200
    or jsonb_typeof(p_payload->'configured') is distinct from 'boolean'
    or coalesce(p_payload->>'pace','') not in ('soft','medium','fast')
    or jsonb_typeof(p_payload->'transactions') is distinct from 'array' then
    raise exception 'Invalid budget fields' using errcode = '22023';
  end if;
  foreach field in array array['income','fixed','essentials','flexible','safety','goal'] loop
    if jsonb_typeof(p_payload->field) is distinct from 'number' then
      raise exception 'Invalid monetary field' using errcode = '22023';
    end if;
    value := (p_payload->>field)::numeric;
    if value < 0 or value > 1000000 or round(value,2) <> value then
      raise exception 'Invalid monetary amount' using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(p_payload->'transactions') > 20000 then
    raise exception 'Too many transactions' using errcode = '22023';
  end if;
  for entry in select jsonb_array_elements(p_payload->'transactions') loop
    if jsonb_typeof(entry) is distinct from 'object'
      or jsonb_typeof(entry->'id') is distinct from 'string' or length(entry->>'id') not between 1 and 200
      or jsonb_typeof(entry->'label') is distinct from 'string' or length(btrim(entry->>'label')) not between 1 and 1000
      or jsonb_typeof(entry->'category') is distinct from 'string' or length(entry->>'category') > 200
      or coalesce(entry->>'kind','') not in ('expense','income')
      or jsonb_typeof(entry->'date') is distinct from 'string' or (entry->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(entry->'amount') is distinct from 'number' then
      raise exception 'Invalid transaction' using errcode = '22023';
    end if;
    -- PostgreSQL rejects impossible dates (e.g. 2026-02-30).
    if to_char((entry->>'date')::date,'YYYY-MM-DD') <> entry->>'date' then
      raise exception 'Invalid transaction date' using errcode = '22023';
    end if;
    value := (entry->>'amount')::numeric;
    if value <= 0 or value > 1000000 or round(value,2) <> value then
      raise exception 'Invalid transaction amount' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_payload->'transactions')) <>
    (select count(distinct item->>'id') from jsonb_array_elements(p_payload->'transactions') item) then
    raise exception 'Duplicate transaction id' using errcode = '22023';
  end if;
end;
$$;
revoke all on function moneta_private.moneta_validate_budget(jsonb) from public, anon, authenticated;

create function moneta_private.moneta_save_budget(p_payload jsonb, p_expected_revision bigint)
returns public.moneta_documents language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  result public.moneta_documents;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise exception 'Invalid revision' using errcode = '22023';
  end if;
  perform moneta_private.moneta_validate_budget(p_payload);
  if p_expected_revision = 0 then
    insert into public.moneta_documents(user_id,payload,revision)
      values (owner_id,p_payload,1) on conflict (user_id) do nothing returning * into result;
  else
    update public.moneta_documents set payload=p_payload,is_deleted=false,revision=revision+1,updated_at=now()
      where user_id=owner_id and revision=p_expected_revision returning * into result;
  end if;
  if result.user_id is null then raise exception 'Budget changed on another device' using errcode = '40001'; end if;
  return result;
end;
$$;
revoke all on function moneta_private.moneta_save_budget(jsonb,bigint) from public, anon;
grant execute on function moneta_private.moneta_save_budget(jsonb,bigint) to authenticated;

-- Preserve an empty revision marker after deletion. Reusing revision 1 after a
-- delete/recreate would let a stale device overwrite a newly created budget.
create function moneta_private.moneta_delete_budget(p_expected_revision bigint)
returns public.moneta_documents language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); result public.moneta_documents;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.moneta_documents set payload=null,is_deleted=true,revision=revision+1,updated_at=now()
    where user_id=owner_id and revision=p_expected_revision returning * into result;
  if result.user_id is null then raise exception 'Budget changed on another device' using errcode = '40001'; end if;
  return result;
end;
$$;
revoke all on function moneta_private.moneta_delete_budget(bigint) from public, anon;
grant execute on function moneta_private.moneta_delete_budget(bigint) to authenticated;

-- Public RPC wrappers run with the caller's privileges. The tightly scoped
-- privileged implementation lives outside the schemas exposed by the Data API.
create function public.moneta_save_budget(p_payload jsonb,p_expected_revision bigint)
returns public.moneta_documents language sql security invoker set search_path = '' as $$
  select * from moneta_private.moneta_save_budget(p_payload,p_expected_revision);
$$;
revoke all on function public.moneta_save_budget(jsonb,bigint) from public, anon;
grant execute on function public.moneta_save_budget(jsonb,bigint) to authenticated;

create function public.moneta_delete_budget(p_expected_revision bigint)
returns public.moneta_documents language sql security invoker set search_path = '' as $$
  select * from moneta_private.moneta_delete_budget(p_expected_revision);
$$;
revoke all on function public.moneta_delete_budget(bigint) from public, anon;
grant execute on function public.moneta_delete_budget(bigint) to authenticated;
