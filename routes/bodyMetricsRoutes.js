import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';

const router = Router();

// POST /api/body-metrics/:userId  — el entrenador registra una medición
router.post('/:userId', authMiddleware, requireRole('trainer'), async (req, res) => {
  const { rows: owned } = await query('SELECT id FROM users WHERE id = $1 AND trainer_id = $2', [
    req.params.userId,
    req.user.id,
  ]);
  if (!owned.length) return res.status(403).json({ error: 'Sin acceso a este usuario' });

  const { height_cm, weight_kg, body_fat_pct, recorded_date } = req.body;
  const { rows } = await query(
    `INSERT INTO body_metrics (user_id, trainer_id, height_cm, weight_kg, body_fat_pct, recorded_date)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE)) RETURNING *`,
    [req.params.userId, req.user.id, height_cm || null, weight_kg || null, body_fat_pct || null, recorded_date]
  );
  res.status(201).json(rows[0]);
});

// GET /api/body-metrics/:userId  — historial (el propio usuario o su entrenador)
router.get('/:userId', authMiddleware, async (req, res) => {
  if (req.user.role === 'user' && req.user.id !== Number(req.params.userId)) {
    return res.status(403).json({ error: 'Sin acceso' });
  }
  if (req.user.role === 'trainer') {
    const { rows: owned } = await query('SELECT id FROM users WHERE id = $1 AND trainer_id = $2', [
      req.params.userId,
      req.user.id,
    ]);
    if (!owned.length) return res.status(403).json({ error: 'Sin acceso a este usuario' });
  }
  const { rows } = await query(
    'SELECT * FROM body_metrics WHERE user_id = $1 ORDER BY recorded_date DESC, id DESC',
    [req.params.userId]
  );
  res.json(rows);
});

// DELETE /api/body-metrics/:id  — el entrenador puede borrar una medición equivocada
router.delete('/entry/:id', authMiddleware, requireRole('trainer'), async (req, res) => {
  await query('DELETE FROM body_metrics WHERE id = $1 AND trainer_id = $2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

export default router;
