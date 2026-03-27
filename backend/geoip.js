const https = require('https');
const http = require('http');

// Cache: ip -> { city, expires }
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Clean expired cache entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of cache) {
    if (now > entry.expires) cache.delete(ip);
  }
}, 60 * 60 * 1000);

function getCity(ip) {
  // Skip private/local IPs
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return Promise.resolve('本地');
  }

  // Remove ::ffff: prefix for IPv4-mapped IPv6
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  // Check cache
  const cached = cache.get(ip);
  if (cached && Date.now() < cached.expires) {
    return Promise.resolve(cached.city);
  }

  return new Promise((resolve) => {
    const url = `http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,city,regionName`;

    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success') {
            let city = json.city || '';
            // 过滤区/县/镇/街道级地名，用 regionName（城市级）兜底
            const isDistrict = /区$|县$|镇$|街道$|乡$/.test(city);
            if (isDistrict && json.regionName) {
              city = json.regionName;
            }
            // 统一加 "市" 后缀
            city = city.replace(/市$/, '');
            if (city) city += '市';
            cache.set(ip, { city, expires: Date.now() + CACHE_TTL });
            resolve(city);
          } else {
            resolve('');
          }
        } catch {
          resolve('');
        }
      });
    });

    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

module.exports = { getCity };
