import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';

const router = Router();

// Verifica que el usuario autenticado (entrenador) sea dueño del alumno,
// o que el usuario autenticado sea el propio alumno.
async function canAccessUser(req, targetUserId) {
  if (req.user.role === 'user') return req.user.id === Number(targetUserId);
  const { rows } = await query('SELECT id FROM users WHERE id = $1 AND trainer_id = $2', [
    targetUserId,
    req.user.id,
  ]);
  return rows.length > 0;
}

// GET /api/routines/:userId  — rutina completa (días + ejercicios) de un usuario
router.get('/:userId', authMiddleware, async (req, res) => {
  if (!(await canAccessUser(req, req.params.userId))) {
    return res.status(403).json({ error: 'Sin acceso a este usuario' });
  }
  const { rows: days } = await query(
    'SELECT * FROM routine_days WHERE user_id = $1 ORDER BY sort_order, id',
    [req.params.userId]
  );
  const { rows: exercises } = await query(
    `SELECT e.* FROM exercises e
     JOIN routine_days d ON e.day_id = d.id
     WHERE d.user_id = $1 ORDER BY e.sort_order, e.id`,
    [req.params.userId]
  );
  const daysWithExercises = days.map((d) => ({
    ...d,
    exercises: exercises.filter((e) => e.day_id === d.id),
  }));
  res.json(daysWithExercises);
});

// POST /api/routines/:userId/days  — el entrenador crea un día (ej: "TORSO A")
router.post('/:userId/days', authMiddleware, requireRole('trainer'), async (req, res) => {
  if (!(await canAccessUser(req, req.params.userId))) {
    return res.status(403).json({ error: 'Sin acceso a este usuario' });
  }
  const { name, sort_order = 0 } = req.body;
  const { rows } = await query(
    `INSERT INTO routine_days (user_id, trainer_id, name, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.params.userId, req.user.id, name, sort_order]
  );
  res.status(201).json(rows[0]);
});

router.delete('/days/:dayId', authMiddleware, requireRole('trainer'), async (req, res) => {
  await query('DELETE FROM routine_days WHERE id = $1 AND trainer_id = $2', [
    req.params.dayId,
    req.user.id,
  ]);
  res.json({ ok: true });
});

// POST /api/routines/days/:dayId/exercises  — el entrenador agrega un ejercicio a un día,
// definiendo también sus objetivos (series, reps, RIR, RPE, descanso)
router.post('/days/:dayId/exercises', authMiddleware, requireRole('trainer'), async (req, res) => {
  const { name, target_sets, target_reps, rir, rpe, rest, notes, sort_order = 0 } = req.body;
  const { rows } = await query(
    `INSERT INTO exercises (day_id, name, target_sets, target_reps, rir, rpe, rest, notes, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.params.dayId, name, target_sets || null, target_reps || null, rir || null, rpe || null, rest || null, notes || null, sort_order]
  );
  res.status(201).json(rows[0]);
});

router.put('/exercises/:exerciseId', authMiddleware, requireRole('trainer'), async (req, res) => {
  const { name, target_sets, target_reps, rir, rpe, rest, notes } = req.body;
  const { rows } = await query(
    `UPDATE exercises SET name=$1, target_sets=$2, target_reps=$3, rir=$4, rpe=$5, rest=$6, notes=$7
     WHERE id=$8 RETURNING *`,
    [name, target_sets || null, target_reps || null, rir || null, rpe || null, rest || null, notes || null, req.params.exerciseId]
  );
  res.json(rows[0]);
});

router.delete('/exercises/:exerciseId', authMiddleware, requireRole('trainer'), async (req, res) => {
  await query('DELETE FROM exercises WHERE id = $1', [req.params.exerciseId]);
  res.json({ ok: true });
});

// POST /api/routines/exercises/:exerciseId/logs  — el usuario registra una serie realizada
router.post('/exercises/:exerciseId/logs', authMiddleware, requireRole('user'), async (req, res) => {
  const { set_number, weight_kg, reps, rir, rpe, log_date } = req.body;
  const { rows } = await query(
    `INSERT INTO exercise_logs (exercise_id, user_id, set_number, weight_kg, reps, rir, rpe, log_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, CURRENT_DATE)) RETURNING *`,
    [req.params.exerciseId, req.user.id, set_number, weight_kg, reps, rir, rpe, log_date]
  );
  res.status(201).json(rows[0]);
});

// GET /api/routines/exercises/:exerciseId/logs  — historial de un ejercicio
router.get('/exercises/:exerciseId/logs', authMiddleware, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM exercise_logs WHERE exercise_id = $1 ORDER BY log_date DESC, set_number',
    [req.params.exerciseId]
  );
  res.json(rows);
});

export default router;
