import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Home from './Home';
import Login from './Login';
import Register from './Register';
import Game from './Game';

const socket = io('http://localhost:3001', { autoConnect: false });

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Controllo sessione iniziale
  useEffect(() => {
    fetch('http://localhost:3001/api/check-session', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.isLoggedIn) {
          setUser(data.username);
          socket.connect();
          socket.emit('set-online', data.username);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-screen"><div className="loading-spinner"></div></div>;

  return (
    <Router>
      <div id="main">
        <Routes>
          {/* La rotta principale gestisce l'intro */}
          <Route path="/" element={<Landing user={user} />} />
          
          {/* Rotte protette */}
          <Route path="/home" element={user ? <Home user={user} socket={socket} setUser={setUser} /> : <Navigate to="/" />} />
          
          {/* Login/Register */}
          <Route path="/login" element={!user ? <Login setUser={setUser} socket={socket} /> : <Navigate to="/home" />} />
          <Route path="/register" element={!user ? <Register /> : <Navigate to="/home" />} />
          <Route path="/game" element={user ? <Game user={user} socket={socket} /> : <Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

// Componente Landing (Gestisce animazione e scelta tasti)
function Landing({ user }) {
  const navigate = useNavigate();
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    if (user) {
      // Se l'utente è loggato, mostra l'animazione per 2 secondi poi vai alla home
      setShowIntro(true);
      const timer = setTimeout(() => {
        navigate('/home');
      }, 2000); // 2 secondi di animazione
      return () => clearTimeout(timer);
    }
  }, [user, navigate]);

  if (user && showIntro) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <h2 style={{ color: '#d4af37' }}>Bentornato, {user}...</h2>
        <p>Accesso alla Dashboard in corso</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="intro-container">
        <h1 className="intro-title">ONLINE <span className="giallo">CHESS</span> HUB</h1>
        <div className="intro-buttons">
          <Link to="/login" className="btn-intro">LOGIN</Link>
          <Link to="/register" className="btn-intro">REGISTER</Link>
        </div>
      </div>
    );
  }

  return null;
}

export default App;