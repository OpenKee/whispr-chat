const fastify = require('fastify')({ logger: false });
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { customAlphabet } = require('nanoid');
const { Matcher } = require('./matcher');
const { db, saveMessage, getMessages, cleanup, addVisit, getAnalyticsSummary, addReport, getReports, getReportCount, banIp, isIpBanned, unbanIp, getBannedIps, getBanCount } = require('./db');
const { getCity } = require('./geoip');

const PORT = process.env.PORT || 3847;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'whispr-admin-' + require('crypto').randomBytes(16).toString('hex');
const matcher = new Matcher();
const generateImageId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
const IMAGES_DIR = path.join(__dirname, '..', 'data', 'images');

fs.mkdirSync(IMAGES_DIR, { recursive: true });

// Allowed image types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

// Upload rate limit: max 10 uploads per IP per minute
const uploadLimiter = new Map();
const UPLOAD_LIMIT = 10;
const UPLOAD_WINDOW = 60 * 1000;

function checkUploadLimit(ip) {
  const now = Date.now();
  let record = uploadLimiter.get(ip);
  if (!record || now - record.start > UPLOAD_WINDOW) {
    record = { count: 1, start: now };
    uploadLimiter.set(ip, record);
    return true;
  }
  record.count++;
  return record.count <= UPLOAD_LIMIT;
}

// Clean rate limiter every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of uploadLimiter) {
    if (now - record.start > UPLOAD_WINDOW) uploadLimiter.delete(ip);
  }
}, 5 * 60 * 1000);

