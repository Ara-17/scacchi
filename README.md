# Scacchi Multiplayer - Real-Time Web Application (P2P + WebSockets)

Applicazione web per giocare a scacchi in multiplayer online.  
Architettura ibrida: WebSockets per il matchmaking e WebRTC (PeerJS) per la comunicazione diretta tra client durante la partita.

---

## Funzionalità

- **Autenticazione**
  - Registrazione e login persistente
  - Storage utenti su MySQL

- **Matchmaking Real-Time**
  - Ricerca avversari
  - Creazione e gestione stanze tramite Node.js + Socket.io

- **Gameplay P2P**
  - Scambio mosse diretto tra client via WebRTC
  - Il server non gestisce il traffico di gioco

- **Interfaccia**
  - SPA in React
  - Validazione delle mosse lato client

---

## Stack Tecnologico

- **Frontend**: React + Vite  
- **Backend**: Node.js + Express  
- **Signaling**: Socket.io  
- **P2P**: PeerJS (WebRTC)  
- **Database**: MySQL  

---

## Architettura

### 1. Signaling (Server-Side)

Il server:
- gestisce autenticazione
- coordina il matchmaking
- scambia i Peer ID tra i client

Tecnologie coinvolte:
- `Express`
- `Socket.io`

### 2. Gameplay (Client-Side)

I client:
- stabiliscono una connessione diretta WebRTC
- scambiano le mosse senza passare dal server

Tecnologie coinvolte:
- `PeerJS`
- `WebRTC`

---

## Configurazione Database

Richiede un'istanza MySQL.

### 1. Creazione database

Creare un database dedicato (es. `chess_app`).

### 2. Tabella `users`

```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL
);
```
## Guida all'Installazione e Avvio

L'ambiente è separato in due moduli indipendenti (API Backend e Client Frontend). È necessario avviare entrambi i servizi contemporaneamente utilizzando due terminali separati.

### 1. Avvio Server Backend (Signaling & DB)

Gestisce l'autenticazione e il server Socket.io. Dalla directory principale del progetto:

~~~bash
npm install
node server.js
~~~

### 2. Avvio Client Frontend (React)

L'interfaccia utente è pacchettizzata e servita tramite Vite. In un nuovo terminale posizionarsi nella cartella del frontend:

~~~bash
cd frontend-chess
npm install
npm run dev
~~~

L'applicazione sarà accessibile all'indirizzo locale: [http://localhost:5173](http://localhost:5173)

## Test dell'Applicazione in Locale

Per simulare correttamente una partita end-to-end e verificare il tunnel P2P:

1. Aprire due finestre del browser (di cui almeno una in modalità in Incognito/Anonima per non accavallare i cookie di sessione).
2. Navigare su [http://localhost:5173](http://localhost:5173) su entrambe le finestre.
3. Creare due account utente distinti dalla pagina di Registrazione ed effettuare il Login.
4. Cliccare su "Avvia Partita" contemporaneamente su entrambi i client: il sistema orchestrerà il matchmaking e aprirà la scacchiera attivando il gioco Peer-to-Peer.