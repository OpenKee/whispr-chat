const http = require('http');
const https = require('https');

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
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return Promise.resolve('本地');
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  const cached = cache.get(ip);
  if (cached && Date.now() < cached.expires) {
    return Promise.resolve(cached.city);
  }

  // Try pconline first (Chinese source, more accurate for CN IPs)
  return fetchFromPconline(ip).then(city => {
    if (city) {
      cache.set(ip, { city, expires: Date.now() + CACHE_TTL });
      return city;
    }
    // Fallback to ip-api
    return fetchFromIpApi(ip).then(city => {
      if (city) {
        cache.set(ip, { city, expires: Date.now() + CACHE_TTL });
      }
      return city || '';
    });
  });
}

// pconline.com.cn - reliable Chinese IP database
function fetchFromPconline(ip) {
  return new Promise((resolve) => {
    const url = `http://whois.pconline.com.cn/ipJson.jsp?ip=${ip}&json=true`;
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          // Response encoding is GBK, but city names are usually ASCII-safe
          const json = JSON.parse(data);
          // "pro": 省, "city": 市
          let city = json.city || json.pro || '';
          // "市" suffix normalization
          city = city.replace(/市$/, '');
          if (city) city += '市';
          resolve(city);
        } catch {
          resolve('');
        }
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

// ip-api.com fallback
function fetchFromIpApi(ip) {
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
            city = city.replace(/市$/, '');
            if (city) city += '市';
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
