import './Game.css'
import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import Peer from 'peerjs'

// associo i codici standard dei pezzi degli scacchi ai nomi delle mie immagini personalizzate
const pieceMap = {
  w: { p: 'W_pawn', r: 'W_rook', n: 'W_knight', b: 'W_bishop', q: 'W_queen', k: 'W_king' },
  b: { p: 'B_pawn', r: 'B_rook', n: 'B_knight', b: 'B_bishop', q: 'B_queen', k: 'B_king' }
}

function Game({ user, socket }) {
  const location = useLocation()
  const navigate = useNavigate()
  
  // recupero i dati passati dalla schermata precedente per sapere la modalita e l avversario
  const { mode, opponent, isHost } = location.state || { mode: 'friend' }

  // inizializzo l oggetto scacchiera usando la libreria chess.js
  const [game, setGame] = useState(new Chess())
  
  // stati per gestire la fine della partita e il testo del vincitore
  const [gameOver, setGameOver] = useState(false)
  const [winner, setWinner] = useState(null)
  
  // stati per la gestione dei click sulle caselle e le mosse consentite
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [legalMoves, setLegalMoves] = useState([])
  const [promotionMove, setPromotionMove] = useState(null)
  const [lastMoveSquares, setLastMoveSquares] = useState([])
  
  // imposto i timer a 300 secondi (5 minuti) per giocatore
  const [whiteTime, setWhiteTime] = useState(300) 
  const [blackTime, setBlackTime] = useState(300) 
  
  // storico delle mosse e indicatore della casella del re sotto scacco
  const [moveLog, setMoveLog] = useState([])
  const [inCheckSquare, setInCheckSquare] = useState(null)

  // stati per la connessione e l assegnazione dei colori
  const [connected, setConnected] = useState(mode === 'online')
  const [colorSelected, setColorSelected] = useState(false)
  const [myColor, setMyColor] = useState(null)  
  const [opponentColor, setOpponentColor] = useState(null)
  
  // stato per gestire la richiesta di patta ricevuta dall avversario
  const [drawRequestedByOpponent, setDrawRequestedByOpponent] = useState(false)

  // uso useRef per avere sempre i valori aggiornati dentro i listener e i timer
  const gameRef = useRef(game)
  const myColorRef = useRef(myColor)
  const isHostRef = useRef(isHost)
  const gameOverRef = useRef(gameOver)

  // aggiorno le reference ogni volta che cambia lo stato corrispondente
  useEffect(() => { gameRef.current = game }, [game])
  useEffect(() => { myColorRef.current = myColor }, [myColor])
  useEffect(() => { isHostRef.current = isHost }, [isHost])
  useEffect(() => { gameOverRef.current = gameOver }, [gameOver])

  // stati dedicati alla connessione peer to peer per la modalita amico
  const [peer, setPeer] = useState(null)
  const [conn, setConn] = useState(null)
  const [peerId, setPeerId] = useState('')
  const [opponentId, setOpponentId] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [isPeerHost, setIsPeerHost] = useState(false) 

  // richiamo i metodi di chess.js per controllare lo stato della partita
  const checkGameOver = () => typeof game.isGameOver === 'function' ? game.isGameOver() : game.game_over()
  const checkCheckmate = () => typeof game.isCheckmate === 'function' ? game.isCheckmate() : game.in_checkmate()
  const checkCheck = () => typeof game.isCheck === 'function' ? game.isCheck() : game.in_check()

  // invio i dati al backend per salvare il risultato nel database
  const salvaPartitaDB = (esitoBianco) => {
    // faccio fare il salvataggio solo a chi ha creato la stanza per non avere dati doppi
    if (mode === 'online' && isHostRef.current) {
        const bianco = myColorRef.current === 'w' ? user : opponent
        const nero = myColorRef.current === 'b' ? user : opponent
        
        fetch('http://localhost:3001/api/save-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bianco, nero, risultatoBianco: esitoBianco })
        }).catch(err => console.error(err))
    }
  }

  // imposto le variabili di fine partita e chiamo il salvataggio
  const terminaPartita = (messaggio, esitoHost) => {
      // evito che la funzione venga chiamata piu volte se la partita e gia chiusa
      if(gameOverRef.current) return
      setGameOver(true)
      setWinner(messaggio)
      salvaPartitaDB(esitoHost)
  }

  // verifico se il pedone ha raggiunto l ultima casella per la promozione
  function isPromotionMove(from, to) {
    const piece = gameRef.current.get(from)
    if (!piece || piece.type !== 'p') return false
    return (piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1')
  }

  // gestisco la logica per eseguire una mossa sulla scacchiera
  function attemptMove(from, to, promotion = null) {
    const currentGame = gameRef.current
    const currentMyColor = myColorRef.current

    // impedisco le mosse se la partita e finita o se tocca all avversario
    if (gameOverRef.current || currentGame.turn() !== currentMyColor) return false

    // verifico che il pezzo selezionato appartenga al giocatore corrente
    const piece = currentGame.get(from)
    if (!piece || piece.color !== currentMyColor) return false

    // se la mossa e' una promozione blocco l esecuzione e apro il menu di scelta pezzo
    if (!promotion && isPromotionMove(from, to)) {
      const testGame = new Chess(currentGame.fen())
      try {
        const testMove = testGame.move({ from, to, promotion: 'q' })
        if (!testMove) return false
      } catch (e) { return false }
      
      setPromotionMove({ from, to })
      setSelectedSquare(null)
      setLegalMoves([])
      return false 
    }

    // preparo l oggetto della mossa includendo la promozione se e presente
    const moveObj = { from, to }
    if (promotion) moveObj.promotion = promotion

    let moveData = null
    const gameCopy = new Chess(currentGame.fen())
    
    // applico la mossa su una copia della scacchiera per vedere se e valida
    try {
      const move = gameCopy.move(moveObj)
      if (move) {
        moveData = { piece: move.piece, color: move.color, from: move.from, to: move.to, promotion: move.promotion || null }
        setGame(gameCopy)
      } else return false
    } catch (e) { return false }

    // aggiorno lo stato dell interfaccia pulendo le selezioni e aggiungendo la mossa al registro
    setLastMoveSquares([from, to])
    setSelectedSquare(null)
    setLegalMoves([])
    setPromotionMove(null)
    setMoveLog((log) => [...log, moveData])

    // trasmetto la mossa all avversario tramite websocket o connessione peer
    if (mode === 'online') socket.emit('send-move', { to: opponent, moveData })
    else if (conn && conn.open) conn.send({ type: 'move', data: moveData })

    return true 
  }

  // completa la mossa di promozione usando il pezzo scelto dall utente nel menu
  function promotePiece(piece) {
    if (!promotionMove) return
    attemptMove(promotionMove.from, promotionMove.to, piece)
  }

  // gestisco le interazioni del mouse sulle singole caselle
  function onSquareClick(square) {
    const currentGame = gameRef.current
    const currentMyColor = myColorRef.current

    // ignoro i click se i colori non sono decisi o se ce un popup attivo
    if (!colorSelected || gameOver || promotionMove) return
    if (currentGame.turn() !== currentMyColor) return

    // se l utente aveva gia selezionato un pezzo e clicca su una destinazione valida tento la mossa
    if (selectedSquare && legalMoves.includes(square)) {
      attemptMove(selectedSquare, square)
      return
    }

    // controllo se la casella cliccata contiene un pezzo del giocatore
    const piece = currentGame.get(square)
    if (!piece || piece.color !== currentMyColor) {
      setSelectedSquare(null)
      setLegalMoves([])
      return
    }

    // trovo tutte le mosse possibili per il pezzo selezionato e le salvo per colorare le caselle
    try {
      const moves = currentGame.moves({ square, verbose: true }).filter(m => m.color === currentMyColor)
      if (moves.length > 0) {
        setSelectedSquare(square)
        setLegalMoves(moves.map(m => m.to))
      } else {
        setSelectedSquare(null)
        setLegalMoves([])
      }
    } catch(e) {
      setSelectedSquare(null)
      setLegalMoves([])
    }
  }

  // effetto che si attiva ad ogni mossa per verificare se la partita e terminata
  useEffect(() => {
    if (checkGameOver() && !gameOver) {
      // gestisco la fine per scacco matto
      if (checkCheckmate()) {
          const vinceBianco = game.turn() === 'b'
          const esitoHost = (myColorRef.current === 'w' && vinceBianco) || (myColorRef.current === 'b' && !vinceBianco) ? 'win' : 'loss'
          terminaPartita(vinceBianco ? 'Bianco (Scacco Matto)' : 'Nero (Scacco Matto)', esitoHost)
      } else {
          // gestisco la fine per pareggio tecnico o stallo
          terminaPartita('Pareggio', 'draw')
      }
    }
  }, [game.fen()])

  // effetto per identificare la posizione del re sotto scacco e colorare la sua casella
  useEffect(() => {
    if (checkCheck()) {
      const color = game.turn()
      let kingSq = null
      
      // scansiono tutte le caselle della scacchiera per trovare il re del colore in difficolta
      for (let file of "abcdefgh") {
        for (let rank of "12345678") {
          const sq = file + rank
          const piece = game.get(sq)
          if (piece && piece.type === "k" && piece.color === color) { kingSq = sq; break }
        }
      }
      setInCheckSquare(kingSq)
    } else {
      setInCheckSquare(null)
    }
  }, [game.fen()])

  // gestisco i timer dei giocatori scalando i secondi in base a chi deve muovere
  useEffect(() => {
    if (!colorSelected || gameOver) return
    const timer = setInterval(() => {
      if (game.turn() === 'w') {
        setWhiteTime(t => { 
            // se il tempo arriva a zero il bianco perde
            if (t <= 1) { 
                const esitoHost = myColorRef.current === 'w' ? 'loss' : 'win'
                terminaPartita('Nero (Vittoria per Tempo)', esitoHost) 
                clearInterval(timer)
                return 0 
            } 
            return t - 1 
        })
      } else {
        setBlackTime(t => { 
            // se il tempo arriva a zero il nero perde
            if (t <= 1) { 
                const esitoHost = myColorRef.current === 'b' ? 'loss' : 'win'
                terminaPartita('Bianco (Vittoria per Tempo)', esitoHost) 
                clearInterval(timer)
                return 0 
            } 
            return t - 1 
        })
      }
    }, 1000)
    
    // azzero il timer quando il componente viene smontato
    return () => clearInterval(timer)
  }, [game.turn(), gameOver, colorSelected])

  // funzione chiamata in caso di chiusura imprevista dell avversario
  const gestisciDisconnessioneAvversario = () => {
    terminaPartita(`Tu (L'avversario si è disconnesso)`, 'win')
  }

  // funzione per gestire la resa volontaria tramite il pulsante apposito
  const arrenditi = () => {
      if (window.confirm("Sei sicuro di volerti arrendere?")) {
          const esitoHost = myColorRef.current === 'w' ? 'loss' : 'win'
          terminaPartita('Avversario (Per abbandono)', esitoHost)
          
          // invio il segnale di resa all altro utente
          if (mode === 'online') socket.emit('resign', { to: opponent })
          else if (conn) conn.send({ type: 'resign' })
      }
  }

  // funzione per inviare la proposta di patta all avversario
  const chiediPatta = () => {
      alert("Richiesta di patta inviata.")
      if (mode === 'online') socket.emit('draw-request', { to: opponent })
      else if (conn) conn.send({ type: 'draw-request' })
  }

  // inizializzo i listener per i messaggi se gioco tramite il server
  useEffect(() => {
    if (mode === 'online') {
      if (!opponent) { navigate('/home'); return }

      // ricevo la mossa avversaria e la applico alla mia scacchiera
      socket.on('receive-move', (moveData) => {
        setGame((g) => {
          const copy = new Chess(g.fen())
          try { copy.move({ from: moveData.from, to: moveData.to, promotion: moveData.promotion || undefined }) } catch(e) {}
          return copy
        })
        setLastMoveSquares([moveData.from, moveData.to])
        setMoveLog((log) => [...log, moveData])
      })

      // ricevo il colore scelto dall host e assegno il colore rimanente a me stesso
      socket.on('color-selected', (hostColor) => {
        setOpponentColor(hostColor)
        setMyColor(hostColor === 'w' ? 'b' : 'w')
        setColorSelected(true)
      })

      // gestisco tutti gli eventi di fine partita scatenati dall avversario
      socket.on('opponent-disconnected', gestisciDisconnessioneAvversario)
      
      socket.on('opponent-resigned', () => {
         const esitoHost = myColorRef.current === 'w' ? 'win' : 'loss' 
         terminaPartita('Tu (L\'avversario si è arreso)', esitoHost)
      })

      socket.on('draw-requested', () => setDrawRequestedByOpponent(true))
      
      socket.on('draw-accepted', () => {
          terminaPartita('Pareggio (Accordo tra i giocatori)', 'draw')
      })

      socket.on('draw-rejected', () => alert("L'avversario ha rifiutato la patta."))
      
      // rimuovo i listener quando il componente viene distrutto
      return () => { 
        socket.removeAllListeners('receive-move')
        socket.removeAllListeners('color-selected')
        socket.removeAllListeners('opponent-disconnected')
        socket.removeAllListeners('opponent-resigned')
        socket.removeAllListeners('draw-requested')
        socket.removeAllListeners('draw-accepted')
        socket.removeAllListeners('draw-rejected')
      }

    } else {
      // se gioco in modalita locale avvio la creazione dell identificativo peer
      const newPeer = new Peer()
      setPeer(newPeer)
      newPeer.on('open', (id) => setPeerId(id))
      newPeer.on('error', () => setConnectionError("Errore connessione."))

      // resto in ascolto di eventuali connessioni in entrata
      newPeer.on('connection', (connection) => {
        setConn(connection)
        setIsPeerHost(true) 
        connection.on('open', () => setConnected(true))
        connection.on('data', handlePeerData)
        connection.on('close', gestisciDisconnessioneAvversario)
      })
      
      // chiudo la connessione peer quando esco dalla pagina
      return () => { try { if (conn) conn.close(); newPeer.destroy() } catch (e) {} }
    }
  }, [mode, opponent, socket, navigate])

  // analizzo i messaggi in ingresso quando si gioca tramite connessione peer
  function handlePeerData(message) {
    if (!message || !message.type) return
    
    // leggo il tipo di messaggio ed eseguo l operazione corrispondente
    if (message.type === 'move') {
      setGame((g) => {
          const copy = new Chess(g.fen())
          try { copy.move({ from: message.data.from, to: message.data.to, promotion: message.data.promotion }) } catch(e){} 
          return copy
      })
      setLastMoveSquares([message.data.from, message.data.to])
      setMoveLog((log) => [...log, message.data])
    }
    else if (message.type === 'colorSelection') {
      setOpponentColor(message.color) 
      setMyColor(message.color === 'w' ? 'b' : 'w')
      setColorSelected(true)
    }
    else if (message.type === 'resign') terminaPartita('Tu (L\'avversario si è arreso)', 'win')
    else if (message.type === 'draw-request') setDrawRequestedByOpponent(true)
    else if (message.type === 'draw-accept') terminaPartita('Pareggio (Accordo)', 'draw')
    else if (message.type === 'draw-reject') alert("Avversario ha rifiutato la patta.")
  }

  // avvio manualmente la connessione inserendo l id testuale dell avversario
  function connectToOpponent() {
    if (!peer || !opponentId) return
    const connection = peer.connect(opponentId)
    connection.on('open', () => { setConnected(true); setIsPeerHost(false) })
    connection.on('data', handlePeerData)
    connection.on('close', gestisciDisconnessioneAvversario)
    setConn(connection)
  }

  // imposto il colore scelto dall interfaccia e lo comunico all altro giocatore
  function selectColor(color) {
    setMyColor(color)
    setOpponentColor(color === 'w' ? 'b' : 'w')
    setColorSelected(true)
    if (mode === 'online') socket.emit('select-color', { to: opponent, color })
    else if (conn) conn.send({ type: 'colorSelection', color })
  }

  // formatto i secondi rimanenti in formato minuti e secondi per i timer
  function formatTime(time) {
    return `${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}`
  }

  // abbandono la schermata avvisando il backend per la pulizia delle sessioni
  const chiudiPartitaESci = () => {
    if (mode === 'online') socket.emit('leave-all-matches', user) 
    if (mode === 'friend' && conn) conn.close() 
    navigate('/home')
  }

  // chiudo il popup della patta e forzo il pareggio
  const accettaPatta = () => {
      setDrawRequestedByOpponent(false)
      terminaPartita('Pareggio (Accordo)', 'draw')
      if (mode === 'online') socket.emit('draw-accept', { to: opponent })
      else if (conn) conn.send({ type: 'draw-accept' })
  }

  // chiudo il popup della patta ma faccio proseguire il gioco
  const rifiutaPatta = () => {
      setDrawRequestedByOpponent(false)
      if (mode === 'online') socket.emit('draw-reject', { to: opponent })
      else if (conn) conn.send({ type: 'draw-reject' })
  }

  // popolo l oggetto degli stili dinamici per colorare i quadrati sulla scacchiera
  const customStyles = {}
  lastMoveSquares.forEach(sq => { customStyles[sq] = { backgroundColor: 'rgba(255,255,0,0.45)' } })
  legalMoves.forEach(sq => { customStyles[sq] = { backgroundColor: 'rgba(0,255,0,0.35)' } })
  if (inCheckSquare) customStyles[inCheckSquare] = { backgroundColor: 'rgba(255, 0, 0, 0.45)' }
  if (selectedSquare) customStyles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' }

  return (
    <div className="app">
      {/* schermata iniziale per la connessione peer se si e' in modalita amico */}
      {mode === 'friend' && !connected && (
        <div className="peer-setup">
          <p style={{fontSize: '1.2rem', marginBottom: '20px'}}>Il tuo Peer ID <strong style={{userSelect: 'all', color: 'var(--gold-primary)'}}>{peerId || 'Generazione in corso...'}</strong></p>
          <input type="text" placeholder="Inserisci ID Avversario" value={opponentId} onChange={e => setOpponentId(e.target.value)} />
          <div className="action-buttons-row">
            <button onClick={connectToOpponent}>Connetti</button>
            <button className="btn-sec" onClick={() => { if (peerId) navigator.clipboard.writeText(peerId) }}>Copia ID</button>
          </div>
          {connectionError && <p style={{ color: '#e74c3c', marginTop: '15px', fontWeight: 'bold' }}>{connectionError}</p>}
        </div>
      )}

      {/* menu visibile solo all host per assegnare bianco o nero ai giocatori */}
      {connected && !colorSelected && !gameOver && (
        <div className="color-select">
          {(mode === 'friend' && isPeerHost) || (mode === 'online' && isHost) ? (
            <>
              <p style={{fontSize: '1.3rem', marginBottom: '20px'}}>{mode === 'online' ? `Partita trovata contro ${opponent} Scegli il colore` : 'Avversario connesso Scegli il colore'}</p>
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

      {/* interfaccia di gioco vera e propria visibile quando entrambi hanno i colori assegnati */}
      {connected && (colorSelected || gameOver) && (
        <div className="main-container">
          
          <div className="left-column">
            
            {/* barra superiore dedicata ai dati e al timer dell avversario */}
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

            {/* componente react-chessboard */}
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

            {/* barra inferiore dedicata ai dati e al timer del giocatore corrente */}
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

            {/* pannello pulsanti per le azioni opzionali durante la partita in corso */}
            {!gameOver && !promotionMove && (
                <div className="game-actions">
                    <button className="btn-action btn-surrender" onClick={arrenditi}>Arrenditi</button>
                    <button className="btn-action btn-draw" onClick={chiediPatta}>Proponi Patta</button>
                </div>
            )}

            {/* finestra di notifica quando si riceve la richiesta di patta */}
            {drawRequestedByOpponent && !gameOver && (
                <div className="draw-popup">
                    <p>L'avversario propone patta</p>
                    <button className="btn-success" onClick={accettaPatta}>Accetta</button>
                    <button className="btn-danger" onClick={rifiutaPatta}>Rifiuta</button>
                </div>
            )}

            {/* pannello personalizzato di scelta dei pezzi quando un pedone deve promuovere */}
            {promotionMove && (
              <div className="promotion-popup">
                <p>Scegli promozione</p>
                <div className="promotion-buttons">
                  {['q', 'r', 'b', 'n'].map(p => (
                    <button key={p} onClick={() => promotePiece(p)}>
                      <img src={`/pieces/${pieceMap[game.turn()][p]}.png`} alt={p} style={{ width: 45 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* schermata di riepilogo a fine partita con l esito finale */}
            {gameOver && !promotionMove && (
              <div className="game-over">
                <p style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--gold-primary)', textTransform: 'uppercase' }}>Partita Terminata</p>
                <p style={{ fontSize: '1.2rem', margin: '15px 0' }}>Esito <strong>{winner}</strong></p>
                <button onClick={chiudiPartitaESci}>Torna alla Dashboard</button>
              </div>
            )}

          </div>

          {/* pannello di destra che lista la sequenza delle mosse effettuate nella partita */}
          <div className="right-column">
            <h2>Registro Mosse</h2>
            <div className="move-log">
              {moveLog.length === 0 && <p style={{color: '#666', textAlign: 'center', marginTop: '20px'}}>Nessuna mossa giocata</p>}
              {moveLog.map((m, i) => (
                <div key={i} className="move">
                  <span style={{color: '#666', fontWeight: 'bold', width: '25px'}}>{i+1}</span>
                  <img src={`/pieces/${pieceMap[m.color][m.piece]}.png`} alt={m.piece} />
                  <span>{m.from} → {m.to}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Game