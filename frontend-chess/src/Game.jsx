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

  // PEER JS
  const [peer, setPeer] = useState(null);
  const [conn, setConn] = useState(null);
  const [peerId, setPeerId] = useState('');
  const [opponentId, setOpponentId] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [isPeerHost, setIsPeerHost] = useState(false); 

  const checkGameOver = () => typeof game.isGameOver === 'function' ? game.isGameOver() : game.game_over();
  const checkCheckmate = () => typeof game.isCheckmate === 'function' ? game.isCheckmate() : game.in_checkmate();
  const checkCheck = () => typeof game.isCheck === 'function' ? game.isCheck() : game.in_check();

  // LA FUNZIONE BLINDATA: Applica fisicamente la mossa
  function executeMove(moveObj) {
    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move(moveObj);
      if (move) {
         setGame(gameCopy);
         return move;
      }
    } catch(e) {}
    return null;
  }

  function onPieceDrop(sourceSquare, targetSquare) {
    if (gameOver || promotionMove || game.turn() !== myColor) return false;

    // Controlla se è una mossa di promozione
    const piece = game.get(sourceSquare);
    const isPromotion = piece && piece.type === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1');

    if (isPromotion) {
       setPromotionMove({ from: sourceSquare, to: targetSquare });
       return false; // Ferma il pezzo, aspetta il popup
    }

    // Mossa classica
    const move = executeMove({ from: sourceSquare, to: targetSquare });
    if (!move) return false; // Mossa illegale

    // Aggiornamenti UI e Invio
    setLastMoveSquares([sourceSquare, targetSquare]);
    setMoveLog(prev => [...prev, move]);
    setSelectedSquare(null);
    setLegalMoves([]);

    const moveData = { from: sourceSquare, to: targetSquare, promotion: null, piece: move.piece, color: move.color };
    if (mode === 'online') socket.emit('send-move', { to: opponent, moveData });
    else if (conn && conn.open) conn.send({ type: 'move', data: moveData });

    return true; 
  }

  function promotePiece(promPiece) {
    if (!promotionMove) return;
    const { from, to } = promotionMove;

    const move = executeMove({ from, to, promotion: promPiece });
    if (move) {
      setPromotionMove(null);
      setLastMoveSquares([from, to]);
      setMoveLog((prev) => [...prev, move]);

      const moveData = { from, to, promotion: promPiece, piece: move.piece, color: myColor };
      if (mode === 'online') socket.emit('send-move', { to: opponent, moveData });
      else if (conn && conn.open) conn.send({ type: 'move', data: moveData });
    }
  }

  function onSquareClick(square) {
    if (gameOver || promotionMove || game.turn() !== myColor) {
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    if (selectedSquare && legalMoves.includes(square)) {
      onPieceDrop(selectedSquare, square);
      return;
    }

    const pieceObj = game.get(square);
    if (pieceObj && pieceObj.color === myColor) {
      setSelectedSquare(square);
      try {
        const moves = game.moves({ square, verbose: true });
        setLegalMoves(moves.map(m => m.to));
      } catch(e) {
        setLegalMoves([]);
      }
    } else {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  }

  const gestisciDisconnessioneAvversario = () => {
    setGameOver(true);
    setWinner(`Tu (Vittoria a tavolino, l'avversario ha abbandonato)`);
  };

  // CONTROLLO DISCONNESSIONI (Chiusura scheda/tasto indietro)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (mode === 'online' && !gameOver) socket.emit('end-match', user);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Quando il componente smonta (es: torna alla home)
      if (mode === 'online' && !gameOver) socket.emit('end-match', user);
    };
  }, [mode, gameOver, socket, user]);

  useEffect(() => {
    if (checkGameOver() && !gameOver) {
      setGameOver(true);
      if (checkCheckmate()) setWinner(game.turn() === 'w' ? 'Nero (Scacco Matto)' : 'Bianco (Scacco Matto)');
      else setWinner('Pareggio');
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

  // SOCKET & CONNESSIONE
  useEffect(() => {
    if (mode === 'online') {
      if (!opponent) { navigate('/home'); return; }

      const handleReceiveMove = (moveData) => {
        setGame((currentGameState) => {
          const copy = new Chess(currentGameState.fen());
          try { 
            const moveObj = { from: moveData.from, to: moveData.to };
            if (moveData.promotion) moveObj.promotion = moveData.promotion;
            copy.move(moveObj); 
          } catch(e) {
            return currentGameState;
          }
          return copy;
        });
        setLastMoveSquares([moveData.from, moveData.to]);
        setMoveLog((prev) => [...prev, moveData]);
      };

      const handleColorSelected = (hostColor) => {
        setOpponentColor(hostColor);
        setMyColor(hostColor === 'w' ? 'b' : 'w');
        setColorSelected(true);
      };

      socket.on('receive-move', handleReceiveMove);
      socket.on('color-selected', handleColorSelected);
      socket.on('opponent-disconnected', gestisciDisconnessioneAvversario); 
      
      return () => { 
        socket.off('receive-move', handleReceiveMove); 
        socket.off('color-selected', handleColorSelected);
        socket.off('opponent-disconnected', gestisciDisconnessioneAvversario);
      };

    } else {
      const newPeer = new Peer();
      setPeer(newPeer);

      newPeer.on('open', (id) => { setPeerId(id); });

      newPeer.on('error', (err) => {
        if (err.type === 'peer-unavailable') setConnectionError("ID Avversario non trovato o disconnesso.");
        else setConnectionError("Errore di connessione.");
      });

      newPeer.on('connection', (connection) => {
        setConn(connection);
        setIsPeerHost(true); 
        setConnectionError('');
        connection.on('open', () => setConnected(true));
        connection.on('data', handlePeerData);
        connection.on('close', gestisciDisconnessioneAvversario); 
      });

      return () => { try { newPeer.destroy(); } catch (e) {} };
    }
  }, [mode, opponent, socket, navigate]);

  function handlePeerData(message) {
    if (!message || !message.type) return;
    if (message.type === 'move') {
      const moveData = message.data;
      setGame((currentGameState) => {
        const copy = new Chess(currentGameState.fen());
        try { 
          const moveObj = { from: moveData.from, to: moveData.to };
          if (moveData.promotion) moveObj.promotion = moveData.promotion;
          copy.move(moveObj); 
        } catch(e) {
          return currentGameState;
        } 
        return copy;
      });
      setLastMoveSquares([moveData.from, moveData.to]);
      setMoveLog((prev) => [...prev, moveData]);
    }
    else if (message.type === 'colorSelection') {
      setOpponentColor(message.color);
      setMyColor(message.color === 'w' ? 'b' : 'w');
      setColorSelected(true);
    }
  }

  function connectToOpponent() {
    if (!peer || !opponentId) return;
    setConnectionError('');
    const connection = peer.connect(opponentId);
    setIsPeerHost(false); 
    connection.on('open', () => { setConnected(true); setConnectionError(''); });
    connection.on('data', handlePeerData);
    connection.on('close', gestisciDisconnessioneAvversario); 
    setConn(connection);
  }

  function selectColor(color) {
    setMyColor(color);
    setOpponentColor(color === 'w' ? 'b' : 'w');
    setColorSelected(true);

    if (mode === 'online') socket.emit('select-color', { to: opponent, color: color });
    else if (conn && conn.open) conn.send({ type: 'colorSelection', color });
  }

  function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  const chiudiPartitaESci = () => {
    if (mode === 'online') socket.emit('end-match', user); 
    navigate('/home');
  }

  const customStyles = {};
  if (lastMoveSquares.length) lastMoveSquares.forEach(sq => { customStyles[sq] = { backgroundColor: 'rgba(255,255,0,0.45)' }; });
  if (legalMoves.length) legalMoves.forEach(sq => { customStyles[sq] = { backgroundColor: 'rgba(0,255,0,0.35)' }; });
  if (inCheckSquare) customStyles[inCheckSquare] = { backgroundColor: 'rgba(255, 0, 0, 0.45)' };
  if (selectedSquare) customStyles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };

  return (
    <div className="app">
      {mode === 'friend' && !connected && (
        <div className="peer-setup" style={{color:'white', textAlign:'center', marginTop:'50px'}}>
          <h2>Modalità PeerJS</h2>
          <p>Il tuo Peer ID: <strong style={{userSelect: 'all'}}>{peerId || 'Generazione in corso...'}</strong></p>
          <input type="text" placeholder="Inserisci ID Avversario" value={opponentId} onChange={e => setOpponentId(e.target.value)} style={{padding: '10px', margin:'10px'}} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={connectToOpponent} style={{padding: '10px'}}>Connetti</button>
            <button onClick={() => { if (peerId) navigator.clipboard?.writeText(peerId); }} style={{padding: '10px'}}>Copia il mio ID</button>
          </div>
          {connectionError && <p style={{ color: '#ff6b6b', marginTop: '15px' }}>{connectionError}</p>}
        </div>
      )}

      {connected && !colorSelected && !gameOver && (
        <div className="color-select" style={{color:'white', textAlign:'center', marginTop:'50px'}}>
          {(mode === 'friend' && isPeerHost) || (mode === 'online' && isHost) ? (
            <>
              <p>{mode === 'online' ? `Partita trovata! Scegli il tuo colore (sfidi ${opponent}):` : 'Avversario connesso! Scegli il tuo colore:'}</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => selectColor('w')} style={{padding: '10px'}}>Bianco</button>
                <button onClick={() => selectColor('b')} style={{padding: '10px'}}>Nero</button>
              </div>
            </>
          ) : (
            <p style={{fontSize: '20px'}}>In attesa che <strong>{mode === 'online' ? opponent : 'l\'avversario'}</strong> scelga il colore...</p>
          )}
        </div>
      )}

      {connected && (colorSelected || gameOver) && (
        <>
          <div className="main-container">
            <div className="left-column">
              <h3 style={{ marginBottom: '15px', color:'white' }}>
                {mode === 'online' ? `${user} vs ${opponent}` : 'Tu vs Avversario (PeerJS)'}
              </h3>

              <div className="turn-info">
                <div className={`timer ${game.turn() === 'w' ? 'active' : ''}`}>Bianco: {formatTime(whiteTime)}</div>
                <div className={`timer ${game.turn() === 'b' ? 'active' : ''}`}>Nero: {formatTime(blackTime)}</div>
              </div>

              <Chessboard
                position={game.fen()}
                onSquareClick={onSquareClick}
                onPieceDrop={onPieceDrop}
                customSquareStyles={customStyles}
                boardWidth={600}
                boardOrientation={myColor === 'w' ? 'white' : 'black'}
                arePiecesDraggable={!gameOver && !promotionMove && game.turn() === myColor}
              />

              {promotionMove && (
                <div className="promotion-popup" style={{background:'white', padding:'10px', borderRadius:'8px', marginTop:'10px'}}>
                  <p style={{color:'black'}}>Scegli promozione:</p>
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
                <div className="game-over" style={{background:'rgba(0,0,0,0.8)', padding:'20px', borderRadius:'10px', color:'white', marginTop:'15px'}}>
                  <p style={{ fontSize: 24, fontWeight: 'bold' }}>Partita Terminata</p>
                  <p>Vincitore: <strong>{winner}</strong></p>
                  <button onClick={chiudiPartitaESci} style={{marginTop:'10px', padding:'10px'}}>Torna alla Dashboard</button>
                </div>
              )}
            </div>

            <div className="right-column">
              <h2 style={{color:'white'}}>Registro Mosse</h2>
              <div className="move-log" style={{color:'white'}}>
                {moveLog.map((m, i) => (
                  <div key={i} className="move">
                    <img src={`/pieces/${pieceMap[m.color][m.piece]}.png`} alt={m.piece} style={{width: 20}} />
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