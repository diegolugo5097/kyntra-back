import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../auth.js';
import { sendToUser } from '../wsHub.js';
import { cleanupOldMessages } from '../cleanup.js';
import { sendPushToUser } from '../push.js';

const router = Router();

// GET /api/chat/:otherUserId  — historial de conversación con otro usuario
router.get('/:otherUserId', authMiddleware, async (req, res) => {
  await cleanupOldMessages(); // por si el servidor llevaba rato dormido y no corrió la limpieza programada
  const { rows } = await query(
    `SELECT * FROM messages
     WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
     ORDER BY created_at ASC`,
    [req.user.id, req.params.otherUserId]
  );
  // Marca como leídos los mensajes que el otro usuario me envió
  await query(
    'UPDATE messages SET is_read = TRUE WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE',
    [req.params.otherUserId, req.user.id]
  );
  res.json(rows);
});

// POST /api/chat/:otherUserId  — enviar un mensaje (también se emite por WebSocket)
router.post('/:otherUserId', authMiddleware, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Mensaje vacío' });

  const { rows } = await query(
    `INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *`,
    [req.user.id, req.params.otherUserId, content.trim()]
  );
  const message = rows[0];

  sendToUser(Number(req.params.otherUserId), { event: 'message', data: message });
  sendToUser(req.user.id, { event: 'message', data: message }); // eco a otras pestañas propias

  const { rows: notif } = await query(
    `INSERT INTO notifications (recipient_id, actor_id, type, message)
     VALUES ($1, $2, 'new_message', $3) RETURNING *`,
    [req.params.otherUserId, req.user.id, `${req.user.name} te envió un mensaje`]
  );
  sendToUser(Number(req.params.otherUserId), { event: 'notification', data: notif[0] });
  sendPushToUser(Number(req.params.otherUserId), {
    title: 'Kyntra',
    body: notif[0].message,
    url: '/',
  });

  res.status(201).json(message);
});

export default router;
