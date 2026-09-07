import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

// POST /api/push/subscribe — guarda (o actualiza) la suscripción push del navegador/dispositivo actual
router.post('/subscribe', authMiddleware, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
    [req.user.id, endpoint, keys.p256dh, keys.auth]
  );
  res.status(201).json({ ok: true });
});

// POST /api/push/unsubscribe — quita la suscripción (ej: el usuario desactiva las notificaciones)
router.post('/unsubscribe', authMiddleware, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Falta endpoint' });
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id]);
  res.json({ ok: true });
});

export default router;