function detectSource(referrer = '') {
  const value = String(referrer || '').toLowerCase();
  if (!value) return 'direct';
  if (value.includes('baidu.')) return 'baidu';
  if (value.includes('bing.')) return 'bing';
  if (value.includes('google.')) return 'google';
  if (value.includes('sogou.')) return 'sogou';
  if (value.includes('so.com') || value.includes('360.cn')) return '360';
  if (value.includes('sm.cn')) return 'sm';
  if (value.includes('douyin.')) return 'douyin';
  if (value.includes('xiaohongshu.') || value.includes('xhslink.')) return 'xiaohongshu';
  if (value.includes('github.')) return 'github';
  try { return new URL(referrer).hostname.replace(/^www\./, ''); } catch { return 'other'; }
}

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

  // Lightweight traffic analytics
  fastify.addHook('onResponse', async (req, reply) => {
    try {
      const pathname = (req.url || '').split('?')[0] || '/';
      if (req.method !== 'GET') return;
      if (reply.statusCode >= 400) return;
      if (pathname.startsWith('/api') || pathname.startsWith('/ws') || pathname.startsWith('/images/') || pathname.includes('.')) return;
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
      const referrer = req.headers.referer || req.headers.referrer || '';
      const userAgent = req.headers['user-agent'] || '';
      const city = await getCity(ip);
      addVisit(ip, pathname, referrer, detectSource(referrer), city, userAgent);
    } catch {}
  });

  // Upload endpoint
  fastify.post('/api/upload', async (req, reply) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

    if (!checkUploadLimit(ip)) {
      return reply.code(429).send({ error: '上传太频繁，请稍后再试' });
    }

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
              // Check IP ban
              if (isIpBanned(ip)) {
                ws.send(JSON.stringify({ type: 'banned' }));
                ws.close();
                return;
              }
              const city = await getCity(ip);
              console.log(`[join] ip=${ip} city=${city}`);
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
              const content = (data.content || '').trim();
              if (client && client.roomId && content && content.length <= 500) {
                saveMessage(client.roomId, client.nickname, content);
                matcher.handleMessage(ws, data);
              }
              break;
            }

            case 'image': {
              const client = matcher.clients.get(ws);
              const url = data.url || '';
              const compressed = data.compressed || url;
              if (client && client.roomId && url.startsWith('/images/') && compressed.startsWith('/images/')) {
                saveMessage(client.roomId, client.nickname, '', compressed);
                matcher.handleMessage(ws, {
                  type: 'message',
                  content: '',
                  imageUrl: compressed
                });
              }
              break;
            }

            case 'typing': {
              matcher.handleTyping(ws, data.isTyping);
              break;
            }

            case 'pong': {
              matcher.handlePong(ws);
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

  // API: traffic analytics
  fastify.get('/api/admin/analytics', async (req, reply) => {
    if (!checkAdmin(req)) return reply.code(401).send({ error: 'unauthorized' });
    return getAnalyticsSummary(7);
  });

  // Admin auth check
  function checkAdmin(req) {
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    return token === ADMIN_TOKEN;
  }

  // Admin page
  fastify.get('/admin', async (req, reply) => {
    return reply.type('text/html').send(fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8'));
  });

  // API: report
  fastify.post('/api/report', async (req, reply) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    const { roomId, reason } = req.body || {};
    if (!roomId) return reply.code(400).send({ error: 'missing roomId' });

    // Get messages snapshot
    const msgs = getMessages(roomId);
    const snapshot = msgs.slice(-20).map(m => `${m.nickname}: ${m.content || '[image]'}`).join('\n');

    // Find reporter and partner from matcher
    let reporter = '', partner = '';
    for (const [, client] of matcher.clients) {
      if (client.roomId === roomId) {
        partner = client.nickname;
      }
    }
    // The reporter is whoever is NOT in the room anymore (they left)
    for (const [ws2, client] of matcher.clients) {
      if (client.roomId === roomId) {
        partner = client.nickname;
      }
    }

    addReport(roomId, reporter, partner, reason, snapshot);
    console.log(`[report] room=${roomId} reason=${reason}`);

    // Cumulative auto-ban: 2h → 4h → 8h → ... max 24h
    if (partner && getReportCount(partner) >= 3) {
      const prevBans = getBanCount(ip);
      const duration = Math.min(7200 * Math.pow(2, prevBans), 86400);
      const hours = duration / 3600;
      banIp(ip, `Auto-ban (${hours}h): 3 reports in 24h (latest: ${reason})`, duration);
      console.log(`[auto-ban-${hours}h] ${partner} (${ip})`);
    }

    return { ok: true };
  });

  // API: admin - list reports
  fastify.get('/api/admin/reports', async (req, reply) => {
    if (!checkAdmin(req)) return reply.code(401).send({ error: 'unauthorized' });
    return getReports(100);
  });

  // API: admin - list bans
  fastify.get('/api/admin/bans', async (req, reply) => {
    if (!checkAdmin(req)) return reply.code(401).send({ error: 'unauthorized' });
    return getBannedIps();
  });

  // API: admin - ban IP
  fastify.post('/api/admin/ban', async (req, reply) => {
    if (!checkAdmin(req)) return reply.code(401).send({ error: 'unauthorized' });
    const { ip: targetIp, reason } = req.body || {};
    if (!targetIp) return reply.code(400).send({ error: 'missing ip' });
    banIp(targetIp, reason || 'Manual ban', null);
    // Disconnect if online
    for (const [ws2, client] of matcher.clients) {
      const clientIp = ws2._socket?.remoteAddress || '';
      if (clientIp === targetIp) {
        ws2.send(JSON.stringify({ type: 'banned' }));
        ws2.close();
      }
    }
    return { ok: true };
  });

  // API: admin - unban IP
  fastify.post('/api/admin/unban', async (req, reply) => {
    if (!checkAdmin(req)) return reply.code(401).send({ error: 'unauthorized' });
    const { ip: targetIp } = req.body || {};
    if (!targetIp) return reply.code(400).send({ error: 'missing ip' });
    unbanIp(targetIp);
    return { ok: true };
  });

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
  console.log(`   WebSocket: ws://0.0.0.0:${PORT}/ws`);
  console.log(`   Admin: http://0.0.0.0:${PORT}/admin`);
  console.log(`   Admin Token: ${ADMIN_TOKEN}\n`);

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
