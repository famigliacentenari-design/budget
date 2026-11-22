-- =====================================================================
--  FACOLTATIVO - da eseguire SOLO se avevi già eseguito v1.5_scontrini.sql
--  (la prima versione della 1.5, che salvava le foto).
--  Toglie la cartella delle foto e la colonna "allegato", ora non più usate.
-- =====================================================================
delete from storage.objects where bucket_id = 'scontrini';
delete from storage.buckets where id = 'scontrini';
drop policy if exists scontrini_lettura on storage.objects;
drop policy if exists scontrini_caricamento on storage.objects;
drop policy if exists scontrini_modifica on storage.objects;
drop policy if exists scontrini_eliminazione on storage.objects;
alter table public.movimenti drop column if exists allegato;
