import webpush from 'web-push';
import { query } from './db.js';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

let configured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:soporte@kyntra.app',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  configured = true;
} else {
  console.warn('⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configuradas — las notificaciones push están desactivadas.');
}

// Envía una notificación push a todas las suscripciones activas de un usuario.
// Si una suscripción ya no es válida (el usuario desinstaló la app, borró permisos, etc.),
// la eliminamos de la base de datos para no seguir intentando en vano.
export async function sendPushToUser(userId, { title, body, url }) {
  if (!configured) return;

  const { rows: subs } = await query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);
  if (!subs.length) return;

  const payload = JSON.stringify({ title, body, url: url || '/' });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        } else {
          console.error('❌ Error enviando push:', err?.message || err);
        }
      }
    })
  );
}
