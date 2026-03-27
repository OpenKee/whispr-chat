const http = require('http');
const https = require('https');

// Cache: ip -> { city, expires }
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of cache) {
    if (now > entry.expires) cache.delete(ip);
  }
}, 60 * 60 * 1000);

// English city name -> Chinese mapping
const CITY_MAP = {
  'Beijing': '北京', 'Shanghai': '上海', 'Guangzhou': '广州', 'Shenzhen': '深圳',
  'Chengdu': '成都', 'Hangzhou': '杭州', 'Wuhan': '武汉', 'Nanjing': '南京',
  'Chongqing': '重庆', 'Tianjin': '天津', 'Suzhou': '苏州', 'Xi\'an': '西安',
  'Changsha': '长沙', 'Zhengzhou': '郑州', 'Dongguan': '东莞', 'Qingdao': '青岛',
  'Shenyang': '沈阳', 'Ningbo': '宁波', 'Kunming': '昆明', 'Dalian': '大连',
  'Xiamen': '厦门', 'Hefei': '合肥', 'Foshan': '佛山', 'Fuzhou': '福州',
  'Harbin': '哈尔滨', 'Jinan': '济南', 'Wenzhou': '温州', 'Changchun': '长春',
  'Shijiazhuang': '石家庄', 'Guiyang': '贵阳', 'Nanchang': '南昌', 'Nanning': '南宁',
  'Taipei': '台北', 'Hong Kong': '香港', 'Macau': '澳门', 'Lanzhou': '兰州',
  'Urumqi': '乌鲁木齐', 'Hohhot': '呼和浩特', 'Yinchuan': '银川', 'Xining': '西宁',
  'Lhasa': '拉萨', 'Haikou': '海口', 'Sanya': '三亚', 'Baoding': '保定',
  'Tangshan': '唐山', 'Wuxi': '无锡', 'Changzhou': '常州', 'Nantong': '南通',
  'Xuzhou': '徐州', 'Yangzhou': '扬州', 'Zhenjiang': '镇江', 'Yantai': '烟台',
  'Weifang': '潍坊', 'Zibo': '淄博', 'Linyi': '临沂', 'Huizhou': '惠州',
  'Zhuhai': '珠海', 'Zhongshan': '中山', 'Shantou': '汕头', 'Zhanjiang': '湛江',
  'Jiangmen': '江门', 'Maoming': '茂名', 'Zhaoqing': '肇庆', 'Liuzhou': '柳州',
  'Guilin': '桂林', 'Suzhou': '苏州', 'Taizhou': '台州', 'Jiaxing': '嘉兴',
  'Huzhou': '湖州', 'Shaoxing': '绍兴', 'Jinhua': '金华', 'Yiwu': '义乌',
  'Quanzhou': '泉州', 'Zhangzhou': '漳州', 'Putian': '莆田', 'Longyan': '龙岩',
  'Ningde': '宁德', 'Nanping': '南平', 'Sanming': '三明', 'Anshan': '鞍山',
  'Fushun': '抚顺', 'Benxi': '本溪', 'Dandong': '丹东', 'Jinzhou': '锦州',
  'Yingkou': '营口', 'Panjin': '盘锦', 'Liaoyang': '辽阳', 'Huludao': '葫芦岛',
  'Jilin': '吉林', 'Daqing': '大庆', 'Qiqihar': '齐齐哈尔', 'Mudanjiang': '牡丹江',
  'Jiamusi': '佳木斯', 'Hegang': '鹤岗', 'Shuangyashan': '双鸭山',
  'Baotou': '包头', 'Ordos': '鄂尔多斯', 'Chifeng': '赤峰', 'Tongliao': '通辽',
  'Zunyi': '遵义', 'Liupanshui': '六盘水', 'Anshun': '安顺',
  'Kashi': '喀什', 'Yili': '伊犁', 'Aksu': '阿克苏',
};

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

  // Try ip-api first, verify with ip.sb if result looks like a district
  return fetchFromIpApi(ip).then(city => {
    if (city) {
      cache.set(ip, { city, expires: Date.now() + CACHE_TTL });
      return city;
    }
    // Fallback to ip.sb
    return fetchFromIpSb(ip).then(city => {
      if (city) {
        cache.set(ip, { city, expires: Date.now() + CACHE_TTL });
      }
      return city || '';
    });
  });
}

function isDistrictName(name) {
  // Check if it looks like a district/street name rather than a city
  const suffix = /区$|县$|镇$|街道$|乡$|园$|村$|路$|大道$|街$/;
  return suffix.test(name) && !name.endsWith('市');
}

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
            // 先判断是否区县级，再加后缀
            if (isDistrictName(city)) {
              resolve(''); // 让 ip.sb 兜底
              return;
            }
            city = city.replace(/市$/, '');
            if (city) city += '市';
            resolve(city);
          } else {
            resolve('');
          }
        } catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function fetchFromIpSb(ip) {
  return new Promise((resolve) => {
    const url = `https://api.ip.sb/geoip/${ip}`;
    const req = https.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          let city = json.city || '';
          // Translate to Chinese if mapping exists
          city = CITY_MAP[city] || city;
          city = city.replace(/市$/, '');
          if (city) city += '市';
          resolve(city);
        } catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

module.exports = { getCity };
