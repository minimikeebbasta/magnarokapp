# Magnarok – mini web app (PWA) + Realtime opzionale

Questa mini app serve per **aggiornare in tempo reale** i valori della stella e le note (Visione / Cartella clinica) da telefono.

## 1) Uso rapido (senza realtime)
- Apri l'app
- Modalità: **Solo locale (offline)**
- I dati restano sul singolo telefono (localStorage)

## 2) Realtime tra telefoni (consigliato): Firebase
### A) Crea progetto
1. Vai su Firebase console
2. Crea un progetto
3. Aggiungi una Web App (</>)

### B) Abilita Realtime Database
1. Database -> Realtime Database -> Crea
2. Regole (per partire veloce durante il viaggio):
   - Modalità test (temporanea)
   - Oppure usa regole con auth anonima

### C) (Opzionale ma consigliato) Auth anonima
1. Authentication -> Sign-in method -> abilita **Anonymous**

### D) Inserisci config in app.js
Apri `app.js` e sostituisci l'oggetto `FIREBASE_CONFIG` con quello della console.

### E) Deploy veloce
- **Netlify Drop**: trascina la cartella su Netlify
- **Vercel**: importa repo
- **GitHub Pages**: static site

Poi ogni giocatore:
- apre lo stesso link
- inserisce lo stesso **Codice sessione**
- preme **Connetti**

## Nota
L'app non applica automaticamente la logica della Stella (multipli 2/3, soglie, percezione):
è un **tracker live**. La logica resta nelle decisioni del Master.
