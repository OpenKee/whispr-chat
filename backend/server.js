const fastify = require('fastify')({ logger: false });
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { customAlphabet } = require('nanoid');
const { Matcher } = require('./matcher');
const { saveMessage, getMessages, cleanup } = require('./db');
const { getCity } = require('./geoip');

const PORT = process.env.PORT || 80;
const matcher = new Matcher();
const generateImageId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
const IMAGES_DIR = path.join(__dirname, '..', 'data', 'images');

fs.mkdirSync(IMAGES_DIR, { recursive: true });

// Allowed image types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

async function start() {
  // WebSocket plugin
  await fastify.register(require('@fastify/websocket'));

  // Multipart support
  await fastify.register(require('@fastify/multipart'), {
    limits: { fileSize: MAX_SIZE, files: 1 }
  });

  // Serve frontend build
  await fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, '..', 'frontend', 'dist'),
    prefix: '/'
  });

  // Serve images
  await fastify.register(require('@fastify/static'), {
    root: IMAGES_DIR,
    prefix: '/images/',
    decorateReply: false
  });

  // Upload endpoint
  fastify.post('/api/upload', async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: '没有文件' });
    }

    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return reply.code(400).send({ error: '不支持的图片格式' });
    }

    const ext = file.mimetype.split('/')[1] === 'jpeg' ? 'jpg' : file.mimetype.split('/')[1];
    const id = generateImageId();
    const filename = id + '.' + ext;
    const filepath = path.join(IMAGES_DIR, filename);
    const compressedName = id + '_c.webp';
    const compressedPath = path.join(IMAGES_DIR, compressedName);

    const buffer = await file.toBuffer();

    if (buffer.length > MAX_SIZE) {
      return reply.code(400).send({ error: '图片太大，最大 20MB' });
    }

    // Save original
    await fs.promises.writeFile(filepath, buffer);

    // Generate compressed version (max 1280px wide, quality 75, webp)
    try {
      await sharp(buffer)
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(compressedPath);
    } catch (err) {
      console.error('[compress] Failed:', err.message);
      // Fallback: use original as compressed
      await fs.promises.copyFile(filepath, compressedPath);
    }

    return { url: '/images/' + filename, compressed: '/images/' + compressedName };
  });

  // WebSocket endpoint
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      const ws = connection;
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

      ws.on('message', async (raw) => {
        try {
          const data = JSON.parse(raw.toString());

          switch (data.type) {
            case 'join': {
              const city = await getCity(ip);
              const result = matcher.addClient(ws, data.clientId, data.gender, data.age, city);
              if (result.matched) {
                console.log(`[match] ${result.nickname} (${city})`);
              } else {
                console.log(`[queue] ${result.nickname} (${city}) waiting...`);
              }
              break;
            }

            case 'message': {
              const client = matcher.clients.get(ws);
              if (client && client.roomId && data.content?.trim()) {
                saveMessage(client.roomId, client.nickname, data.content.trim());
                matcher.handleMessage(ws, data);
              }
              break;
            }

            case 'image': {
              const client = matcher.clients.get(ws);
              if (client && client.roomId && data.url) {
                saveMessage(client.roomId, client.nickname, '', data.compressed || data.url);
                matcher.handleMessage(ws, {
                  type: 'message',
                  content: '',
                  imageUrl: data.compressed || data.url
                });
              }
              break;
            }

            case 'typing': {
              matcher.handleTyping(ws, data.isTyping);
              break;
            }

            case 'leave': {
              const client = matcher.handleDisconnect(ws, true);
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
        const client = matcher.handleDisconnect(ws, false);
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

  // Cleanup old messages and images every hour
  cleanup();
  setInterval(() => {
    cleanup();
    cleanupOldImages();
  }, 60 * 60 * 1000);
}

// Delete images older than 7 days
function cleanupOldImages() {
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  try {
    const files = fs.readdirSync(IMAGES_DIR);
    let count = 0;
    for (const file of files) {
      const fp = path.join(IMAGES_DIR, file);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(fp);
        count++;
      }
    }
    if (count > 0) console.log(`[cleanup] Removed ${count} old images`);
  } catch {}
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
