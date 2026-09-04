import { query } from './db.js';
import { cloudinary } from './cloudinary.js';

// Ajusta aquí si en el futuro quieres otros plazos.
const MESSAGE_TTL_INTERVAL = '24 hours';
const MEDIA_TTL_INTERVAL = '30 days';

export async function cleanupOldMessages() {
  const { rowCount } = await query(
    `DELETE FROM messages WHERE created_at < now() - interval '${MESSAGE_TTL_INTERVAL}'`
  );
  if (rowCount) console.log(`🧹 ${rowCount} mensaje(s) de más de 24h eliminados`);
}

export async function cleanupOldMedia() {
  const { rows } = await query(
    `SELECT id, cloudinary_public_id, media_type FROM media_uploads
     WHERE created_at < now() - interval '${MEDIA_TTL_INTERVAL}'`
  );
  if (!rows.length) return;

  for (const row of rows) {
    try {
      await cloudinary.uploader.destroy(row.cloudinary_public_id, {
        resource_type: row.media_type === 'video' ? 'video' : 'image',
      });
    } catch (err) {
      // Si falla el borrado en Cloudinary igual limpiamos el registro de la base de datos;
      // no queremos que un archivo huérfano en Cloudinary bloquee la limpieza del resto.
      console.error(`❌ Error borrando de Cloudinary (media ${row.id}):`, err?.message || err);
    }
  }

  await query(
    `DELETE FROM media_uploads WHERE created_at < now() - interval '${MEDIA_TTL_INTERVAL}'`
  );
  console.log(`🧹 ${rows.length} evidencia(s) de más de 30 días eliminada(s)`);
}

export async function runCleanup() {
  try {
    await cleanupOldMessages();
    await cleanupOldMedia();
  } catch (err) {
    console.error('❌ Error en limpieza automática:', err?.message || err);
  }
}
