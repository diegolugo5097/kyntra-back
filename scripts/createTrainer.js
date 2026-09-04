// Uso: node scripts/createTrainer.js "Tu Nombre" tu@email.com tuContraseña
// Crea la primera cuenta de entrenador. No hay registro público por diseño:
// el entrenador es quien crea todas las demás cuentas desde la app.

import dotenv from 'dotenv';
import { pool, initDb } from '../db.js';
import { hashPassword } from '../auth.js';

dotenv.config();

const [, , name, email, password] = process.argv;

if (!name || !email || !password) {
  console.error('Uso: node scripts/createTrainer.js "Nombre" email@ejemplo.com contraseña');
  process.exit(1);
}

async function main() {
  await initDb();
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) {
    console.error('Ya existe un usuario con ese email.');
    process.exit(1);
  }
  const hash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, 'trainer', FALSE) RETURNING id, name, email`,
    [name, email, hash]
  );
  console.log('✅ Entrenador creado:', rows[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
