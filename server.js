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

const io = new Server(server, {
  cors: corsOptions
});

let onlineUsers = {};
let matchQueue = null;
let activeMatches = {}; 

function aggiornaListaOnline() {
  const users = Object.values(onlineUsers).filter(u => u.online).map(u => u.nome);
  io.emit('online-users', users);
}

app.post('/register', (req, res) => {
  const { username, password, email, nome, cognome, cf, cell } = req.body;
  const sql = "INSERT INTO utente (nome, cognome, username, email, password, cf, cell) VALUES (?, ?, ?, ?, ?, ?, ?)";
  db.query(sql, [nome, cognome, username, email, password, cf, cell], (err, result) => {
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

  // NUOVA LOGICA: Abbandono sicuro (risolve il crash dei pezzi congelati)
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