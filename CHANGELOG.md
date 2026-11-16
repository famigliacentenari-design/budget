# Versioni dell'app Budget famiglia

## 1.3 — 14/11/2026
- Nuova sezione **Scadenze** (icona calendario nel menu):
  - **Scadenze** con importo (rate condominiali, polizze, bollo…): "Paga" registra il movimento nel budget, "Salta" la ignora.
  - **Appuntamenti** con data, ora e luogo: "Fatto" li toglie dall'elenco.
  - **Movimenti fissi** automatici o da confermare (es. mutuo).
- Ripetizioni: una volta, ogni N settimane, ogni N mesi, ogni N anni; giorno fisso, primo giorno lavorativo
  (esclusi weekend e festivi nazionali, Pasquetta compresa), ultimo giorno del mese, oppure "1° lunedì", "ultimo venerdì"…
  Il modulo mostra l'anteprima delle prossime date.
- **Mutuo** già impostato: 501,05 € il primo giorno lavorativo di ogni mese, registrato in automatico
  (i movimenti già inseriti a mano vengono riconosciuti e non duplicati).
- Riquadro "da gestire / in arrivo" in cima alla schermata Nuovo; i movimenti automatici hanno l'etichetta "auto".
- Richiede lo script `supabase/v1.3_scadenze.sql` (una volta).

## 1.2 — 14/11/2026
- Avviso doppioni: quando salvi un movimento, se nello stesso mese ce n'è già uno con lo stesso importo
  e la stessa voce (o la stessa descrizione), l'app lo mostra e chiede se salvare comunque.

## 1.1 — 14/11/2026
- Tolto il campo "Chi" (Marco/Simona) da inserimento, filtri, elenco ed esportazione CSV.
- Patrimonio: ogni conto vale il suo ultimo saldo; si possono aggiornare anche singoli conti, quando si vuole.
  Nuova sezione "Situazione dei conti" con la data dell'ultimo aggiornamento (in giallo se ferma da oltre 2 mesi).
- Grafici con periodo a scelta: raggruppamento per mese, trimestre, semestre, anno o biennio;
  intervalli rapidi (12 mesi, 2 anni, 5 anni, tutto) o date "Dal… Al…".
  Vale per il grafico del patrimonio e per il nuovo grafico "Entrate e uscite nel tempo" in Analisi.
- La versione dell'app è indicata in Impostazioni.

## 1.0 — 14/11/2026
- Prima versione: inserimento, movimenti, analisi, preventivo, patrimonio, impostazioni, importazione storico 2022–2026.
