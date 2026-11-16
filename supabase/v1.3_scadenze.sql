-- =====================================================================
--  Budget Familiare — aggiornamento database per la versione 1.3
--  Scadenze, appuntamenti e movimenti ricorrenti (es. mutuo automatico)
--  Da incollare in: Supabase > SQL Editor > New query > Run
--  (si può rieseguire senza danni)
-- =====================================================================

create table if not exists public.scadenze (
  id           int generated always as identity primary key,
  tipo         text not null check (tipo in ('movimento','scadenza','appuntamento')),
  titolo       text not null,
  categoria    text,
  voce_id      int references public.voci(id) on delete set null,
  importo      numeric(12,2),
  metodo       text,
  modalita     text check (modalita in ('auto','conferma')),
  freq         text not null default 'mesi' check (freq in ('una','settimane','mesi','anni')),
  intervallo   int  not null default 1 check (intervallo between 1 and 60),
  regola       text not null default 'giorno' check (regola in ('giorno','primo_feriale','ultimo','nth')),
  nth          int,
  giorno_sett  int,
  data_inizio  date not null,
  data_fine    date,
  ora          time,
  durata_min   int,
  luogo        text,
  preavviso_gg int  not null default 7,
  note         text,
  attiva       boolean not null default true,
  creato_il    timestamptz not null default now()
);

-- Ogni ricorrenza già gestita (pagata, registrata in automatico, saltata o fatta)
create table if not exists public.scadenze_fatte (
  scadenza_id  int  not null references public.scadenze(id) on delete cascade,
  data         date not null,
  movimento_id bigint references public.movimenti(id) on delete set null,
  fatto_il     timestamptz not null default now(),
  primary key (scadenza_id, data)
);

do $$
declare t text;
begin
  foreach t in array array['scadenze','scadenze_fatte'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists solo_membri on public.%I', t);
    execute format('create policy solo_membri on public.%I for all to authenticated using (public.is_membro()) with check (public.is_membro())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Mutuo: 501,05 € il primo giorno lavorativo di ogni mese, registrato in automatico.
-- Parte da novembre 2026: il movimento di novembre già inserito viene riconosciuto e non duplicato.
insert into public.scadenze (tipo, titolo, categoria, voce_id, importo, metodo, modalita, freq, intervallo, regola, data_inizio, preavviso_gg)
select 'movimento', 'Rata mutuo', 'casa', v.id, 501.05, 'Addebito diretto c/c', 'auto', 'mesi', 1, 'primo_feriale', date '2026-11-01', 0
from public.voci v
where v.nome = 'Mutuo'
  and not exists (select 1 from public.scadenze s where s.titolo = 'Rata mutuo');
