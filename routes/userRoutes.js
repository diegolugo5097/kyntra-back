import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { hashPassword, authMiddleware, requireRole } from '../auth.js';
import { cloudinary } from '../cloudinary.js';

const router = Router();

// POST /api/users  — el entrenador crea la cuenta de un usuario
router.post('/', authMiddleware, requireRole('trainer'), async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Nombre y email son requeridos' });

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

  // Contraseña temporal generada — el usuario la cambia en su primer login
  const tempPassword = crypto.randomBytes(4).toString('hex'); // ej: "a1b2c3d4"
  const passwordHash = await hashPassword(tempPassword);

  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, must_change_password, trainer_id)
     VALUES ($1, $2, $3, 'user', TRUE, $4)
     RETURNING id, name, email, role, created_at`,
    [name, email, passwordHash, req.user.id]
  );

  // Se devuelve la contraseña temporal una sola vez para que el entrenador se la entregue al usuario
  res.status(201).json({ user: rows[0], temp_password: tempPassword });
});

// GET /api/users  — lista de usuarios del entrenador autenticado
router.get('/', authMiddleware, requireRole('trainer'), async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, email, must_change_password, created_at FROM users WHERE trainer_id = $1 ORDER BY name',
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/users/:id  — detalle de un usuario (solo su propio entrenador)
router.get('/:id', authMiddleware, requireRole('trainer'), async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, email, must_change_password, created_at FROM users WHERE id = $1 AND trainer_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
});

// PUT /api/users/:id/reset-password — el entrenador genera una nueva contraseña temporal para un usuario
// (equivalente a un "olvidé mi contraseña" mediado por el entrenador, ya que no hay registro/email público)
router.put('/:id/reset-password', authMiddleware, requireRole('trainer'), async (req, res) => {
  const { rows: owned } = await query('SELECT id, name, email FROM users WHERE id = $1 AND trainer_id = $2', [
    req.params.id,
    req.user.id,
  ]);
  if (!owned.length) return res.status(404).json({ error: 'Usuario no encontrado' });

  const tempPassword = crypto.randomBytes(4).toString('hex');
  const passwordHash = await hashPassword(tempPassword);
  await query('UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2', [
    passwordHash,
    req.params.id,
  ]);

  res.json({ user: owned[0], temp_password: tempPassword });
});

// DELETE /api/users/:id — el entrenador elimina la cuenta de un usuario y todo lo asociado
// (rutina, registros, medidas, chat, notificaciones se borran en cascada desde la base de datos;
// aquí solo nos encargamos de limpiar los archivos reales en Cloudinary antes de borrar el usuario)
router.delete('/:id', authMiddleware, requireRole('trainer'), async (req, res) => {
  const { rows: owned } = await query('SELECT id, name FROM users WHERE id = $1 AND trainer_id = $2', [
    req.params.id,
    req.user.id,
  ]);
  if (!owned.length) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { rows: media } = await query(
    'SELECT cloudinary_public_id, media_type FROM media_uploads WHERE user_id = $1',
    [req.params.id]
  );
  for (const m of media) {
    try {
      await cloudinary.uploader.destroy(m.cloudinary_public_id, {
        resource_type: m.media_type === 'video' ? 'video' : 'image',
      });
    } catch (err) {
      console.error('❌ Error borrando evidencia de Cloudinary al eliminar usuario:', err?.message || err);
    }
  }

  await query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
