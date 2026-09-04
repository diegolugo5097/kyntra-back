import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';
import { upload, cloudinary, uploadBufferToCloudinary } from '../cloudinary.js';
import { sendToUser } from '../wsHub.js';
import { cleanupOldMedia } from '../cleanup.js';

const router = Router();

// POST /api/media/upload  — el usuario sube una foto/video de una rutina
router.post('/upload', authMiddleware, requireRole('user'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

  const { exercise_id, day_id } = req.body;
  const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'photo';

  let cloudinaryResult;
  try {
    cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, mediaType === 'video' ? 'video' : 'image');
  } catch (err) {
    console.error('❌ Error subiendo a Cloudinary:', err?.message || err);
    return res.status(502).json({ error: `Error subiendo a Cloudinary: ${err?.message || 'desconocido'}` });
  }

  const { rows } = await query(
    `INSERT INTO media_uploads (user_id, exercise_id, day_id, media_type, url, cloudinary_public_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.user.id, exercise_id || null, day_id || null, mediaType, cloudinaryResult.secure_url, cloudinaryResult.public_id]
  );
  const upload_row = rows[0];

  // Notifica al entrenador en tiempo real
  const { rows: trainerRows } = await query(
    'SELECT trainer_id FROM users WHERE id = $1',
    [req.user.id]
  );
  const trainerId = trainerRows[0]?.trainer_id;
  if (trainerId) {
    const { rows: notif } = await query(
      `INSERT INTO notifications (recipient_id, actor_id, type, message, related_upload_id)
       VALUES ($1, $2, 'new_upload', $3, $4) RETURNING *`,
      [trainerId, req.user.id, `${req.user.name} subió un ${mediaType === 'video' ? 'video' : 'una foto'} de su rutina`, upload_row.id]
    );
    sendToUser(trainerId, { event: 'notification', data: notif[0] });
  }

  res.status(201).json(upload_row);
});

// GET /api/media/:userId  — ver las subidas de un usuario (el propio usuario o su entrenador)
router.get('/:userId', authMiddleware, async (req, res) => {
  if (req.user.role === 'user' && req.user.id !== Number(req.params.userId)) {
    return res.status(403).json({ error: 'Sin acceso' });
  }
  await cleanupOldMedia(); // por si el servidor llevaba rato dormido y no corrió la limpieza programada
  const { rows } = await query(
    'SELECT * FROM media_uploads WHERE user_id = $1 ORDER BY created_at DESC',
    [req.params.userId]
  );
  res.json(rows);
});

// PUT /api/media/:id/observation  — el entrenador deja una observación sobre una subida
router.put('/:id/observation', authMiddleware, requireRole('trainer'), async (req, res) => {
  const { observation } = req.body;
  const { rows } = await query(
    `UPDATE media_uploads SET observation=$1, observation_by=$2, observation_at=now()
     WHERE id=$3 RETURNING *`,
    [observation, req.user.id, req.params.id]
  );
  const media = rows[0];
  if (!media) return res.status(404).json({ error: 'No encontrado' });

  const { rows: notif } = await query(
    `INSERT INTO notifications (recipient_id, actor_id, type, message, related_upload_id)
     VALUES ($1, $2, 'new_observation', $3, $4) RETURNING *`,
    [media.user_id, req.user.id, 'Tu entrenador dejó una observación en tu rutina', media.id]
  );
  sendToUser(media.user_id, { event: 'notification', data: notif[0] });

  res.json(media);
});

// DELETE /api/media/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const { rows } = await query('SELECT * FROM media_uploads WHERE id = $1', [req.params.id]);
  const media = rows[0];
  if (!media) return res.status(404).json({ error: 'No encontrado' });
  if (req.user.role === 'user' && media.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso' });
  }
  await cloudinary.uploader.destroy(media.cloudinary_public_id, {
    resource_type: media.media_type === 'video' ? 'video' : 'image',
  });
  await query('DELETE FROM media_uploads WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
