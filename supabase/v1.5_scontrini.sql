-- =====================================================================
--  Budget Familiare — aggiornamento database per la versione 1.5
--  Foto degli scontrini allegate ai movimenti
--  Da incollare in: Supabase > SQL Editor > New query > Run
--  (si può rieseguire senza danni)
-- =====================================================================

-- Percorso della foto allegata al movimento
alter table public.movimenti add column if not exists allegato text;

-- Cartella privata per le foto (non accessibile senza login)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scontrini', 'scontrini', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false;

-- Solo i membri della famiglia possono vedere, caricare e cancellare le foto
drop policy if exists scontrini_lettura on storage.objects;
drop policy if exists scontrini_caricamento on storage.objects;
drop policy if exists scontrini_modifica on storage.objects;
drop policy if exists scontrini_eliminazione on storage.objects;
create policy scontrini_lettura on storage.objects for select to authenticated
  using (bucket_id = 'scontrini' and public.is_membro());
create policy scontrini_caricamento on storage.objects for insert to authenticated
  with check (bucket_id = 'scontrini' and public.is_membro());
create policy scontrini_modifica on storage.objects for update to authenticated
  using (bucket_id = 'scontrini' and public.is_membro());
create policy scontrini_eliminazione on storage.objects for delete to authenticated
  using (bucket_id = 'scontrini' and public.is_membro());
