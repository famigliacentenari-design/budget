# Versioni dell'app Budget famiglia

## 1.5.5 — 25/11/2026
- Date dei movimenti più visibili (intestazione colorata per giorno, fissa in alto durante lo scorrimento).

## 1.5.4 — 25/11/2026
- L'accesso vale solo per il giorno: ogni giorno l'app chiede di nuovo email e password.
- Aggiornamento automatico: se online c'è una versione più recente, l'app si ricarica da sola.

## 1.5.3 — 23/11/2026
- Riquadro **Novità** al primo avvio dopo ogni aggiornamento (su ogni dispositivo), con le modifiche
  delle versioni non ancora viste. Si riapre da Impostazioni → "Novità delle versioni".

## 1.5.2 — 22/11/2026
- Lettura scontrini più affidabile: il totale viene confermato cercando l'importo ripetuto
  (totale, pagamento elettronico, importo pagato, carta); le percentuali IVA (es. 10,00%) non vengono
  più scambiate per importi. Funziona anche quando i prezzi sono in colonna separata.
- Voce proposta anche in base a cosa c'è sullo scontrino (es. cappuccino/brioche → Tempo libero,
  gasolio → Spese auto) e confronto con lo storico più rigoroso (niente parole generiche come "club").

## 1.5.1 — 22/11/2026
- Google Calendar: in calendario vanno solo **scadenze e appuntamenti**. I movimenti fissi (es. mutuo)
  non vengono più copiati; quelli già presenti vengono tolti alla prossima sincronizzazione.

## 1.5 — 21/11/2026
- **Leggi scontrino** nella schermata Nuovo: si apre la fotocamera, l'app legge lo scontrino e compila
  importo totale, data, negozio e metodo di pagamento; propone la voce in base al negozio
  (es. Esselunga → Supermercato, farmacia → Spese mediche, oppure come l'avete registrato in passato).
- La foto serve **solo per la lettura**: non viene salvata nell'app né nel database, e non finisce nel rullino.
- Lettura con Google Cloud Vision: chiave da inserire in Impostazioni → "Lettura automatica degli scontrini".
  Il pulsante compare solo dopo aver inserito la chiave.
- Nessuno script obbligatorio su Supabase.

## 1.4 — 17/11/2026
- **Google Calendar**: l'app crea il calendario "Famiglia – Scadenze" sull'account Google di famiglia e ci copia
  scadenze, appuntamenti e movimenti fissi dei prossimi 12 mesi, tenendoli aggiornati.
- **Notifiche sul telefono** tramite Google Calendar:
  - movimento fisso automatico (es. mutuo): alle 9:00 del giorno dell'addebito;
  - movimento da confermare: alle 9:00 del giorno;
  - scadenze: alle 9:00 del giorno di preavviso e del giorno prima;
  - appuntamenti: 1 ora prima e alle 9:00 dei giorni di preavviso.
- Pagato / saltato / fatto → l'evento diventa "✓" e le notifiche si spengono; eliminato → sparisce dal calendario.
- Sincronizzazione automatica dopo ogni modifica (se l'accesso Google è attivo), altrimenti con il pulsante "Sincronizza".
- Condivisione del calendario con altri account Google dall'app.
- Richiede lo script `supabase/v1.4_impostazioni.sql` e la configurazione su Google Cloud (vedi LEGGIMI).

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
