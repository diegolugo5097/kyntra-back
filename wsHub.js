import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import url from 'url';

// userId -> Set de conexiones activas (un usuario puede tener varias pestañas)
const connections = new Map();

export function initWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const { query } = url.parse(req.url, true);
    let userId;
    try {
      const payload = jwt.verify(query.token, process.env.JWT_SECRET);
      userId = payload.id;
    } catch {
      ws.close(4001, 'Token inválido');
      return;
    }

    if (!connections.has(userId)) connections.set(userId, new Set());
    connections.get(userId).add(ws);

    ws.on('close', () => {
      connections.get(userId)?.delete(ws);
      if (connections.get(userId)?.size === 0) connections.delete(userId);
    });
  });

  return wss;
}

// Envía un evento JSON a todas las conexiones activas de un usuario específico
export function sendToUser(userId, payload) {
  const sockets = connections.get(userId);
  if (!sockets) return;
  const data = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}
