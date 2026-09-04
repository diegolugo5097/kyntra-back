import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

// GET /api/notifications  — notificaciones del usuario autenticado
router.get('/', authMiddleware, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json(rows);
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authMiddleware, async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND recipient_id = $2', [
    req.params.id,
    req.user.id,
  ]);
  res.json({ ok: true });
});

// PUT /api/notifications/read-all
router.put('/read-all', authMiddleware, async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE recipient_id = $1', [req.user.id]);
  res.json({ ok: true });
});

export default router;
