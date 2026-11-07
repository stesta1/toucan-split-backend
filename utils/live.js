// Avisos en vivo (Server-Sent Events): cada usuario con la app abierta mantiene una
// conexión, y cuando algo cambia se le avisa al instante para que vuelva a pedir los
// datos a la API. Los avisos nunca llevan montos.
// Las conexiones viven en memoria: alcanza mientras el backend corra en una sola instancia.

const HEARTBEAT_MS = 25000; // Cloudflare corta las conexiones sin tráfico a los ~100 s

const clients = new Map(); // userId → Set de respuestas abiertas

export function subscribe(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform', // que Cloudflare no la comprima ni la retenga
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // que ningún proxy retenga los avisos
  });
  res.write('retry: 3000\n\n');

  const userId = req.user.id;
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    const set = clients.get(userId);
    set?.delete(res);
    if (set?.size === 0) clients.delete(userId);
  });
}

// Avisa a los usuarios indicados (los que estén conectados) que pasó algo.
// type: 'group' | 'notification' | 'friends'; data: solo identificadores.
export function publish(userIds, type, data = {}) {
  const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const userId of new Set(userIds)) {
    for (const res of clients.get(userId) || []) {
      try {
        res.write(message);
      } catch {
        // la conexión se cerró: se limpia en el 'close'
      }
    }
  }
}
