# 🤫 Whispr Chat

匿名随机聊天平台。随机匹配陌生人，匿名畅聊。

## 技术栈

- **后端**: Fastify + WebSocket + better-sqlite3
- **前端**: Vue 3 + Vite
- **数据库**: SQLite（聊天记录保留 7 天，自动清理）

## 功能

- 🎲 随机匹配聊天对象
- 💬 实时消息（WebSocket）
- 🎭 随机昵称
- 🕐 聊天记录保留 7 天
- 🌙 深色主题

## 快速开始

```bash
# 安装依赖
npm install

# 构建前端
npm run build

# 启动服务
npm start
```

服务默认运行在 `http://localhost:3847`

## 开发模式

```bash
# 终端 1: 启动后端
npm run dev:backend

# 终端 2: 启动前端开发服务器
npm run dev:frontend
```

## 部署

```bash
npm run build
npm start
```

用 systemd 或 pm2 保持进程运行即可。

## License

MIT
