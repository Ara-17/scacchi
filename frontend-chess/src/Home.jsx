import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Home({ user, socket, setUser }) {
  const navigate = useNavigate();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isSearching, setIsSearching] = useState(false); 
  const [elo, setElo] = useState(1200);
  const [matchHistory, setMatchHistory] = useState([]);

  useEffect(() => {
    // Carica Dati Reali (Elo e Storico)
    fetch('http://localhost:3001/api/userdata', {credentials: 'include'})
      .then(res => res.json())
      .then(data => {
        if(data.elo) setElo(data.elo);
        if(data.history) setMatchHistory(data.history);
      })
      .catch(err => console.error(err));

    socket.on('online-users', (users) => setOnlineUsers(users));
    
    socket.on('challenge-request', ({ from }) => {
      if (window.confirm(`Sfida diretta da ${from}. Accetti?`)) {
        socket.emit('challenge-accepted', { from, to: user });
        navigate('/game', { state: { mode: 'online', opponent: from, isHost: false } }); 
      } else {
        socket.emit('challenge-rejected', { from, to: user });
      }
    });

    socket.on('challenge-accepted', ({ to }) => {
      navigate('/game', { state: { mode: 'online', opponent: to, isHost: true } });
    });
    
    socket.on('challenge-rejected', ({ to }) => alert(`La tua sfida a ${to} è stata rifiutata.`));

    socket.on('match-found', ({ opponent, isHost }) => {
      setIsSearching(false);
      navigate('/game', { state: { mode: 'online', opponent, isHost } });
    });

    return () => {
      socket.off('online-users');
      socket.off('challenge-request');
      socket.off('challenge-accepted');
      socket.off('challenge-rejected');
      socket.off('match-found');
    };
  }, [socket, user, navigate]);

  const handleLogout = async () => {
    await fetch('http://localhost:3001/logout', { method: 'POST', credentials: 'include' });
    socket.emit('set-offline', user);
    socket.disconnect();
    setUser(null);
  };

  const inviaSfida = (targetUser) => {
    socket.emit('challenge', { from: user, to: targetUser });
    alert(`Sfida inviata a ${targetUser}. In attesa di risposta...`);
  };

  const giocaOnlineOra = () => {
    setIsSearching(true);
    socket.emit('find-random-match', user);
  };

  const sfidaAmico = () => {
    navigate('/game', { state: { mode: 'friend' } });
  };

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="user-profile">
          <img src="https://cdn-icons-png.flaticon.com/512/147/147142.png" alt="Avatar" className="avatar-large" />
          <h2 className="username-display">{user}</h2>
          <div className="elo-display">ELO {elo}</div>
        </div>

        <div className="section-title">Storico Partite</div>
        <div className="history-list">
          {matchHistory.length === 0 ? <p style={{color: '#666', fontSize: '0.9rem'}}>Nessuna partita giocata</p> : 
            matchHistory.map(match => {
              const isBianco = match.giocatore_bianco === user;
              const avversario = isBianco ? match.giocatore_nero : match.giocatore_bianco;
              const variazione = isBianco ? match.variazione_bianco : match.variazione_nero;
              let esito = 'PATTA';
              let cssClass = 'draw';
              if ((isBianco && match.risultato === '1-0') || (!isBianco && match.risultato === '0-1')) {
                esito = 'VITTORIA'; cssClass = 'win';
              } else if ((isBianco && match.risultato === '0-1') || (!isBianco && match.risultato === '1-0')) {
                esito = 'SCONFITTA'; cssClass = 'loss';
              }

              return (
                <div key={match.id} className="match-item">
                  <span>vs {avversario}</span>
                  <span className={`match-result ${cssClass}`}>{esito} ({variazione > 0 ? '+'+variazione : variazione})</span>
                </div>
              );
            })
          }
        </div>

        <div className="section-title">Amici Online ({onlineUsers.length - 1 > 0 ? onlineUsers.length - 1 : 0})</div>
        <div className="friends-section">
          <ul className="user_list" style={{listStyle: 'none', padding: 0, margin: 0}}>
            {onlineUsers.map((u) => (
              u !== user && (
                <li key={u} className="friend-item" onClick={() => inviaSfida(u)} title={`Sfida ${u} direttamente!`}>
                  <div className="friend-avatar"></div>
                  <span className="user_name">{u}</span>
                  <div className="status-dot"></div>
                </li>
              )
            ))}
            {onlineUsers.length <= 1 && <li style={{color: '#666', fontSize: '0.8rem', padding: '10px'}}>Nessun amico online</li>}
          </ul>
        </div>
      </aside>

      <main className="main-area">
        <div className="main-content-wrapper">
          <h1 className="brand-title">ONLINE <span>CHESS</span> HUB</h1>
          
          <div className="play-box">
            <button className="btn-big-play" onClick={giocaOnlineOra} disabled={isSearching}>
              {isSearching ? 'RICERCA AVVERSARIO...' : 'GIOCA ONLINE ORA'}
            </button>
            
            <div className="secondary-actions">
              <button className="btn-sec" onClick={sfidaAmico}>SFIDA AMICO (CODICE)</button>
              <button className="btn-sec" onClick={handleLogout} style={{borderColor: '#e74c3c', color: '#e74c3c'}}>ESCI</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Home;