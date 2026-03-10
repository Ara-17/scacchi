/* Connessione al database MySQL */
import mysql from 'mysql2';

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'scacchi'
});
db.connect((err) => {
    if (err) {
        console.error('Errore di connessione al database:', err);
    }
});

export default db;