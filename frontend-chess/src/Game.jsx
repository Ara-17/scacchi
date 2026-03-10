import './Game.css'; 
import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
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
  
  // mode può essere 'online' (Socket) o 'friend' (PeerJS)
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

  // --- STATI CONDIVISI ---
  // In modalità online saltiamo le fasi di connessione manuale
  const [connected, setConnected] = useState(mode === 'online');
  const [colorSelected, setColorSelected] = useState(mode === 'online');
  const [myColor, setMyColor] = useState(mode === 'online' ? (isHost ? 'w' : 'b') : null);  
  const [opponentColor, setOpponentColor] = useState(mode === 'online' ? (isHost ? 'b' : 'w') : null);

  // --- STATI PEERJS (Solo per modalità amico) ---
  const [peer, setPeer] = useState(null);
  const [conn, setConn] = useState(null);
  const [peerId, setPeerId] = useState('');
  const [opponentId, setOpponentId] = useState('');
  const [connectionError, setConnectionError] = useState('');

  // ------------------- FUNZIONI GIOCO -------------------
  function safeGameMutate(modify) {
    setGame((g) => {
      const copy = new Chess(g.fen());
      modify(copy);
      return copy;
    });
  }

  function isPromotionMove(from, to) {
    const piece = game.get(from);
    if (!piece || piece.type !== 'p') return false;
    return (piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1');
  }

  function attemptMove(from, to, promotion = null) {
    const piece = game.get(from);
    if (!piece || piece.color !== myColor || game.turn() !== myColor) return;

    if (!promotion && isPromotionMove(from, to)) {
      setPromotionMove({ from, to });
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    const moveObj = { from, to };
    if (promotion) moveObj.promotion = promotion;

    const move = game.move(moveObj);
    if (!move) return; 

    setLastMoveSquares([from, to]);
    setSelectedSquare(null);
    setLegalMoves([]);
    setPromotionMove(null);

    const moveData = { piece: move.piece, color: move.color, from: move.from, to: move.to, promotion: move.promotion || null };
    setMoveLog((log) => [...log, moveData]);

    // INVIO MOSSA (Bivio tra Socket e PeerJS)
    if (mode === 'online') {
      socket.emit('send-move', { to: opponent, moveData });
    } else {
      if (conn && conn.open) conn.send({ type: 'move', data: moveData });
    }
  }

  function promotePiece(piece) {
    if (!promotionMove) return;
    attemptMove(promotionMove.from, promotionMove.to, piece);
  }

  function onSquareClick(square) {
    if (!colorSelected || gameOver || promotionMove) return;
    if (game.turn() !== myColor) return; 

    if (selectedSquare && legalMoves.includes(square)) {
      attemptMove(selectedSquare, square);
      return;
    }

    const piece = game.get(square);
    if (!piece || piece.color !== myColor) {
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    const moves = game.moves({ square, verbose: true }).filter(m => m.color === myColor);
    if (moves.length > 0) {
      setSelectedSquare(square);
      setLegalMoves(moves.map(m => m.to));
    } else {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  }

  useEffect(() => {
    if (game.game_over()) {
      setGameOver(true);
      if (game.in_checkmate()) setWinner(game.turn() === 'w' ? 'Nero (Scacco Matto)' : 'Bianco (Scacco Matto)');
      else setWinner('Pareggio');
    }
  }, [game.fen()]);

  useEffect(() => {
    if (game.in_check()) {
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
    } else {
      setInCheckSquare(null);
    }
  }, [game.fen()]);

  useEffect(() => {
    if (!colorSelected || gameOver) return;
    const timer = setInterval(() => {
      if (game.turn() === 'w') {
        setWhiteTime(t => { if (t <= 1) { setGameOver(true); setWinner('Nero (Vittoria per Tempo)'); clearInterval(timer); return 0; } return t - 1; });
      } else {
        setBlackTime(t => { if (t <= 1) { setGameOver(true); setWinner('Bianco (Vittoria per Tempo)'); clearInterval(timer); return 0; } return t - 1; });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [game.turn(), gameOver, colorSelected]);

  useEffect(() => {
    setSelectedSquare(null);
    setLegalMoves([]);
  }, [game.turn()]);

  // ------------------- SETUP CONNESSIONE (BIVIO) -------------------
  useEffect(() => {
    if (mode === 'online') {
      // 1. MODALITÀ ONLINE: Socket.io
      if (!opponent) { navigate('/home'); return; }

      const handleReceiveMove = (moveData) => {
        safeGameMutate((g) => {
          g.move({ from: moveData.from, to: moveData.to, promotion: moveData.promotion || undefined });
        });
        setLastMoveSquares([moveData.from, moveData.to]);
        setMoveLog((log) => [...log, moveData]);
      };

      socket.on('receive-move', handleReceiveMove);
      return () => { socket.off('receive-move', handleReceiveMove); };

    } else {
      // 2. MODALITÀ AMICO: Il tuo codice originale PeerJS
      const newPeer = new Peer();
      setPeer(newPeer);

      newPeer.on('open', (id) => { setPeerId(id); });

      newPeer.on('error', (err) => {
        if (err.type === 'peer-unavailable') setConnectionError("ID Avversario non trovato o disconnesso.");
        else setConnectionError("Errore di connessione.");
      });

      newPeer.on('connection', (connection) => {
        setConn(connection);
        setConnectionError('');
        connection.on('open', () => setConnected(true));
        connection.on('data', handlePeerData);
        connection.on('close', () => setConnected(false));
      });

      return () => { try { newPeer.destroy(); } catch (e) {} };
    }
  }, [mode, opponent, socket, navigate]);

  function handlePeerData(message) {
    if (!message || !message.type) return;
    if (message.type === 'move') {
      const moveData = message.data;
      safeGameMutate((g) => { g.move({ from: moveData.from, to: moveData.to, promotion: moveData.promotion || undefined }); });
      setLastMoveSquares([moveData.from, moveData.to]);
      setMoveLog((log) => [...log, moveData]);
    }
    else if (message.type === 'colorSelection') {
      setOpponentColor(message.color === 'w' ? 'b' : 'w');
      setMyColor(message.color === 'w' ? 'b' : 'w');
      setColorSelected(true);
    }
  }

  function connectToOpponent() {
    if (!peer || !opponentId) return;
    setConnectionError('');
    const connection = peer.connect(opponentId);
    connection.on('open', () => { setConnected(true); setConnectionError(''); });
    connection.on('data', handlePeerData);
    connection.on('close', () => setConnected(false));
    setConn(connection);
  }

  function selectColor(color) {
    if (!conn || !conn.open) return;
    setMyColor(color);
    setOpponentColor(color === 'w' ? 'b' : 'w');
    setColorSelected(true);
    conn.send({ type: 'colorSelection', color });
  }

  function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  const customStyles = {};
  lastMoveSquares.forEach(sq => { customStyles[sq] = { backgroundColor: 'rgba(255,255,0,0.45)' }; });
  legalMoves.forEach(sq => { customStyles[sq] = { backgroundColor: 'rgba(0,255,0,0.35)' }; });
  if (inCheckSquare) customStyles[inCheckSquare] = { backgroundColor: 'rgba(255, 0, 0, 0.45)' };

  // ------------------- RENDER -------------------
  return (
    <div className="app">

      {/* TUA INTERFACCIA PEERJS (Solo modalità amico) */}
      {mode === 'friend' && !connected && (
        <div className="peer-setup">
          <p>Il tuo Peer ID: <strong style={{userSelect: 'all'}}>{peerId || 'Generazione in corso...'}</strong></p>
          <input type="text" placeholder="Inserisci ID Avversario" value={opponentId} onChange={e => setOpponentId(e.target.value)} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={connectToOpponent}>Connetti</button>
            <button onClick={() => { if (peerId) navigator.clipboard?.writeText(peerId); }}>Copia il mio ID</button>
          </div>
          {connectionError && <p style={{ color: '#ff6b6b', marginTop: '15px' }}>{connectionError}</p>}
        </div>
      )}

      {/* SCELTA COLORE (Solo modalità amico) */}
      {mode === 'friend' && connected && !colorSelected && (
        <div className="color-select">
          <p>Scegli il tuo colore:</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => selectColor('w')}>Bianco</button>
            <button onClick={() => selectColor('b')}>Nero</button>
          </div>
        </div>
      )}

      {/* SCACCHIERA (Entrambe le modalità) */}
      {connected && colorSelected && (
        <>
          <div className="main-container">
            <div className="left-column">
              <h3 style={{ marginBottom: '15px' }}>
                {mode === 'online' ? `Partita Socket.io vs ${opponent}` : 'Partita Amichevole PeerJS'}
              </h3>

              <div className="turn-info">
                <div className={`timer ${game.turn() === 'w' ? 'active' : ''}`}>Bianco: {formatTime(whiteTime)}</div>
                <div className={`timer ${game.turn() === 'b' ? 'active' : ''}`}>Nero: {formatTime(blackTime)}</div>
              </div>

              <Chessboard
                position={game.fen()}
                onSquareClick={onSquareClick}
                onPieceDrop={(from, to) => {
                  const piece = game.get(from);
                  if (!piece || piece.color !== myColor) return false;
                  attemptMove(from, to);
                  return true;
                }}
                customSquareStyles={customStyles}
                boardWidth={700}
                boardOrientation={myColor === 'w' ? 'white' : 'black'}
                arePiecesDraggable={!gameOver && !promotionMove && game.turn() === myColor}
              />

              {promotionMove && (
                <div className="promotion-popup">
                  <p>Scegli promozione:</p>
                  <div className="promotion-buttons" style={{ display: 'flex', gap: 8 }}>
                    {['q', 'r', 'b', 'n'].map(p => (
                      <button key={p} onClick={() => promotePiece(p)}>
                        <img src={`/pieces/${pieceMap[game.turn()][p]}.png`} alt={p} style={{ width: 36 }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {gameOver && !promotionMove && (
                <div className="game-over">
                  <p style={{ fontSize: 24, fontWeight: 'bold' }}>Partita Terminata</p>
                  <p>Vincitore: <strong>{winner}</strong></p>
                  <button onClick={() => navigate('/home')}>Torna alla Dashboard</button>
                </div>
              )}
            </div>

            <div className="right-column">
              <h2>Registro Mosse</h2>
              <div className="move-log">
                {moveLog.map((m, i) => (
                  <div key={i} className="move">
                    <img src={`/pieces/${pieceMap[m.color][m.piece]}.png`} alt={m.piece} />
                    <span>{m.from} → {m.to}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Game;