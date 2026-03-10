import './Game.css'; 
import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import Peer from 'peerjs';

const pezzoImmagine = {
  w: { q: 'W_queen', r: 'W_rook', b: 'W_bishop', n: 'W_knight' },
  b: { q: 'B_queen', r: 'B_rook', b: 'B_bishop', n: 'B_knight' }
};

function Game({ user, socket }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, opponent, isHost } = location.state || { mode: 'friend' };

  // Stati del Gioco
  const [game, setGame] = useState(new Chess());
  const [myColor, setMyColor] = useState(null);
  const [colorSelected, setColorSelected] = useState(false);
  const [connected, setConnected] = useState(mode === 'online');
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [promotionMove, setPromotionMove] = useState(null);
  
  // Stati di PeerJS (SOLO per la modalità amici)
  const [peerId, setPeerId] = useState('');
  const [opponentIdInput, setOpponentIdInput] = useState('');
  const [isPeerHost, setIsPeerHost] = useState(false);
  const [peerError, setPeerError] = useState('');

  // Refs per BLINDARE la connessione PeerJS dai re-render di React
  const peerRef = useRef(null);
  const connRef = useRef(null);

  // ----------------------------------------------------
  // INIZIALIZZAZIONE CONNESSIONE (PEERJS O SOCKET)
  // ----------------------------------------------------
  useEffect(() => {
    if (mode === 'friend') {
      // 1. MODALITÀ AMICI: Inizializza PeerJS da zero in modo sicuro
      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', (id) => {
        setPeerId(id);
      });

      // Se l'avversario si connette a NOI (quindi noi siamo l'HOST)
      peer.on('connection', (conn) => {
        connRef.current = conn;
        setIsPeerHost(true);
        impostaEventiPeerJS(conn);
      });

      peer.on('error', (err) => {
        setPeerError("Errore di connessione: verifica il codice.");
      });

      return () => peer.destroy(); // Pulizia sicura in uscita

    } else {
      // 2. MODALITÀ ONLINE: Socket.io
      if (!opponent) { navigate('/home'); return; }
      
      const gestisciMossaRicevuta = (moveObj) => {
        setGame((g) => {
          const copia = new Chess(g.fen());
          try { copia.move(moveObj); } catch(e) {}
          return copia;
        });
      };

      const gestisciColore = (color) => {
        setMyColor(color === 'w' ? 'b' : 'w');
        setColorSelected(true);
      };

      const gestisciDisconnessione = () => {
        setGameOver(true);
        setWinner("L'avversario ha abbandonato. Hai vinto a tavolino!");
      };

      socket.on('receive-move', gestisciMossaRicevuta);
      socket.on('color-selected', gestisciColore);
      socket.on('opponent-disconnected', gestisciDisconnessione);

      return () => {
        socket.off('receive-move', gestisciMossaRicevuta);
        socket.off('color-selected', gestisciColore);
        socket.off('opponent-disconnected', gestisciDisconnessione);
      };
    }
  }, [mode, opponent, socket, navigate]);

  // Gestione eventi una volta che PeerJS è agganciato
  function impostaEventiPeerJS(conn) {
    conn.on('open', () => {
      setConnected(true);
      setPeerError('');
    });
    
    conn.on('data', (messaggio) => {
      if (messaggio.type === 'colorSelection') {
        // L'avversario ha scelto il colore, noi prendiamo l'opposto
        setMyColor(messaggio.color === 'w' ? 'b' : 'w');
        setColorSelected(true);
      } else if (messaggio.type === 'move') {
        // Applica la mossa dell'avversario
        setGame((g) => {
          const copia = new Chess(g.fen());
          try { copia.move(messaggio.move); } catch(e) {}
          return copia;
        });
      }
    });

    conn.on('close', () => {
      setGameOver(true);
      setWinner("Avversario disconnesso.");
    });
  }

  // Se noi inseriamo il codice dell'avversario (Siamo il CLIENT)
  function connettiAdAmico() {
    if (!opponentIdInput || !peerRef.current) return;
    const conn = peerRef.current.connect(opponentIdInput);
    connRef.current = conn;
    setIsPeerHost(false);
    impostaEventiPeerJS(conn);
  }

  // ----------------------------------------------------
  // LOGICA DEL GIOCO (MOSSE, COLORI, PROMOZIONI)
  // ----------------------------------------------------
  function selectColor(color) {
    setMyColor(color);
    setColorSelected(true);
    
    // Avvisa l'avversario della scelta
    if (mode === 'online') {
      socket.emit('select-color', { to: opponent, color: color });
    } else if (connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'colorSelection', color: color });
    }
  }

  function onPieceDrop(sourceSquare, targetSquare) {
    // 1. Controlla se puoi muovere
    if (gameOver || promotionMove || !myColor || game.turn() !== myColor) return false;

    // 2. Controlla se stai muovendo un TUO pezzo
    const pezzoToccato = game.get(sourceSquare);
    if (!pezzoToccato || pezzoToccato.color !== myColor) return false;

    // 3. È una mossa di Promozione del pedone?
    if (pezzoToccato.type === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1')) {
      const gCopia = new Chess(game.fen());
      try {
        // Test: verifichiamo che la promozione non sia illegale (es: pedone bloccato)
        const checkLegale = gCopia.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (!checkLegale) return false;
      } catch(e) { return false; }

      // Mossa legale, apri popup promozione e blocca la scacchiera per un attimo
      setPromotionMove({ from: sourceSquare, to: targetSquare });
      return false; 
    }

    // 4. Mossa Classica (No promozione)
    const gCopia = new Chess(game.fen());
    let mossa = null;
    try {
      mossa = gCopia.move({ from: sourceSquare, to: targetSquare });
    } catch(e) { return false; } // Se illegale, il pezzo torna al suo posto!

    // Se la mossa va a buon fine, salvala, inviala e controlla vittoria
    if (mossa) {
      setGame(gCopia);
      inviaMossaInRete({ from: sourceSquare, to: targetSquare });
      controllaFinePartita(gCopia);
      return true;
    }
    return false;
  }

  function eseguiPromozione(pezzoScelto) {
    if (!promotionMove) return;
    const gCopia = new Chess(game.fen());
    let mossa = null;
    try {
      mossa = gCopia.move({ from: promotionMove.from, to: promotionMove.to, promotion: pezzoScelto });
    } catch(e) {}

    if (mossa) {
      setGame(gCopia);
      inviaMossaInRete({ from: promotionMove.from, to: promotionMove.to, promotion: pezzoScelto });
      controllaFinePartita(gCopia);
    }
    setPromotionMove(null); // Chiudi popup
  }

  function inviaMossaInRete(oggettoMossa) {
    if (mode === 'online') {
      socket.emit('send-move', { to: opponent, moveData: oggettoMossa });
    } else if (connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'move', move: oggettoMossa });
    }
  }

  function controllaFinePartita(g) {
    const isOver = typeof g.isGameOver === 'function' ? g.isGameOver() : g.game_over();
    if (isOver) {
      setGameOver(true);
      const isCheckmate = typeof g.isCheckmate === 'function' ? g.isCheckmate() : g.in_checkmate();
      if (isCheckmate) {
        setWinner(`Scacco Matto! Vince il ${g.turn() === 'w' ? 'Nero' : 'Bianco'}`);
      } else {
        setWinner('Pareggio!');
      }
    }
  }

  function abbandonaPartita() {
    if (mode === 'online') {
      socket.emit('leave-all-matches', user);
    } else if (connRef.current) {
      connRef.current.close();
    }
    navigate('/home');
  }

  // ----------------------------------------------------
  // INTERFACCIA GRAFICA (NESSUNA MODIFICA ALLO STILE)
  // ----------------------------------------------------
  return (
    <div className="app">
      {/* PEER JS: SETUP MANUALE SE MODALITA' AMICI */}
      {mode === 'friend' && !connected && (
        <div className="peer-setup" style={{background: 'rgba(20,20,30,0.95)', padding: '30px', borderRadius: '15px', color:'white', textAlign:'center', marginTop:'50px'}}>
          <h2 style={{marginBottom: '20px'}}>Sfida un Amico (Codice PeerJS)</h2>
          <p style={{fontSize: '18px'}}>Il tuo codice di gioco: <strong style={{userSelect:'all', color:'#ff956f', fontSize:'22px'}}>{peerId || 'Generazione in corso...'}</strong></p>
          <div style={{marginTop: '30px', display:'flex', gap:'15px', justifyContent:'center'}}>
             <input 
               type="text" 
               placeholder="Incolla qui il codice del tuo amico" 
               value={opponentIdInput} 
               onChange={e => setOpponentIdInput(e.target.value)} 
               style={{padding:'12px', width:'250px', borderRadius:'8px', border:'none', outline:'none', fontSize:'16px'}} 
             />
             <button onClick={connettiAdAmico} style={{padding:'12px 25px', background:'#ff956f', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', color:'white', fontSize:'16px'}}>Connettiti</button>
          </div>
          {peerError && <p style={{color:'#ff6b6b', marginTop:'20px', fontWeight:'bold'}}>{peerError}</p>}
        </div>
      )}

      {/* SCHERMATA SCELTA COLORE */}
      {connected && !colorSelected && !gameOver && (
        <div className="color-select" style={{background: 'rgba(20,20,30,0.95)', padding: '40px', borderRadius: '15px', color:'white', textAlign:'center', marginTop:'50px'}}>
          {/* L'host (chi crea la lobby in Socket o chi MANDA/RICEVE in base a chi sei) sceglie il colore */}
          { (mode === 'friend' && isPeerHost) || (mode === 'online' && isHost) ? (
            <>
              <h2 style={{fontSize: '28px', margin:'0 0 20px 0'}}>Partita Pronta!</h2>
              <p style={{fontSize: '18px'}}>Scegli con quale colore vuoi giocare:</p>
              <div style={{display:'flex', gap:'20px', justifyContent:'center', marginTop:'30px'}}>
                <button onClick={() => selectColor('w')} style={{padding:'15px 30px', fontSize:'18px', borderRadius:'8px', border:'none', cursor:'pointer', background:'white', color:'black', fontWeight:'bold'}}>Bianco ⚪</button>
                <button onClick={() => selectColor('b')} style={{padding:'15px 30px', fontSize:'18px', borderRadius:'8px', background:'#222', color:'white', border:'2px solid white', cursor:'pointer', fontWeight:'bold'}}>Nero ⚫</button>
              </div>
            </>
          ) : (
            <h2 style={{fontSize: '24px', margin:0}}>In attesa che l'avversario scelga il colore...</h2>
          )}
        </div>
      )}

      {/* IL GIOCO VERO E PROPRIO */}
      {connected && colorSelected && (
        <div className="main-container">
           <div className="left-column" style={{textAlign:'center', width:'100%', maxWidth:'650px', margin:'0 auto'}}>
              
              {/* NOMI E INFO TURNO */}
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px', color:'white', background:'rgba(0,0,0,0.6)', padding:'10px 20px', borderRadius:'10px'}}>
                 <h2 style={{margin:0, fontSize:'20px'}}>Tu sei: <span style={{color: myColor === 'w' ? '#ddd' : '#666'}}>{myColor === 'w' ? 'Bianco ⚪' : 'Nero ⚫'}</span></h2>
                 <h3 style={{margin:0, fontSize:'18px', padding:'5px 15px', background: game.turn() === myColor ? 'rgba(0,255,0,0.2)' : 'rgba(255,0,0,0.2)', borderRadius:'8px'}}>
                    Turno del: {game.turn() === 'w' ? 'Bianco' : 'Nero'}
                 </h3>
              </div>

              {/* LA SCACCHIERA */}
              <div style={{background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '15px', display: 'inline-block', boxShadow:'0px 10px 30px rgba(0,0,0,0.8)'}}>
                <Chessboard 
                  position={game.fen()} 
                  onPieceDrop={onPieceDrop}
                  boardOrientation={myColor === 'w' ? 'white' : 'black'}
                  arePiecesDraggable={!gameOver && !promotionMove && game.turn() === myColor}
                  boardWidth={600}
                />
              </div>

              {/* POPUP PROMOZIONE PEDONE */}
              {promotionMove && (
                <div style={{background:'rgba(255,255,255,0.95)', padding:'20px', borderRadius:'12px', marginTop:'20px', boxShadow:'0px 10px 20px rgba(0,0,0,0.5)'}}>
                  <h3 style={{margin:0, color:'#111'}}>Promuovi il pedone:</h3>
                  <div style={{display:'flex', gap:'15px', justifyContent:'center', marginTop:'15px'}}>
                    {['q','r','b','n'].map(p => (
                      <button key={p} onClick={() => eseguiPromozione(p)} style={{background:'transparent', border:'2px solid #ddd', borderRadius:'10px', padding:'10px', cursor:'pointer', transition:'0.2s'}}>
                        <img src={`/pieces/${pezzoImmagine[myColor][p]}.png`} alt={p} style={{ width: 45 }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* FINE PARTITA E ABBANDONO */}
              {gameOver && (
                <div style={{background:'rgba(255,0,0,0.8)', color:'white', padding:'20px', borderRadius:'12px', marginTop:'20px', boxShadow:'0px 5px 15px rgba(0,0,0,0.5)'}}>
                   <h2 style={{margin: '0 0 15px 0'}}>{winner}</h2>
                   <button onClick={abbandonaPartita} style={{padding:'12px 25px', borderRadius:'8px', border:'none', background:'white', color:'red', fontWeight:'bold', cursor:'pointer', fontSize:'16px'}}>Torna alla Dashboard</button>
                </div>
              )}

              {!gameOver && (
                <button onClick={abbandonaPartita} style={{padding:'10px 20px', marginTop:'20px', background:'transparent', border:'2px solid rgba(255,255,255,0.5)', color:'white', borderRadius:'8px', cursor:'pointer'}}>Abbandona Partita</button>
              )}
           </div>
        </div>
      )}
    </div>
  );
}

export default Game;