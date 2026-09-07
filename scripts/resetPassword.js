// Uso: node scripts/resetPassword.js correo@ejemplo.com nuevaContraseña
// Sirve para restablecer la contraseña de CUALQUIER cuenta (entrenador o usuario) directo en la
// base de datos. Pensado sobre todo para cuando el entrenador olvida la suya — para los usuarios,
// normalmente es más rápido usar el botón "Restablecer contraseña" desde el panel del entrenador.

import dotenv from 'dotenv';
import { pool, initDb } from '../db.js';
import { hashPassword } from '../auth.js';

dotenv.config();

const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error('Uso: node scripts/resetPassword.js correo@ejemplo.com nuevaContraseña');
  process.exit(1);
}
if (newPassword.length < 6) {
  console.error('La nueva contraseña debe tener al menos 6 caracteres.');
  process.exit(1);
}

async function main() {
  await initDb();
  const { rows } = await pool.query('SELECT id, name, role FROM users WHERE email = $1', [email]);
  if (!rows.length) {
    console.error('No existe ninguna cuenta con ese correo.');
    process.exit(1);
  }
  const hash = await hashPassword(newPassword);
  await pool.query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE email = $2', [
    hash,
    email,
  ]);
  console.log(`✅ Contraseña actualizada para ${rows[0].name} (${rows[0].role}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
