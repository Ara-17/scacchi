# Scacchi Multiplayer - Real-Time Web Application (P2P & WebSockets)

Applicazione web full-stack che consente agli utenti di registrarsi, autenticarsi e disputare partite di scacchi in tempo reale. 

Il progetto si distingue per un'architettura ibrida avanzata: utilizza **WebSockets** per il matchmaking e il signaling iniziale, e **WebRTC (tramite PeerJS)** per stabilire una connessione Peer-to-Peer (P2P) diretta tra i giocatori durante la partita, abbattendo la latenza e riducendo il carico sul server centrale.

## Stack Tecnologico e Requisiti di Progetto

L'infrastruttura è stata progettata per soddisfare rigorosi requisiti tecnologici, dividendo nettamente le responsabilità tra frontend, backend, database e rete P2P.

* **Frontend:** React.js, Vite, React-Router-Dom, React-Chessboard, Chess.js.
* **Backend:** Node.js, Express.js.
* **Signaling Server:** Socket.io (WebSocket).
* **Connessione P2P:** PeerJS (WebRTC).
* **Database:** MySQL (libreria `mysql2`).

## Architettura di Rete: Socket.io + PeerJS

La scelta di affiancare **Socket.io** e **PeerJS** è il vero cuore pulsante del progetto e risolve il problema della scalabilità. Ecco come collaborano:

1. **Fase di Signaling (Socket.io - Server-Side):**
   * Il server Node.js funge da "punto di ritrovo".
   * Quando i giocatori si collegano alla stanza di gioco (`Room`), Socket.io gestisce la loro presenza.
   * Il server si occupa di scambiare gli **ID di PeerJS** tra il Giocatore 1 (Bianco) e il Giocatore 2 (Nero). In questo modo, i client sanno "chi chiamare".

2. **Fase di Gameplay (PeerJS - Client-Side P2P):**
   * Una volta che i client hanno ricevuto i rispettivi Peer ID tramite Socket.io, stabiliscono una connessione diretta **WebRTC** utilizzando PeerJS.
   * Da questo momento in poi, lo stato della partita, le mosse (es. `e2-e4`) e la sincronizzazione della stringa FEN viaggiano *esclusivamente* sul canale P2P tra i due browser.
   * **Vantaggio:** Il server Node.js viene liberato dal carico di dover elaborare e smistare ogni singola mossa di ogni singola partita attiva.

## Struttura del Database (MySQL)

La persistenza dei dati è delegata a un database relazionale, necessario per la gestione sicura dell'autenticazione.

**Tabella `utenti`:**
* `id` (INT, Primary Key, Auto Increment)
* `username` (VARCHAR, Unique) - Identificativo univoco del giocatore.
* `password` (VARCHAR) - Archiviazione delle credenziali di accesso.

*(Nota: La connessione al DB è gestita tramite un pool di connessioni in `connessione.js` per garantire performance elevate ed evitare memory leak).*

## Funzionalità Principali e Moduli

* **Autenticazione e Accesso:** Pagine dedicate (`Login.jsx`, `Register.jsx`) con chiamate API REST (Express) verso il DB.
* **Motore Scacchistico Validato:** Sfrutta `chess.js` sul frontend. Qualsiasi mossa tentata dall'utente viene prima validata localmente. Se la mossa è illegale, il pezzo torna alla posizione di partenza. Se è legale, la mossa viene inviata sul canale DataConnection di PeerJS.
* **Interfaccia Dinamica SPA:** Rendering reattivo della scacchiera con `react-chessboard`. Lo stato della scacchiera si aggiorna automaticamente all'ascolto dell'evento `data` sul Peer.
* **Gestione Disconnessioni:** Se la connessione PeerJS cade o un giocatore abbandona la pagina, l'evento viene catturato e notificato all'avversario.

## Guida all'Installazione e all'Avvio

Il progetto richiede due terminali separati per l'esecuzione in ambiente di sviluppo locale, oltre a un server MySQL attivo.

### 1. Configurazione del Database
1. Avviare il demone MySQL (es. tramite XAMPP o servizio locale).
2. Verificare che le credenziali (host, utente, password, nome database) nel file `connessione.js` corrispondano al proprio ambiente locale.
3. Creare la tabella degli utenti.

### 2. Avvio del Server Node (Signaling & API)
Questo terminale gestirà le richieste di Login/Register e il server WebSocket per lo scambio dei PeerID.
```bash
# Entrare nella cartella radice del progetto
npm install

# Avviare il server
node server.js

### 3. Avvio del Frontend (React/Vite)
Aprire un **nuovo terminale** separato per gestire l'interfaccia utente:

```bash
# Spostarsi nella directory del frontend (es. frontend-chess)
cd frontend-chess

# Installare le dipendenze (React, PeerJS, Chessboard, ecc.)
npm install

# Avviare il server di sviluppo Vite
npm run dev

Il terminale restituirà un indirizzo locale (generalmente `http://localhost:5173`). Apri questo link nel tuo browser.

### 4. Testare una Partita in Locale

Per testare correttamente il sistema P2P e le WebSockets sullo stesso computer:
1. Apri **due finestre** del browser (ti consiglio di aprirne una in "Navigazione in Incognito" per mantenere separate le sessioni).
2. Naviga in entrambe all'indirizzo del frontend (`http://localhost:5173`).
3. **Registra** due account utente distinti (es. `Giocatore1` e `Giocatore2`) ed effettua il login.
4. Accedi alla pagina di gioco con entrambi. Il server (via Socket.io) accoppierà i due client nella stessa stanza, scambierà i Peer ID, assegnerà i colori (Bianco/Nero) e stabilirà automaticamente la connessione WebRTC.
5. Inizia a giocare! Le mosse verranno trasmesse in tempo reale via P2P.