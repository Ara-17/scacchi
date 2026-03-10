import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import db from './connessione.js'; 
import session from 'express-session';

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: 'http://localhost:5173', 
  methods: ['GET', 'POST'],
  credentials: true 
};

app.use(cors(corsOptions));
app.use(express.json());

app.use(session({
  secret: 'stringa_segreta',
  resave: false,
  saveUninitialized: false, 
  cookie: { 
    secure: false, 
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 
  }
}));

const io = new Server(server, { cors: corsOptions });

let onlineUsers = {};
let matchQueue = null;
let activeMatches = {}; 

function aggiornaListaOnline() {
  const users = Object.values(onlineUsers).filter(u => u.online).map(u => u.nome);
  io.emit('online-users', users);
}

// Funzione matematica per calcolare il nuovo ELO
function calcolaNuovoElo(eloGiocatore, eloAvversario, risultato) {
  const K = 32;
  const probabilitàVittoria = 1 / (1 + Math.pow(10, (eloAvversario - eloGiocatore) / 400));
  let score = risultato === 'win' ? 1 : risultato === 'draw' ? 0.5 : 0;
  return Math.round(eloGiocatore + K * (score - probabilitàVittoria));
}

app.post('/register', (req, res) => {
  const { username, password, email, nome, cognome, cf, cell } = req.body;
  const sql = "INSERT INTO utente (nome, cognome, username, email, password, cf, cell, elo) VALUES (?, ?, ?, ?, ?, ?, ?, 1200)";
  db.query(sql, [nome, cognome, username, email, password, cf, cell], (err) => {
    if (err) return res.status(500).json({ error: 'Errore database' });
    res.json({ message: 'Registrazione completata' });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const sql = "SELECT * FROM utente WHERE username = ? AND password = ?";
  db.query(sql, [username, password], (err, results) => {
    if (err) return res.status(500).json({ error: "Errore database" });
    if (results.length === 0) return res.status(401).json({ error: "Credenziali errate" });

    req.session.username = username;
    if (!onlineUsers[username]) {
        onlineUsers[username] = { nome: username, online: false, socketId: null };
    }
    
    req.session.save(() => res.json({ message: "Login effettuato", username: username }));
  });
});

app.get('/api/check-session', (req, res) => {
    if (req.session.username) res.json({ isLoggedIn: true, username: req.session.username });
    else res.json({ isLoggedIn: false });
});

app.post('/logout', (req, res) => {
    const user = req.session.username;
    if (user && onlineUsers[user]) onlineUsers[user].online = false;
    req.session.destroy();
    aggiornaListaOnline();
    res.json({ message: "Logout effettuato" });
});

// API per info utente (ELO e storico partite)
app.get('/api/userdata', (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: "Non autorizzato" });
  const username = req.session.username;

  db.query("SELECT elo FROM utente WHERE username = ?", [username], (err, userRes) => {
    if (err || userRes.length === 0) return res.status(500).json({ error: "Errore DB" });
    
    const elo = userRes[0].elo;
    const sqlHistory = `
      SELECT * FROM partita 
      WHERE giocatore_bianco = ? OR giocatore_nero = ? 
      ORDER BY data_partita DESC LIMIT 10
    `;
    
    db.query(sqlHistory, [username, username], (err, historyRes) => {
      if (err) return res.status(500).json({ error: "Errore DB storico" });
      res.json({ elo, history: historyRes });
    });
  });
});

// API per salvare la partita e aggiornare ELO (Chiamata solo dall'host a fine partita online)
app.post('/api/save-match', (req, res) => {
  const { bianco, nero, risultatoBianco } = req.body; // risultatoBianco: 'win', 'loss', 'draw'
  
  db.query("SELECT username, elo FROM utente WHERE username IN (?, ?)", [bianco, nero], (err, users) => {
    if (err || users.length !== 2) return res.status(500).json({ error: "Utenti non trovati" });

    const userB = users.find(u => u.username === bianco);
    const userN = users.find(u => u.username === nero);

    const risultatoNero = risultatoBianco === 'win' ? 'loss' : risultatoBianco === 'loss' ? 'win' : 'draw';

    const nuovoEloB = calcolaNuovoElo(userB.elo, userN.elo, risultatoBianco);
    const nuovoEloN = calcolaNuovoElo(userN.elo, userB.elo, risultatoNero);

    const diffB = nuovoEloB - userB.elo;
    const diffN = nuovoEloN - userN.elo;

    const risultatoStringa = risultatoBianco === 'win' ? '1-0' : risultatoBianco === 'loss' ? '0-1' : '1/2-1/2';

    db.query("UPDATE utente SET elo = ? WHERE username = ?", [nuovoEloB, bianco]);
    db.query("UPDATE utente SET elo = ? WHERE username = ?", [nuovoEloN, nero]);

    const sqlInsert = "INSERT INTO partita (giocatore_bianco, giocatore_nero, risultato, variazione_bianco, variazione_nero) VALUES (?, ?, ?, ?, ?)";
    db.query(sqlInsert, [bianco, nero, risultatoStringa, diffB, diffN], (err) => {
      if (err) console.error(err);
      res.json({ message: "Partita salvata" });
    });
  });
});

