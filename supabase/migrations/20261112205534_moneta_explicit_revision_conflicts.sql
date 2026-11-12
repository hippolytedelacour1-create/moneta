-- Application revision conflicts are HTTP 409, not retryable SQL serialization failures.
create or replace function moneta_private.moneta_save_budget(p_payload jsonb, p_expected_revision bigint)
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
  if result.user_id is null then raise exception 'Budget changed on another device' using errcode = 'PT409'; end if;
  return result;
end;
$$;

create or replace function moneta_private.moneta_delete_budget(p_expected_revision bigint)
returns public.moneta_documents language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); result public.moneta_documents;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.moneta_documents set payload=null,is_deleted=true,revision=revision+1,updated_at=now()
    where user_id=owner_id and revision=p_expected_revision returning * into result;
  if result.user_id is null then raise exception 'Budget changed on another device' using errcode = 'PT409'; end if;
  return result;
end;
$$;
