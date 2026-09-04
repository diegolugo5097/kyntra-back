import { Router } from 'express';
import { query } from '../db.js';
import { hashPassword, comparePassword, signToken, authMiddleware } from '../auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
      weight_unit: user.weight_unit,
    },
  });
});

// POST /api/auth/change-password  (usado en el primer inicio de sesión o cuando el usuario quiera)
router.post('/change-password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];

  // Si ya cambió su contraseña antes, exigimos la actual para volver a cambiarla
  if (!user.must_change_password) {
    const valid = await comparePassword(current_password || '', user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }

  const newHash = await hashPassword(new_password);
  await query(
    'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
    [newHash, user.id]
  );
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, email, role, must_change_password, trainer_id, weight_unit FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json(rows[0]);
});

// PUT /api/auth/unit — cada cuenta elige si prefiere ver los pesos en kg o lb
router.put('/unit', authMiddleware, async (req, res) => {
  const { weight_unit } = req.body;
  if (!['kg', 'lb'].includes(weight_unit)) {
    return res.status(400).json({ error: "weight_unit debe ser 'kg' o 'lb'" });
  }
  await query('UPDATE users SET weight_unit = $1 WHERE id = $2', [weight_unit, req.user.id]);
  res.json({ ok: true, weight_unit });
});

export default router;
