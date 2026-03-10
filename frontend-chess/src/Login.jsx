import { useState } from 'react';
import { Link } from 'react-router-dom';

function Login({ setUser, socket }) {
  const [formData, setFormData] = useState({ username: '', password: '' });

  const handleLogin = async () => {
    try {
      const res = await fetch('http://localhost:3001/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        credentials: 'include'
      });
      
      const data = await res.json();
      
      if (res.status !== 200 || data.error) {
        alert(data.error || "Errore durante il login");
      } else {
        setUser(data.username);
        socket.connect();
        socket.emit('set-online', data.username);
      }
    } catch (error) {
      console.error("Errore di connessione:", error);
      alert("Impossibile connettersi al server.");
    }
  };

  return (
    <div className="auth-box">
      <h1 className="brand-title" style={{fontSize: '2rem', marginBottom: '20px'}}>
        ONLINE <span>CHESS</span>
      </h1>
      <h2 style={{color: '#aaa', fontWeight: '300', marginBottom: '30px'}}>ACCEDI</h2>
      
      <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
        <input 
          className="auth-input" 
          placeholder="Username" 
          value={formData.username}
          onChange={e => setFormData({...formData, username: e.target.value})}
        />
        <input 
          className="auth-input" 
          placeholder="Password" 
          type="password"
          value={formData.password}
          onChange={e => setFormData({...formData, password: e.target.value})}
        />
        
        <button className="auth-btn" onClick={handleLogin}>ACCEDI</button>
      </div>

      <div className="form-footer" style={{marginTop: '20px'}}>
         <p style={{color: '#888'}}>
           Non hai un account? <Link to="/register" style={{color: '#d4af37'}}>Registrati ora</Link>
         </p>
         <Link to="/" style={{color: '#666', fontSize: '0.9rem', textDecoration: 'none'}}>Torna alla Home</Link>
      </div>
    </div>
  );
}

export default Login;