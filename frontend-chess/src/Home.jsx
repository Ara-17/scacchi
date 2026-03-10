import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const MATCH_HISTORY = [
  { id: 1, opponent: 'MagnusC', result: 'WIN', eloDiff: '+12' },
  { id: 2, opponent: 'HikaruN', result: 'LOSS', eloDiff: '-8' },
  { id: 3, opponent: 'GothamChess', result: 'WIN', eloDiff: '+15' }
];

function Home({ user, socket, setUser }) {
  const navigate = useNavigate();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isSearching, setIsSearching] = useState(false); 

  useEffect(() => {
    socket.on('online-users', (users) => setOnlineUsers(users));
    
    // Accetta sfida dalla sidebar -> Va alla modalità ONLINE (Socket)
    socket.on('challenge-request', ({ from }) => {
      if (window.confirm(`Sfida da ${from}. Accetti?`)) {
        socket.emit('challenge-accepted', { from, to: user });
        navigate('/game', { state: { mode: 'online', opponent: from, isHost: false } }); 
      } else {
        socket.emit('challenge-rejected', { from, to: user });
      }
    });

    socket.on('challenge-accepted', ({ to }) => {
      navigate('/game', { state: { mode: 'online', opponent: to, isHost: true } });
    });
    
    socket.on('challenge-rejected', ({ to }) => alert(`Sfida a ${to} rifiutata.`));

    // Partita trovata dal Matchmaking -> Va alla modalità ONLINE (Socket)
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
    await fetch('http://localhost:3001/logout', { method: 'POST' });
    socket.emit('set-offline', user);
    socket.disconnect();
    setUser(null);
  };

  const inviaSfida = (targetUser) => {
    socket.emit('challenge', { from: user, to: targetUser });
    alert(`Sfida inviata a ${targetUser}`);
  };

  // BOTTONE 1: Usa Socket.io per cercare a caso
  const giocaOnlineOra = () => {
    setIsSearching(true);
    socket.emit('find-random-match', user);
  };

  // BOTTONE 2: Usa PeerJS manuale (La tua vecchia modalità)
  const sfidaAmico = () => {
    navigate('/game', { state: { mode: 'friend' } });
  };

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="user-profile">
          <img src="https://cdn-icons-png.flaticon.com/512/147/147142.png" alt="Avatar" className="avatar-large" />
          <h2 className="username-display">{user}</h2>
          <div className="elo-display">ELO 1250</div>
        </div>

        <div className="section-title">Storico Partite</div>
        <div className="history-list">
          {MATCH_HISTORY.map(match => (
            <div key={match.id} className="match-item">
              <span>vs {match.opponent}</span>
              <span className={`match-result ${match.result.toLowerCase()}`}>{match.result} ({match.eloDiff})</span>
            </div>
          ))}
        </div>

        <div className="section-title">Amici Online ({onlineUsers.length - 1 > 0 ? onlineUsers.length - 1 : 0})</div>
        <div className="friends-section">
          <ul className="user_list">
            {onlineUsers.map((u) => (
              u !== user && (
                <li key={u} className="friend-item" onClick={() => inviaSfida(u)}>
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
              <button className="btn-sec" onClick={sfidaAmico}>SFIDA AMICO</button>
              <button className="btn-sec">TORNEI LIVE</button>
              <button className="btn-sec" onClick={handleLogout} style={{borderColor: '#e74c3c', color: '#e74c3c'}}>ESCI</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Home;