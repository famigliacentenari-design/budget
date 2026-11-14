# Budget famiglia

App web per registrare entrate e uscite della famiglia, confrontarle con il preventivo e seguire il patrimonio.
Funziona da telefono, tablet e PC. I dati stanno su **Supabase** (database gratuito, accesso solo per voi due);
l'app è pubblicata gratis con **GitHub Pages**.

> Il codice in questo repository non contiene dati personali. Il file `storico.json` con i movimenti 2022–2026
> **non va caricato su GitHub**: si importa direttamente dall'app.

---

## Messa in funzione (circa 20 minuti, una volta sola)

### 1. Crea il database su Supabase
1. Vai su <https://supabase.com>, clicca **Start your project** e accedi con l'account GitHub di famiglia.
2. **New project** → nome `budget-famiglia`, scegli una password per il database (salvala, non servirà nell'app),
   regione **Central EU (Frankfurt)**, piano **Free**. Attendi 1–2 minuti.
3. Apri **SQL Editor** → **New query**. Incolla tutto il contenuto di `supabase/schema.sql`.
   **Prima di eseguirlo** sostituisci le due email di esempio con le vostre email vere, poi premi **Run**.
   Deve comparire "Success. No rows returned".

### 2. Crea i due utenti
1. **Authentication → Users → Add user → Create new user**.
2. Inserisci email (la stessa scritta in `schema.sql`) e una password, spunta **Auto Confirm User**. Ripeti per Simona.
3. **Authentication → Sign In / Providers** (o *Settings*): disattiva **Allow new users to sign up**,
   così nessun altro può registrarsi.

### 3. Collega l'app al database
1. In Supabase: **Project Settings → API** (o **Data API**). Copia il **Project URL** e la chiave **anon / public**.
2. Apri `js/config.js` e incolla i due valori:
   ```js
   export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```
   La chiave *anon* può stare nel codice pubblico: senza login e senza essere tra i membri non si vede nulla.
   **Non usare mai** la chiave *service_role*.

### 4. Pubblica su GitHub Pages
1. Su GitHub (account di famiglia): **New repository** → nome `budget` → **Public** → Create.
2. **Add file → Upload files**: trascina **il contenuto** di questa cartella (`index.html`, `css`, `js`, `supabase`,
   le icone, `manifest.webmanifest`, `README.md`). Non caricare `storico.json`. **Commit changes**.
3. **Settings → Pages** → *Source*: **Deploy from a branch**, branch `main`, cartella `/ (root)` → **Save**.
4. Dopo un minuto l'app è su `https://<nome-account>.github.io/budget/`.

### 5. Importa lo storico
1. Apri l'indirizzo, accedi con la tua email e password.
2. Al primo accesso si apre **Impostazioni**: nella sezione *Importa lo storico da Excel* scegli `storico.json`.
   Attendi il messaggio "Fatto: 6.029 movimenti importati" (circa 30 secondi). Da fare **una sola volta**.

### 6. Mettila sul telefono
- **iPhone (Safari)**: Condividi → *Aggiungi alla schermata Home*.
- **Android (Chrome)**: menu ⋮ → *Aggiungi a schermata Home* / *Installa app*.

---

## Cosa fa

| Sezione | Cosa trovi |
|---|---|
| **Nuovo** | Inserimento rapido: importo (accetta anche calcoli tipo `30,90-15`), voci più usate in alto, data, pagamento, chi ha pagato, note. Suggerisce le descrizioni già usate. |
| **Movimenti** | Elenco per giorno con ricerca e filtri (anno, mese, voce, categoria, pagamento, persona), totali ed esportazione CSV per Excel. Tocca un movimento per modificarlo o eliminarlo. |
| **Analisi** | Entrate/uscite/saldo, mese per mese, preventivo e consuntivo per voce con il "ritmo" atteso a oggi e la proiezione a fine anno, categorie rispetto all'anno prima nello stesso periodo, confronto tra anni, andamento di una voce, metodi di pagamento, spese più grandi. |
| **Preventivo** | Budget per voce e per anno, con lo storico accanto; copia dall'anno precedente con un tocco. |
| **Patrimonio** | Rilevazioni periodiche dei saldi dei conti (liquidità, risparmi, investimenti) e il loro andamento. |
| **Impostazioni** | Voci (rinomina, cambia categoria, disattiva), metodi di pagamento, conti, esportazione completa, importazione. |

## Note sui dati importati
- Le voci degli anni passati sono state uniformate ai nomi 2026 (es. *Scuola Davide* → *Davide*, *Sport Davide/Rebecca* →
  *Sport e attività ludiche*, *GELSIA* → *GELSIA / E-on*). Il nome originale resta visibile aprendo il movimento.
- I movimenti senza data (646 nel 2022, pochi negli altri anni) sono datati al 15 del mese indicato, con la nota "[data stimata]".
- Le date con l'anno sbagliato (es. 31/12/2025 nel file 2024) sono state riportate all'anno del file.
- Nel 2022 due accrediti di Assegno Unico erano marcati come uscite: ora sono entrate.

## Backup
Da **Impostazioni → Esporta tutti i movimenti (CSV)** ottieni in ogni momento un file apribile con Excel.
Supabase Free non fa backup automatici: conviene esportare ogni tanto (es. a fine mese).

## Modalità prova
Se `js/config.js` è vuoto, l'app funziona in "modalità prova" salvando i dati solo nel browser: utile per provarla
aprendo `index.html` tramite un piccolo server locale, prima di configurare Supabase.
