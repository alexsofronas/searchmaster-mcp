create table if not exists public.free_daily_spend (
  day date primary key,
  spent_usd numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.free_daily_spend enable row level security;

create or replace function public.reserve_free_daily_spend(
  p_amount numeric,
  p_cap numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('utc', now()))::date;
  current_spent numeric;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('allowed', true, 'spent_usd', 0, 'cap_usd', p_cap);
  end if;

  if p_cap is null or p_cap < 0 then
    p_cap := 5;
  end if;

  insert into public.free_daily_spend (day, spent_usd)
  values (today, 0)
  on conflict (day) do nothing;

  select spent_usd into current_spent
  from public.free_daily_spend
  where day = today
  for update;

  if current_spent + p_amount > p_cap then
    return jsonb_build_object(
      'allowed', false,
      'spent_usd', current_spent,
      'cap_usd', p_cap
    );
  end if;

  update public.free_daily_spend
  set spent_usd = spent_usd + p_amount,
      updated_at = now()
  where day = today;

  return jsonb_build_object(
    'allowed', true,
    'spent_usd', current_spent + p_amount,
    'cap_usd', p_cap
  );
end;
$$;

create or replace function public.peek_free_daily_spend(
  p_amount numeric,
  p_cap numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('utc', now()))::date;
  current_spent numeric;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('allowed', true, 'spent_usd', 0, 'cap_usd', p_cap);
  end if;

  if p_cap is null or p_cap < 0 then
    p_cap := 5;
  end if;

  select spent_usd into current_spent
  from public.free_daily_spend
  where day = today;

  current_spent := coalesce(current_spent, 0);

  return jsonb_build_object(
    'allowed', current_spent + p_amount <= p_cap,
    'spent_usd', current_spent,
    'cap_usd', p_cap
  );
end;
$$;

create or replace function public.refund_free_daily_spend(
  p_amount numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('utc', now()))::date;
begin
  if p_amount is null or p_amount <= 0 then
    return;
  end if;

  update public.free_daily_spend
  set spent_usd = greatest(spent_usd - p_amount, 0),
      updated_at = now()
  where day = today;
end;
$$;

revoke all on function public.reserve_free_daily_spend(numeric, numeric) from public, anon, authenticated;
revoke all on function public.peek_free_daily_spend(numeric, numeric) from public, anon, authenticated;
revoke all on function public.refund_free_daily_spend(numeric) from public, anon, authenticated;
grant execute on function public.reserve_free_daily_spend(numeric, numeric) to service_role;
grant execute on function public.peek_free_daily_spend(numeric, numeric) to service_role;
grant execute on function public.refund_free_daily_spend(numeric) to service_role;
