-- =====================================================================
--  Budget Familiare — struttura del database (Supabase / PostgreSQL)
--  Da incollare UNA volta in: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- 1) Chi può usare l'app -------------------------------------------------
create table if not exists public.membri (
  email text primary key,
  nome  text not null
);

-- >>> MODIFICA QUI le due email (le stesse con cui creerete gli utenti) <<<
insert into public.membri (email, nome) values
  ('email-di-marco@esempio.it',  'Marco'),
  ('email-di-simona@esempio.it', 'Simona')
on conflict (email) do update set nome = excluded.nome;

create or replace function public.is_membro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membri
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 2) Anagrafiche --------------------------------------------------------
create table if not exists public.macro (
  codice text primary key,
  nome   text not null,
  tipo   char(1) not null check (tipo in ('E','U')),
  ordine int not null default 0
);

create table if not exists public.voci (
  id           int generated always as identity primary key,
  nome         text not null unique,
  suggerimento text,
  tipo         char(1) not null check (tipo in ('E','U')),
  macro        text not null references public.macro(codice),
  attiva       boolean not null default true,
  ordine       int not null default 0
);

create table if not exists public.metodi (
  nome   text primary key,
  attivo boolean not null default true,
  ordine int not null default 0
);

-- 3) Movimenti ----------------------------------------------------------
create table if not exists public.movimenti (
  id             bigint generated always as identity primary key,
  data           date not null,
  voce_id        int not null references public.voci(id) on delete restrict,
  importo        numeric(12,2) not null check (importo <> 0),
  descrizione    text,
  metodo         text,
  chi            text,
  note           text,
  voce_originale text,
  creato_da      text default (auth.jwt() ->> 'email'),
  creato_il      timestamptz not null default now(),
  modificato_il  timestamptz
);
create index if not exists movimenti_data_idx on public.movimenti (data);
create index if not exists movimenti_voce_idx on public.movimenti (voce_id);

-- 4) Preventivo per anno ------------------------------------------------
create table if not exists public.preventivi (
  anno    int not null,
  voce_id int not null references public.voci(id) on delete cascade,
  importo numeric(12,2) not null default 0,
  primary key (anno, voce_id)
);

-- 5) Patrimonio: conti e saldi -------------------------------------------
create table if not exists public.conti (
  id     int generated always as identity primary key,
  nome   text not null unique,
  tipo   text not null check (tipo in ('liquidità','risparmio','investimento')),
  attivo boolean not null default true,
  ordine int not null default 0
);

create table if not exists public.saldi (
  conto_id int  not null references public.conti(id) on delete cascade,
  data     date not null,
  saldo    numeric(14,2) not null,
  primary key (conto_id, data)
);

-- 6) Sicurezza: solo i membri leggono e scrivono --------------------------
do $$
declare t text;
begin
  foreach t in array array['macro','voci','metodi','movimenti','preventivi','conti','saldi'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists solo_membri on public.%I', t);
    execute format('create policy solo_membri on public.%I for all to authenticated using (public.is_membro()) with check (public.is_membro())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.membri enable row level security;
drop policy if exists membri_lettura on public.membri;
create policy membri_lettura on public.membri for select to authenticated using (public.is_membro());
revoke all on public.membri from anon;
grant select on public.membri to authenticated;