io.on('connection', (socket) => {
  socket.on('set-online', (username) => {
    if (!username) return;
    if (!onlineUsers[username]) {
      onlineUsers[username] = { nome: username, online: true, socketId: socket.id };
    } else {
      onlineUsers[username].online = true;
      onlineUsers[username].socketId = socket.id;
    }
    aggiornaListaOnline(); 
  });

  socket.on('challenge', ({ from, to }) => {
    const userTo = onlineUsers[to];
    if (userTo && userTo.online) io.to(userTo.socketId).emit('challenge-request', { from });
  });

  socket.on('challenge-accepted', ({ from, to }) => {
    const userFrom = onlineUsers[from];
    if (userFrom && userFrom.online) {
      activeMatches[from] = to;
      activeMatches[to] = from;
      io.to(userFrom.socketId).emit('challenge-accepted', { to });
    }
  });
  
  socket.on('challenge-rejected', ({ from, to }) => {
      const userFrom = onlineUsers[from];
      if (userFrom && userFrom.online) io.to(userFrom.socketId).emit('challenge-rejected', { to });
  });

  socket.on('find-random-match', (username) => {
    if (matchQueue && matchQueue !== username && onlineUsers[matchQueue] && onlineUsers[matchQueue].online) {
      const opponent = matchQueue;
      matchQueue = null; 
      
      activeMatches[username] = opponent;
      activeMatches[opponent] = username;

      io.to(onlineUsers[opponent].socketId).emit('match-found', { opponent: username, isHost: true });
      io.to(onlineUsers[username].socketId).emit('match-found', { opponent: opponent, isHost: false });
    } else {
      matchQueue = username;
    }
  });

  socket.on('select-color', ({ to, color }) => {
    const userTo = onlineUsers[to];
    if (userTo && userTo.online) io.to(userTo.socketId).emit('color-selected', color);
  });

  socket.on('send-move', ({ to, moveData }) => {
    const userTo = onlineUsers[to];
    if (userTo && userTo.online) io.to(userTo.socketId).emit('receive-move', moveData);
  });

  // Gestione Patta e Resa
  socket.on('resign', ({ to }) => {
    const userTo = onlineUsers[to];
    if (userTo && userTo.online) io.to(userTo.socketId).emit('opponent-resigned');
  });

  socket.on('draw-request', ({ to }) => {
    const userTo = onlineUsers[to];
    if (userTo && userTo.online) io.to(userTo.socketId).emit('draw-requested');
  });

  socket.on('draw-accept', ({ to }) => {
    const userTo = onlineUsers[to];
    if (userTo && userTo.online) io.to(userTo.socketId).emit('draw-accepted');
  });

  socket.on('draw-reject', ({ to }) => {
    const userTo = onlineUsers[to];
    if (userTo && userTo.online) io.to(userTo.socketId).emit('draw-rejected');
  });

  socket.on('leave-all-matches', (username) => {
     if (matchQueue === username) matchQueue = null;
     const opponent = activeMatches[username];
     if (opponent) {
         if (onlineUsers[opponent] && onlineUsers[opponent].socketId) {
             io.to(onlineUsers[opponent].socketId).emit('opponent-disconnected');
         }
         delete activeMatches[username];
         delete activeMatches[opponent];
     }
  });

  socket.on('disconnect', () => {
    const userObj = Object.values(onlineUsers).find(u => u.socketId === socket.id);
    if (userObj) {
        const disconnectedUser = userObj.nome;
        userObj.online = false;
        userObj.socketId = null;
        if (matchQueue === disconnectedUser) matchQueue = null;

        const opponentInMatch = activeMatches[disconnectedUser];
        if (opponentInMatch && onlineUsers[opponentInMatch] && onlineUsers[opponentInMatch].socketId) {
            io.to(onlineUsers[opponentInMatch].socketId).emit('opponent-disconnected');
        }

        delete activeMatches[disconnectedUser];
        if (opponentInMatch) delete activeMatches[opponentInMatch];
    }
    aggiornaListaOnline();
  });
}); 

server.listen(3001, () => {
  console.log('Server in ascolto sulla porta 3001');
});