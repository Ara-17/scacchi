Scacchi Multiplayer - Real-Time Web Application P2P e WebSockets
Sistema avanzato per il gioco degli scacchi in multiplayer online.
Il progetto sfrutta un'architettura ibrida per garantire la minima latenza e abbattere il carico sul server: utilizza WebSockets per l'orchestrazione del matchmaking e il signaling iniziale, e WebRTC (tramite PeerJS) per stabilire una connessione Peer-to-Peer diretta tra i giocatori durante l'effettiva partita.

Funzionalità Principali
Autenticazione Sicura: Sistema di registrazione e login persistente per gli utenti, interfacciato direttamente con un database MySQL.

Matchmaking Real-Time: Ricerca degli avversari, accoppiamento e creazione dinamica delle stanze di gioco gestite centralmente dal server Node.js tramite Socket.io.

Gameplay Peer-to-Peer: Una volta accoppiati, i client stabiliscono un tunnel diretto via WebRTC. Le mosse e gli aggiornamenti della scacchiera viaggiano esclusivamente tra i due browser, escludendo il server dal flusso dati e azzerando la latenza.

Interfaccia e Validazione: Frontend single-page application ultra-reattivo sviluppato in React.js, con controllo e validazione rigorosa delle mosse legali.

Stack Tecnologico
Frontend: React.js + Vite

Backend: Node.js + Express.js

Signaling & Orchestration: Socket.io (WebSocket)

Connessione Diretta P2P: PeerJS (WebRTC)

Database: MySQL

Architettura di Rete
L'infrastruttura di comunicazione è divisa in due macro-fasi logiche:

Fase di Signaling (Server-Side tramite Socket.io): Il server funge unicamente da intermediario iniziale. Raccoglie i giocatori in attesa, alloca le stanze virtuali e permette ai due client abbinati di scambiarsi i rispettivi Peer ID in totale sicurezza.

Fase di Gameplay (Client-Side tramite WebRTC): Ricevuti gli ID, i client instaurano una connessione P2P. A questo punto il server viene bypassato: tutte le interazioni sulla scacchiera viaggiano su questo canale diretto.

Requisiti e Configurazione Database
Per il funzionamento del sistema di autenticazione è necessario disporre di un'istanza MySQL attiva e configurata.

Assicurarsi di creare una tabella users con il seguente schema di base:

id (Primary Key, Auto-Increment)

username (Varchar, Unique, Not Null)

password (Varchar, Not Null)

Guida all'Installazione e Avvio
L'ambiente è separato in due moduli indipendenti (API Backend e Client Frontend). È necessario avviare entrambi i servizi contemporaneamente utilizzando due terminali separati.

1. Avvio Server Backend (Signaling & DB)
Gestisce l'autenticazione e il server Socket.io. Dalla directory principale del progetto avviare:
npm install
node server.js

2. Avvio Client Frontend (React)
L'interfaccia utente è pacchettizzata e servita tramite Vite. In un nuovo terminale avviare:
cd frontend-chess
npm install
npm run dev

L'applicazione sarà accessibile all'indirizzo locale: http://localhost:5173

Test dell'Applicazione in Locale
Per simulare correttamente una partita end-to-end e verificare il tunnel P2P:

Aprire due finestre del browser (di cui almeno una in modalità in Incognito/Anonima per non accavallare i cookie di sessione).

Navigare su http://localhost:5173 su entrambe le finestre.

Creare due account utente distinti dalla pagina di Registrazione ed effettuare il Login.

Cliccare su "Avvia Partita" contemporaneamente su entrambi i client: il sistema orchestrerà il matchmaking e aprirà la scacchiera attivando il gioco Peer-to-Peer.