-- User Terms of Service Acceptance tracking
-- Records when users accept ToS/Privacy Policy with version tracking

create table if not exists public.user_terms_acceptance (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    terms_version text not null,
    privacy_version text not null,
    accepted_at timestamptz not null default now(),
    ip_address inet,
    user_agent text,

    -- Ensure one record per user per version combination
    unique (user_id, terms_version, privacy_version)
);

-- Index for fast lookups by user
create index if not exists idx_user_terms_acceptance_user_id
    on public.user_terms_acceptance (user_id, accepted_at desc);

-- Index for checking current version acceptance
create index if not exists idx_user_terms_acceptance_version
    on public.user_terms_acceptance (user_id, terms_version, privacy_version);

-- RLS policies
alter table if exists public.user_terms_acceptance enable row level security;

-- Users can only read their own acceptance records
create policy user_terms_acceptance_select_own on public.user_terms_acceptance
    for select
    using (auth.uid() = user_id);

-- Users can insert their own acceptance records
create policy user_terms_acceptance_insert_own on public.user_terms_acceptance
    for insert
    with check (auth.uid() = user_id);

-- Users cannot update or delete acceptance records (audit trail)
-- No update or delete policies - records are immutable for compliance

-- Helper function to check if user has accepted current terms
create or replace function public.has_accepted_terms(
    p_user_id uuid,
    p_terms_version text,
    p_privacy_version text
) returns boolean
language sql
security definer
stable
as $$
    select exists (
        select 1
        from public.user_terms_acceptance
        where user_id = p_user_id
          and terms_version = p_terms_version
          and privacy_version = p_privacy_version
    );
$$;

-- Helper function to get user's latest acceptance
create or replace function public.get_latest_terms_acceptance(p_user_id uuid)
returns table (
    terms_version text,
    privacy_version text,
    accepted_at timestamptz
)
language sql
security definer
stable
as $$
    select terms_version, privacy_version, accepted_at
    from public.user_terms_acceptance
    where user_id = p_user_id
    order by accepted_at desc
    limit 1;
$$;
