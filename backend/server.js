const fastify = require('fastify')({ logger: false });
const path = require('path');
const { Matcher } = require('./matcher');
const { saveMessage, getMessages, cleanup } = require('./db');

const PORT = process.env.PORT || 80;
const matcher = new Matcher();

async function start() {
  // WebSocket plugin
  await fastify.register(require('@fastify/websocket'));

  // Serve frontend build
  await fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, '..', 'frontend', 'dist'),
    prefix: '/'
  });

  // WebSocket endpoint
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      const ws = connection;

      ws.on('message', (raw) => {
        try {
          const data = JSON.parse(raw.toString());

          switch (data.type) {
            case 'join': {
              const result = matcher.addClient(ws);
              if (result.matched) {
                console.log(`[match] ${result.nickname} ↔ ${result.partner ? 'partner' : '?'}`);
              } else {
                console.log(`[queue] ${result.nickname} waiting... (${matcher.waitingCount} in queue)`);
              }
              break;
            }

            case 'message': {
              const client = matcher.clients.get(ws);
              if (client && client.roomId && data.content?.trim()) {
                // Save to DB
                saveMessage(client.roomId, client.nickname, data.content.trim());
                // Forward to partner
                matcher.handleMessage(ws, data);
              }
              break;
            }

            case 'leave': {
              const client = matcher.handleDisconnect(ws);
              if (client) console.log(`[leave] ${client.nickname}`);
              break;
            }

            case 'history': {
              const client = matcher.clients.get(ws);
              if (client?.roomId) {
                const messages = getMessages(client.roomId);
                matcher.send(ws, { type: 'history', messages });
              }
              break;
            }
          }
        } catch (err) {
          console.error('[ws] Error:', err.message);
        }
      });

      ws.on('close', () => {
        const client = matcher.handleDisconnect(ws);
        if (client) console.log(`[disconnect] ${client.nickname}`);
      });

      ws.on('error', () => {
        matcher.handleDisconnect(ws);
      });
    });
  });

  // API: stats
  fastify.get('/api/stats', async () => ({
    online: matcher.onlineCount,
    waiting: matcher.waitingCount
  }));

  // Fallback to index.html for SPA routing
  fastify.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
      reply.code(404).send({ error: 'Not found' });
    } else {
      reply.sendFile('index.html');
    }
  });

  // Start server
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`\n🦞 Whispr Chat running at http://0.0.0.0:${PORT}`);
  console.log(`   WebSocket: ws://0.0.0.0:${PORT}/ws\n`);

  // Cleanup old messages every hour
  cleanup();
  setInterval(() => cleanup(), 60 * 60 * 1000);
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
