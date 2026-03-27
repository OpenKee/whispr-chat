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
    // Map: ws -> { nickname, partner, roomId, joinedAt }
    this.clients = new Map();
    // Queue of waiting ws connections
    this.waitingQueue = [];
  }

  // Add a client and try to match
  addClient(ws) {
    const nickname = generateNickname();
    const clientInfo = {
      ws,
      nickname,
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
      roomId
    });

    this.send(b.ws, {
      type: 'matched',
      nickname: b.nickname,
      partnerNickname: a.nickname,
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

    this.send(client.partner, {
      type: 'message',
      content: data.content,
      nickname: client.nickname,
      timestamp: Date.now()
    });
  }

  // Handle disconnect / leave
  handleDisconnect(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    // Remove from waiting queue
    this.waitingQueue = this.waitingQueue.filter(w => w !== ws);

    // Notify partner
    if (client.partner) {
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
