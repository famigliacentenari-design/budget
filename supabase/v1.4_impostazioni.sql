-- =====================================================================
--  Budget Familiare — aggiornamento database per la versione 1.4
--  Impostazioni condivise (collegamento a Google Calendar)
--  Da incollare in: Supabase > SQL Editor > New query > Run
--  (si può rieseguire senza danni)
-- =====================================================================

create table if not exists public.impostazioni (
  chiave        text primary key,
  valore        jsonb,
  aggiornato_il timestamptz not null default now()
);

alter table public.impostazioni enable row level security;
drop policy if exists solo_membri on public.impostazioni;
create policy solo_membri on public.impostazioni for all to authenticated using (public.is_membro()) with check (public.is_membro());
revoke all on public.impostazioni from anon;
grant select, insert, update, delete on public.impostazioni to authenticated;
