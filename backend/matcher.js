const { customAlphabet } = require('nanoid');

// Short room IDs
const generateRoomId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

// Nickname components
const adjectives = [
  '快乐的', '安静的', '神秘的', '勇敢的', '温柔的', '酷酷的',
  '懒懒的', '闪闪的', '萌萌的', '酷酷的', '酷酷的', '神秘的',
  'Quick', 'Silent', 'Brave', 'Calm', 'Wild', 'Cool',
  'Lucky', 'Happy', 'Sleepy', 'Clever', 'Gentle', 'Bold'
];

const nouns = [
  '猫', '狗', '兔', '狐', '鹿', '鲸', '鹤', '鹰',
  '星', '月', '风', '云', '雪', '雨', '露', '霜',
  'Cat', 'Dog', 'Fox', 'Wolf', 'Bear', 'Owl', 'Deer', 'Hare'
];

function generateNickname() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return adj + noun + num;
}

class Matcher {
  constructor() {
    // Map: ws -> { clientId, nickname, partner, roomId, joinedAt }
    this.clients = new Map();
    // Queue of waiting ws connections
    this.waitingQueue = [];
    // Recently disconnected: clientId -> { partnerWs, roomId, nickname, timer }
    this.recentlyDisconnected = new Map();
  }

  // Add a client and try to match
  addClient(ws, clientId, gender, age, city) {
    // Check if this client was recently in a room — try to reconnect
    if (clientId && this.recentlyDisconnected.has(clientId)) {
      const recent = this.recentlyDisconnected.get(clientId);
      clearTimeout(recent.timer);
      this.recentlyDisconnected.delete(clientId);

      // Check if partner is still connected
      if (recent.partnerWs && recent.partnerWs.readyState === 1) {
        const partnerInfo = this.clients.get(recent.partnerWs);
        if (partnerInfo) {
          // Rejoin the same room!
          const clientInfo = {
            ws,
            clientId,
            nickname: recent.nickname,
            gender: recent.gender || '',
            age: recent.age || '',
            city: recent.city || '',
            partner: recent.partnerWs,
            roomId: recent.roomId,
            joinedAt: Date.now()
          };
          this.clients.set(ws, clientInfo);
          partnerInfo.partner = ws;

          this.send(ws, {
            type: 'matched',
            nickname: recent.nickname,
            partnerNickname: partnerInfo.nickname,
            partnerGender: partnerInfo.gender || '',
            partnerAge: partnerInfo.age || '',
            partnerCity: partnerInfo.city || '',
            roomId: recent.roomId
          });

          this.send(recent.partnerWs, {
            type: 'partner_reconnected'
          });

          return { matched: true, ...clientInfo };
        }
      }
    }

    const nickname = generateNickname();
    const clientInfo = {
      ws,
      clientId: clientId || null,
      nickname,
      gender: gender || '',
      age: age || '',
      city: city || '',
      partner: null,
      roomId: null,
      joinedAt: Date.now()
    };

    this.clients.set(ws, clientInfo);

    // Try to find a match
    if (this.waitingQueue.length > 0) {
      // Remove stale entries (older than 60s)
      this.cleanQueue();

      if (this.waitingQueue.length > 0) {
        const partnerWs = this.waitingQueue.shift();
        const partnerInfo = this.clients.get(partnerWs);

        if (partnerInfo && partnerInfo.ws.readyState === 1) {
          this.pair(clientInfo, partnerInfo);
          return { matched: true, ...clientInfo };
        }
      }
    }

    // No match, add to queue
    this.waitingQueue.push(ws);
    return { matched: false, nickname };
  }

  pair(a, b) {
    const roomId = generateRoomId();
    a.partner = b.ws;
    b.partner = a.ws;
    a.roomId = roomId;
    b.roomId = roomId;

    // Notify both
    this.send(a.ws, {
      type: 'matched',
      nickname: a.nickname,
      partnerNickname: b.nickname,
      partnerGender: b.gender || '',
      partnerAge: b.age || '',
      partnerCity: b.city || '',
      roomId
    });

    this.send(b.ws, {
      type: 'matched',
      nickname: b.nickname,
      partnerNickname: a.nickname,
      partnerGender: a.gender || '',
      partnerAge: a.age || '',
      partnerCity: a.city || '',
      roomId
    });
  }

  // Handle incoming message
  handleMessage(ws, data) {
    const client = this.clients.get(ws);
    if (!client || !client.partner) return;

    const partnerInfo = this.clients.get(client.partner);
    if (!partnerInfo || partnerInfo.ws.readyState !== 1) {
      this.handleDisconnect(ws);
      return;
    }

    const payload = {
      type: 'message',
      content: data.content || '',
      nickname: client.nickname,
      timestamp: Date.now()
    };
    if (data.imageUrl) payload.imageUrl = data.imageUrl;

    this.send(client.partner, payload);
  }

  // Handle typing indicator
  handleTyping(ws, isTyping) {
    const client = this.clients.get(ws);
    if (!client || !client.partner) return;
    const partnerInfo = this.clients.get(client.partner);
    if (!partnerInfo || partnerInfo.ws.readyState !== 1) return;
    this.send(client.partner, { type: 'typing', isTyping: !!isTyping });
  }

  // Handle disconnect / leave
  handleDisconnect(ws, isLeave = false) {
    const client = this.clients.get(ws);
    if (!client) return;

    // Remove from waiting queue
    this.waitingQueue = this.waitingQueue.filter(w => w !== ws);

    if (client.partner && !isLeave && client.clientId) {
      // Grace period: give 8 seconds to reconnect
      const partnerWs = client.partner;
      const roomId = client.roomId;
      const nickname = client.nickname;
      const clientId = client.clientId;
      const gender = client.gender;
      const age = client.age;
      const city = client.city;

      const timer = setTimeout(() => {
        this.recentlyDisconnected.delete(clientId);
        // Now actually notify partner
        const partnerInfo = this.clients.get(partnerWs);
        if (partnerInfo) {
          partnerInfo.partner = null;
          partnerInfo.roomId = null;
          this.send(partnerWs, { type: 'partner_left' });
        }
      }, 8000);

      this.recentlyDisconnected.set(clientId, {
        partnerWs, roomId, nickname, gender, age, city, timer
      });
    } else if (client.partner) {
      // Explicit leave or no clientId — notify immediately
      const partnerInfo = this.clients.get(client.partner);
      if (partnerInfo) {
        partnerInfo.partner = null;
        partnerInfo.roomId = null;
        this.send(client.partner, { type: 'partner_left' });
      }
    }

    this.clients.delete(ws);
    return client;
  }

  // Send JSON message
  send(ws, data) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }

  // Clean stale entries from queue
  cleanQueue() {
    const now = Date.now();
    this.waitingQueue = this.waitingQueue.filter(ws => {
      const client = this.clients.get(ws);
      if (!client) return false;
      if (now - client.joinedAt > 60000) {
        this.send(ws, { type: 'timeout' });
        return false;
      }
      return ws.readyState === 1;
    });
  }

  get onlineCount() {
    return this.clients.size;
  }

  get waitingCount() {
    return this.waitingQueue.length;
  }
}

module.exports = { Matcher, generateNickname };
