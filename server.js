import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';

import { initDb } from './db.js';
import { initWebSocket } from './wsHub.js';
import { runCleanup } from './cleanup.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import routineRoutes from './routes/routineRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import bodyMetricsRoutes from './routes/bodyMetricsRoutes.js';

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/body-metrics', bodyMetricsRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
initWebSocket(server);

const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    server.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
    runCleanup(); // limpia al arrancar (por si el servidor estuvo apagado un tiempo)
    setInterval(runCleanup, 60 * 60 * 1000); // y luego cada hora mientras siga corriendo
  })
  .catch((err) => {
    console.error('❌ Error inicializando la base de datos:', err);
    process.exit(1);
  });
