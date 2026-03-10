import './Game.css'; 
import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import Peer from 'peerjs';

const pieceMap = {
  w: { p: 'W_pawn', r: 'W_rook', n: 'W_knight', b: 'W_bishop', q: 'W_queen', k: 'W_king' },
  b: { p: 'B_pawn', r: 'B_rook', n: 'B_knight', b: 'B_bishop', q: 'B_queen', k: 'B_king' }
};

function Game({ user, socket }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  const { mode, opponent, isHost } = location.state || { mode: 'friend' };

  const [game, setGame] = useState(new Chess());
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [promotionMove, setPromotionMove] = useState(null);
  const [lastMoveSquares, setLastMoveSquares] = useState([]);
  const [whiteTime, setWhiteTime] = useState(300); 
  const [blackTime, setBlackTime] = useState(300); 
  const [moveLog, setMoveLog] = useState([]);
  const [inCheckSquare, setInCheckSquare] = useState(null);

  const [connected, setConnected] = useState(mode === 'online');
  const [colorSelected, setColorSelected] = useState(false);
  const [myColor, setMyColor] = useState(null);  
  const [opponentColor, setOpponentColor] = useState(null);
  
  const [drawRequestedByOpponent, setDrawRequestedByOpponent] = useState(false);

  const gameRef = useRef(game);
  const myColorRef = useRef(myColor);
  const isHostRef = useRef(isHost);
  const gameOverRef = useRef(gameOver);

  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { myColorRef.current = myColor; }, [myColor]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  const [peer, setPeer] = useState(null);
  const [conn, setConn] = useState(null);
  const [peerId, setPeerId] = useState('');
  const [opponentId, setOpponentId] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [isPeerHost, setIsPeerHost] = useState(false); 

  const checkGameOver = () => typeof game.isGameOver === 'function' ? game.isGameOver() : game.game_over();
  const checkCheckmate = () => typeof game.isCheckmate === 'function' ? game.isCheckmate() : game.in_checkmate();
  const checkCheck = () => typeof game.isCheck === 'function' ? game.isCheck() : game.in_check();

  const salvaPartitaDB = (esitoBianco) => {
    if (mode === 'online' && isHostRef.current) {
        const bianco = myColorRef.current === 'w' ? user : opponent;
        const nero = myColorRef.current === 'b' ? user : opponent;
        
        fetch('http://localhost:3001/api/save-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bianco, nero, risultatoBianco: esitoBianco })
        }).catch(err => console.error(err));
    }
  }

  const terminaPartita = (messaggio, esitoHost) => {
      if(gameOverRef.current) return;
      setGameOver(true);
      setWinner(messaggio);
      salvaPartitaDB(esitoHost);
  }

  function isPromotionMove(from, to) {
    const piece = gameRef.current.get(from);
    if (!piece || piece.type !== 'p') return false;
    return (piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1');
  }

  function attemptMove(from, to, promotion = null) {
    const currentGame = gameRef.current;
    const currentMyColor = myColorRef.current;

    if (gameOverRef.current || currentGame.turn() !== currentMyColor) return false;

    const piece = currentGame.get(from);
    if (!piece || piece.color !== currentMyColor) return false;

    if (!promotion && isPromotionMove(from, to)) {
      const testGame = new Chess(currentGame.fen());
      try {
        const testMove = testGame.move({ from, to, promotion: 'q' });
        if (!testMove) return false;
      } catch (e) { return false; }
      setPromotionMove({ from, to });
      setSelectedSquare(null);
      setLegalMoves([]);
      return false; 
    }

    const moveObj = { from, to };
    if (promotion) moveObj.promotion = promotion;

    let moveData = null;
    const gameCopy = new Chess(currentGame.fen());
    
    try {
      const move = gameCopy.move(moveObj);
      if (move) {
        moveData = { piece: move.piece, color: move.color, from: move.from, to: move.to, promotion: move.promotion || null };
        setGame(gameCopy);
      } else return false;
    } catch (e) { return false; }

    setLastMoveSquares([from, to]);
    setSelectedSquare(null);
    setLegalMoves([]);
    setPromotionMove(null);
    setMoveLog((log) => [...log, moveData]);

    if (mode === 'online') socket.emit('send-move', { to: opponent, moveData });
    else if (conn && conn.open) conn.send({ type: 'move', data: moveData });

    return true; 
  }

  function promotePiece(piece) {
    if (!promotionMove) return;
    attemptMove(promotionMove.from, promotionMove.to, piece);
  }

  function onSquareClick(square) {
    const currentGame = gameRef.current;
    const currentMyColor = myColorRef.current;

    if (!colorSelected || gameOver || promotionMove) return;
    if (currentGame.turn() !== currentMyColor) return;

    if (selectedSquare && legalMoves.includes(square)) {
      attemptMove(selectedSquare, square);
      return;
    }

    const piece = currentGame.get(square);
    if (!piece || piece.color !== currentMyColor) {
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    try {
      const moves = currentGame.moves({ square, verbose: true }).filter(m => m.color === currentMyColor);
      if (moves.length > 0) {
        setSelectedSquare(square);
        setLegalMoves(moves.map(m => m.to));
      } else {
        setSelectedSquare(null);
        setLegalMoves([]);
      }
    } catch(e) {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  }

  useEffect(() => {
    if (checkGameOver() && !gameOver) {
      if (checkCheckmate()) {
          const vinceBianco = game.turn() === 'b';
          const esitoHost = (myColorRef.current === 'w' && vinceBianco) || (myColorRef.current === 'b' && !vinceBianco) ? 'win' : 'loss';
          terminaPartita(vinceBianco ? 'Bianco (Scacco Matto)' : 'Nero (Scacco Matto)', esitoHost);
      } else {
          terminaPartita('Pareggio', 'draw');
      }
    }
  }, [game.fen()]);

  useEffect(() => {
    if (checkCheck()) {
      const color = game.turn();
      let kingSq = null;
      for (let file of "abcdefgh") {
        for (let rank of "12345678") {
          const sq = file + rank;
          const piece = game.get(sq);
          if (piece && piece.type === "k" && piece.color === color) { kingSq = sq; break; }
        }
      }
      setInCheckSquare(kingSq);
    } else setInCheckSquare(null);
  }, [game.fen()]);

  useEffect(() => {
    if (!colorSelected || gameOver) return;
    const timer = setInterval(() => {
      if (game.turn() === 'w') {
        setWhiteTime(t => { 
            if (t <= 1) { 
                const esitoHost = myColorRef.current === 'w' ? 'loss' : 'win';
                terminaPartita('Nero (Vittoria per Tempo)', esitoHost); 
                clearInterval(timer); return 0; 
            } 
            return t - 1; 
        });
      } else {
        setBlackTime(t => { 
            if (t <= 1) { 
                const esitoHost = myColorRef.current === 'b' ? 'loss' : 'win';
                terminaPartita('Bianco (Vittoria per Tempo)', esitoHost); 
                clearInterval(timer); return 0; 
            } 
            return t - 1; 
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [game.turn(), gameOver, colorSelected]);

  const gestisciDisconnessioneAvversario = () => {
    terminaPartita(`Tu (L'avversario si è disconnesso)`, 'win');
  };

  const arrenditi = () => {
      if (window.confirm("Sei sicuro di volerti arrendere?")) {
          const esitoHost = myColorRef.current === 'w' ? 'loss' : 'win';
          terminaPartita('Avversario (Per abbandono)', esitoHost);
          if (mode === 'online') socket.emit('resign', { to: opponent });
          else if (conn) conn.send({ type: 'resign' });
      }
  };

  const chiediPatta = () => {
      alert("Richiesta di patta inviata.");
      if (mode === 'online') socket.emit('draw-request', { to: opponent });
      else if (conn) conn.send({ type: 'draw-request' });
  };

  useEffect(() => {
    if (mode === 'online') {
      if (!opponent) { navigate('/home'); return; }

      socket.on('receive-move', (moveData) => {
        setGame((g) => {
          const copy = new Chess(g.fen());
          try { copy.move({ from: moveData.from, to: moveData.to, promotion: moveData.promotion || undefined }); } catch(e) {}
          return copy;
        });
        setLastMoveSquares([moveData.from, moveData.to]);
        setMoveLog((log) => [...log, moveData]);
      });

      socket.on('color-selected', (hostColor) => {
        setOpponentColor(hostColor);
        setMyColor(hostColor === 'w' ? 'b' : 'w');
        setColorSelected(true);
      });

      socket.on('opponent-disconnected', gestisciDisconnessioneAvversario);
      
      socket.on('opponent-resigned', () => {
         const esitoHost = myColorRef.current === 'w' ? 'win' : 'loss'; 
         terminaPartita('Tu (L\'avversario si è arreso)', esitoHost);
      });

      socket.on('draw-requested', () => setDrawRequestedByOpponent(true));
      
      socket.on('draw-accepted', () => {
          terminaPartita('Pareggio (Accordo tra i giocatori)', 'draw');
      });

      socket.on('draw-rejected', () => alert("L'avversario ha rifiutato la patta."));
      
      return () => { 
        socket.removeAllListeners('receive-move');
        socket.removeAllListeners('color-selected');
        socket.removeAllListeners('opponent-disconnected');
        socket.removeAllListeners('opponent-resigned');
        socket.removeAllListeners('draw-requested');
        socket.removeAllListeners('draw-accepted');
        socket.removeAllListeners('draw-rejected');
      };

    } else {
      const newPeer = new Peer();
      setPeer(newPeer);
      newPeer.on('open', (id) => setPeerId(id));
      newPeer.on('error', () => setConnectionError("Errore connessione."));

      newPeer.on('connection', (connection) => {
        setConn(connection);
        setIsPeerHost(true); 
        connection.on('open', () => setConnected(true));
        connection.on('data', handlePeerData);
        connection.on('close', gestisciDisconnessioneAvversario);
      });
      return () => { try { if (conn) conn.close(); newPeer.destroy(); } catch (e) {} };
    }
  }, [mode, opponent, socket, navigate]);

  function handlePeerData(message) {
    if (!message || !message.type) return;
    if (message.type === 'move') {
      setGame((g) => {
          const copy = new Chess(g.fen());
          try { copy.move({ from: message.data.from, to: message.data.to, promotion: message.data.promotion }); } catch(e){} 
          return copy;
      });
      setLastMoveSquares([message.data.from, message.data.to]);
      setMoveLog((log) => [...log, message.data]);
    }
    else if (message.type === 'colorSelection') {
      setOpponentColor(message.color); 
      setMyColor(message.color === 'w' ? 'b' : 'w');
      setColorSelected(true);
    }
    else if (message.type === 'resign') terminaPartita('Tu (L\'avversario si è arreso)', 'win');
    else if (message.type === 'draw-request') setDrawRequestedByOpponent(true);
    else if (message.type === 'draw-accept') terminaPartita('Pareggio (Accordo)', 'draw');
    else if (message.type === 'draw-reject') alert("Avversario ha rifiutato la patta.");
  }

  function connectToOpponent() {
    if (!peer || !opponentId) return;
    const connection = peer.connect(opponentId);
    connection.on('open', () => { setConnected(true); setIsPeerHost(false); });
    connection.on('data', handlePeerData);
    connection.on('close', gestisciDisconnessioneAvversario);
    setConn(connection);
  }

  function selectColor(color) {
    setMyColor(color);
    setOpponentColor(color === 'w' ? 'b' : 'w');
    setColorSelected(true);
    if (mode === 'online') socket.emit('select-color', { to: opponent, color });
    else if (conn) conn.send({ type: 'colorSelection', color });
  }

  function formatTime(time) {
    return `${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}`;
  }

  const chiudiPartitaESci = () => {
    if (mode === 'online') socket.emit('leave-all-matches', user); 
    if (mode === 'friend' && conn) conn.close(); 
    navigate('/home');
  }

  const accettaPatta = () => {
      setDrawRequestedByOpponent(false);
      terminaPartita('Pareggio (Accordo)', 'draw');
      if (mode === 'online') socket.emit('draw-accept', { to: opponent });
      else if (conn) conn.send({ type: 'draw-accept' });
  }

  const rifiutaPatta = () => {
      setDrawRequestedByOpponent(false);
      if (mode === 'online') socket.emit('draw-reject', { to: opponent });
      else if (conn) conn.send({ type: 'draw-reject' });
  }

  const customStyles = {};
  lastMoveSquares.forEach(sq => { customStyles[sq] = { backgroundColor: 'rgba(255,255,0,0.45)' }; });
  legalMoves.forEach(sq => { customStyles[sq] = { backgroundColor: 'rgba(0,255,0,0.35)' }; });
  if (inCheckSquare) customStyles[inCheckSquare] = { backgroundColor: 'rgba(255, 0, 0, 0.45)' };
  if (selectedSquare) customStyles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };

  return (
    <div className="app">
      {mode === 'friend' && !connected && (
        <div className="peer-setup">
          <p style={{fontSize: '1.2rem', marginBottom: '20px'}}>Il tuo Peer ID: <strong style={{userSelect: 'all', color: 'var(--gold-primary)'}}>{peerId || 'Generazione in corso...'}</strong></p>
          <input type="text" placeholder="Inserisci ID Avversario" value={opponentId} onChange={e => setOpponentId(e.target.value)} />
          <div className="action-buttons-row">
            <button onClick={connectToOpponent}>Connetti</button>
            <button className="btn-sec" onClick={() => { if (peerId) navigator.clipboard.writeText(peerId); }}>Copia ID</button>
          </div>
          {connectionError && <p style={{ color: '#e74c3c', marginTop: '15px', fontWeight: 'bold' }}>{connectionError}</p>}
        </div>
      )}

      {connected && !colorSelected && !gameOver && (
        <div className="color-select">
          {(mode === 'friend' && isPeerHost) || (mode === 'online' && isHost) ? (
            <>
              <p style={{fontSize: '1.3rem', marginBottom: '20px'}}>{mode === 'online' ? `Partita trovata contro ${opponent}! Scegli il colore:` : 'Avversario connesso! Scegli il colore:'}</p>
              <div className="action-buttons-row">
                <button onClick={() => selectColor('w')}>Gioca Bianco</button>
                <button onClick={() => selectColor('b')}>Gioca Nero</button>
              </div>
            </>
          ) : (
            <p style={{fontSize: '1.3rem', color: 'var(--gold-primary)'}}>In attesa che l'avversario scelga il colore...</p>
          )}
        </div>
      )}

      {connected && (colorSelected || gameOver) && (
        <div className="main-container">
          
          <div className="left-column">
            
            {/* BARRA AVVERSARIO */}
            <div className={`player-bar ${game.turn() === opponentColor ? 'active-turn' : ''}`}>
              <div className="player-user">
                <img src="https://cdn-icons-png.flaticon.com/512/147/147144.png" alt="Avatar Avversario" className="player-avatar" />
                <span className="player-name">{mode === 'online' ? opponent : 'Avversario'}</span>
                <span className="player-piece-color" style={{ backgroundColor: opponentColor === 'w' ? '#f0f0f0' : '#222', color: opponentColor === 'w' ? '#000' : '#fff' }}>
                  {opponentColor === 'w' ? 'B' : 'N'}
                </span>
              </div>
              <div className="player-timer">{formatTime(opponentColor === 'w' ? whiteTime : blackTime)}</div>
            </div>

            {/* SCACCHIERA CON DISATTIVAZIONE POPUP NATIVO */}
            <div className="board-wrapper">
              <Chessboard
                position={game.fen()}
                onSquareClick={onSquareClick}
                onPieceDrop={(from, to) => attemptMove(from, to)}
                customSquareStyles={customStyles}
                boardOrientation={myColor === 'w' ? 'white' : 'black'}
                arePiecesDraggable={!gameOver && !promotionMove}
                onPromotionCheck={() => false} 
              />
            </div>

            {/* BARRA UTENTE */}
            <div className={`player-bar ${game.turn() === myColor ? 'active-turn' : ''}`}>
              <div className="player-user">
                <img src="https://cdn-icons-png.flaticon.com/512/147/147142.png" alt="Tuo Avatar" className="player-avatar" />
                <span className="player-name">{mode === 'online' ? user : 'Tu'}</span>
                <span className="player-piece-color" style={{ backgroundColor: myColor === 'w' ? '#f0f0f0' : '#222', color: myColor === 'w' ? '#000' : '#fff' }}>
                  {myColor === 'w' ? 'B' : 'N'}
                </span>
              </div>
              <div className="player-timer">{formatTime(myColor === 'w' ? whiteTime : blackTime)}</div>
            </div>

            {/* Pulsanti Azione in Game */}
            {!gameOver && !promotionMove && (
                <div className="game-actions">
                    <button className="btn-action btn-surrender" onClick={arrenditi}>Arrenditi</button>
                    <button className="btn-action btn-draw" onClick={chiediPatta}>Proponi Patta</button>
                </div>
            )}

            {drawRequestedByOpponent && !gameOver && (
                <div className="draw-popup">
                    <p>L'avversario propone patta.</p>
                    <button className="btn-success" onClick={accettaPatta}>Accetta</button>
                    <button className="btn-danger" onClick={rifiutaPatta}>Rifiuta</button>
                </div>
            )}

            {/* IL NOSTRO POPUP PROMOZIONE CUSTOM */}
            {promotionMove && (
              <div className="promotion-popup">
                <p>Scegli promozione:</p>
                <div className="promotion-buttons">
                  {['q', 'r', 'b', 'n'].map(p => (
                    <button key={p} onClick={() => promotePiece(p)}>
                      <img src={`/pieces/${pieceMap[game.turn()][p]}.png`} alt={p} style={{ width: 45 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gameOver && !promotionMove && (
              <div className="game-over">
                <p style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--gold-primary)', textTransform: 'uppercase' }}>Partita Terminata</p>
                <p style={{ fontSize: '1.2rem', margin: '15px 0' }}>Esito: <strong>{winner}</strong></p>
                <button onClick={chiudiPartitaESci}>Torna alla Dashboard</button>
              </div>
            )}

          </div>

          {/* COLONNA REGISTRO MOSSE */}
          <div className="right-column">
            <h2>Registro Mosse</h2>
            <div className="move-log">
              {moveLog.length === 0 && <p style={{color: '#666', textAlign: 'center', marginTop: '20px'}}>Nessuna mossa giocata.</p>}
              {moveLog.map((m, i) => (
                <div key={i} className="move">
                  <span style={{color: '#666', fontWeight: 'bold', width: '25px'}}>{i+1}.</span>
                  <img src={`/pieces/${pieceMap[m.color][m.piece]}.png`} alt={m.piece} />
                  <span>{m.from} → {m.to}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Game;