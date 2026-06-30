require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

async function run() {
    const name = process.env.ADMIN_NAME;
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!name || !email || !password) throw new Error('Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD before running this command');
    if (password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters');
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [email]);
    let result;
    if (existing.rows[0]) {
        result = await pool.query(
            `UPDATE users SET name=$1,password_hash=$2,role='admin',active=TRUE WHERE id=$3 RETURNING id,name,email,role`,
            [name,passwordHash,existing.rows[0].id]
        );
    } else {
        result = await pool.query(
            `INSERT INTO users (name,email,password_hash,role) VALUES ($1,LOWER($2),$3,'admin') RETURNING id,name,email,role`,
            [name,email,passwordHash]
        );
    }
    console.log('Admin ready:', result.rows[0]);
}
run().catch((e) => { console.error('Create admin failed:', e.message); process.exitCode = 1; }).finally(() => pool.end());
