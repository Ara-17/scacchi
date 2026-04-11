# Scacchi Multiplayer - Real-Time P2P Web App

Un sistema avanzato per giocare a scacchi in multiplayer online. Questo progetto sfrutta un'architettura ibrida progettata per garantire la **minima latenza** e abbattere il carico sul server. 

Il matchmaking iniziale e l'orchestrazione avvengono tramite **WebSockets**, ma una volta iniziata la partita, il flusso passa su **WebRTC** (tramite PeerJS), stabilendo un tunnel Peer-to-Peer (P2P) diretto tra i due giocatori. Nessun server di mezzo, nessuna latenza aggiunta sulle mosse.

---

## Funzionalità Principali

* **Autenticazione Sicura:** Sistema di registrazione e login per gli utenti con gestione delle sessioni persistenti, appoggiato su un database MySQL.
* **Matchmaking Real-Time:** Il server Node.js individua i giocatori disponibili, li accoppia e crea dinamicamente le stanze virtuali via Socket.io.
* **Gameplay 100% Peer-to-Peer:** Appena la stanza è pronta, i client si scambiano i propri ID e aprono una connessione P2P diretta. Il server viene escluso dal flusso dati della partita, azzerando di fatto la latenza.
* **Interfaccia e Validazione React:** Il frontend è una Single Page Application (SPA) reattiva. Non si limita a renderizzare la UI, ma esegue un controllo rigoroso e la validazione delle mosse legali.

## Stack Tecnologico

**Frontend:**
* React.js + Vite (Build veloci e Hot Module Replacement (HMR) che permette di sviluppare il  progetto in modo fluido evitando attese e perdite di stato durante i test)
* HTML5 / CSS3 / JavaScript (ES6+)

**Backend & Infrastruttura:**
* Node.js + Express.js (API REST e orchestrazione)
* Socket.io (WebSocket per il signaling iniziale)
* PeerJS / WebRTC (Per la connessione diretta P2P)
* MySQL (Database relazionale per gli utenti)

---

## Struttura del Progetto

Il repository è diviso in due macro-moduli separati per garantire la modularità:

~~~text
scacchi-multiplayer/
├── frontend-chess/       # Client React (Vite)
│   ├── src/              # Componenti React (Game, Login, Home...)
│   ├── public/           # Asset statici (immagini, pezzi, ecc.)
│   └── package.json      # Dipendenze Frontend
├── package.json          # Dipendenze Backend
├── server.js             # Entry-point Server Node.js + Socket.io
└── connessione.js        # Configurazione e pool di connessione MySQL
~~~

---

## Prerequisiti

Prima di iniziare, assicurati di avere installati sul tuo computer:

* **Node.js** (versione 16.x o superiore raccomandata)
* **npm** (incluso in Node.js)
* **MySQL Server** (in esecuzione e accessibile in locale)

---

## Configurazione del Database (MySQL)

Per far funzionare il sistema di autenticazione e salvare gli utenti, devi preparare il database e la relativa tabella.

1. Avvia la tua istanza MySQL (tramite XAMPP, MAMP, Docker o servizio nativo).
2. Apri il tuo client SQL (es. phpMyAdmin, DBeaver, MySQL Workbench) ed esegui questo script:

~~~sql
CREATE DATABASE IF NOT EXISTS scacchi_db;
USE scacchi_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
);
~~~

3. **Importante:** Apri il file `connessione.js` nel progetto backend e inserisci le tue credenziali di accesso a MySQL (Host, User, Password e Nome del DB).

---

## Guida all'Installazione e Avvio

Dato che il progetto è diviso in due parti, **dovrai avviare due terminali separati**, uno per il server Node e uno per il frontend React.

### 1. Avvio del Server Backend (Signaling & DB)

Dal primo terminale, posizionati nella cartella principale del progetto:

~~~bash
# Installa le dipendenze del backend (Express, Socket.io, MySQL2, ecc.)
npm install

# Avvia il server Node.js
node server.js
~~~

### 2. Avvio del Client Frontend (React)

Apri un secondo terminale, entra nella directory del frontend ed esegui:

~~~bash
# Entra nella cartella frontend
cd frontend-chess

# Installa le dipendenze React e Vite
npm install

# Avvia il server di sviluppo
npm run dev
~~~

L'applicazione sarà ora accessibile all'indirizzo locale: **[http://localhost:5173](http://localhost:5173)**

---

## Test dell'Applicazione in Locale (P2P end-to-end)

Workflow perfetto per simulare una partita da solo:

1. Apri il browser e vai su `http://localhost:5173`.
2. Apri **una nuova finestra in Incognito/Navigazione privata** (oppure usa un browser diverso, es. Firefox) per non far accavallare i cookie di sessione, e vai allo stesso indirizzo.
3. Dalla pagina di **Registrazione**, crea due account utente distinti (es. `Giocatore1` e `Giocatore2`).
4. Effettua il **Login** sulle due finestre rispettive.
5. Clicca su **"Avvia Partita"** contemporaneamente da entrambi i client.
   * Il server Socket.io rileverà i due giocatori in coda, creerà la stanza e condividerà in sicurezza i Peer ID.
   * I due browser stabiliranno in autonomia un tunnel WebRTC.
6. La scacchiera si aprirà su entrambi gli schermi. Prova a muovere i pezzi per vedere che i dati viaggiano istantaneamente e direttamente da una finestra all'altra, bypassando del tutto il server Node.