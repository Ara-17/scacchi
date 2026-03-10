import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '', password: '', email: '', nome: '', cognome: '', cf: '', cell: '', confPassword: ''
  });

  const handleRegister = async () => {
    if (formData.password !== formData.confPassword) {
      alert("Le password non coincidono");
      return;
    }
    
    try {
      const res = await fetch('http://localhost:3001/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      alert(data.message);
      if (!data.error && res.ok) {
        navigate('/login');
      }
    } catch (error) {
      console.error(error);
      alert("Errore durante la registrazione");
    }
  };

  const handleChange = (e) => {
    setFormData({...formData, [e.target.name]: e.target.value});
  }

  return (
    <div className="auth-box" style={{width: '400px'}}>
      <h1 className="brand-title" style={{fontSize: '2rem', marginBottom: '10px'}}>
        ONLINE <span>CHESS</span>
      </h1>
      <h2 style={{color: '#aaa', fontWeight: '300', marginBottom: '20px'}}>REGISTRAZIONE</h2>
      
      <div style={{display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '50vh', overflowY: 'auto', paddingRight: '5px'}}>
        {/* Ho aggiunto un name agli input per gestire meglio lo state */}
        <input className="auth-input" name="username" placeholder="Username" onChange={handleChange} />
        <input className="auth-input" name="email" placeholder="Email" type="email" onChange={handleChange} />
        <input className="auth-input" name="password" placeholder="Password" type="password" onChange={handleChange} />
        <input className="auth-input" name="confPassword" placeholder="Conferma Password" type="password" onChange={handleChange} />
        <input className="auth-input" name="nome" placeholder="Nome" onChange={handleChange} />
        <input className="auth-input" name="cognome" placeholder="Cognome" onChange={handleChange} />
        <input className="auth-input" name="cf" placeholder="Codice Fiscale" onChange={handleChange} />
        <input className="auth-input" name="cell" placeholder="Cellulare" onChange={handleChange} />
      </div>

      <div style={{marginTop: '15px'}}>
        <button className="auth-btn" onClick={handleRegister}>CREA ACCOUNT</button>
      </div>

      <div className="form-footer" style={{marginTop: '20px'}}>
         <p style={{color: '#888'}}>
           Hai già un account? <Link to="/login" style={{color: '#d4af37'}}>Accedi ora</Link>
         </p>
         <Link to="/" style={{color: '#666', fontSize: '0.9rem', textDecoration: 'none'}}>Torna alla Home</Link>
      </div>
    </div>
  );
}

export default Register;