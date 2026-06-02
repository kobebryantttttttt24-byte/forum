const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;
const POSTS_FILE = path.join(__dirname, 'posts.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const { sendSMS } = require('./lib/sms');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// In-memory verification codes (phone -> { code, expiresAt })

const CATEGORIES = [
  { id: 'sports', name: '运动健身', icon: '🏃' },
  { id: 'entertainment', name: '影音文娱', icon: '🎬' },
  { id: 'crafts', name: '手工创作', icon: '🎨' },
  { id: 'reading', name: '读书写作', icon: '📚' },
  { id: 'cooking', name: '美食烹饪', icon: '🍳' },
  { id: 'travel', name: '户外旅行', icon: '✈️' },
  { id: 'games', name: '棋牌桌游', icon: '🎲' },
  { id: 'tech', name: '数码电竞', icon: '💻' },
  { id: 'arts', name: '书画乐器', icon: '🎵' },
  { id: 'pets', name: '养花萌宠', icon: '🐱' },
];

const verificationCodes = {};
setInterval(() => {
  const now = Date.now();
  for (const phone of Object.keys(verificationCodes)) {
    if (verificationCodes[phone].expiresAt < now) delete verificationCodes[phone];
  }
}, 30000);

// ---- Data helpers ----

function loadJSON(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) { console.error('Error loading', file, e.message); }
  return file.endsWith('sessions.json') ? {} : [];
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function loadPosts() { return loadJSON(POSTS_FILE); }
function savePosts(p) { saveJSON(POSTS_FILE, p); }
function loadUsers() { return loadJSON(USERS_FILE); }
function saveUsers(u) { saveJSON(USERS_FILE, u); }
function loadSessions() { return loadJSON(SESSIONS_FILE); }
function saveSessions(s) { saveJSON(SESSIONS_FILE, s); }

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ---- Image saving ----

function saveFile(dataUrl, allowedMatch, maxBytes) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(allowedMatch);
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > maxBytes) return null;
  const filename = generateId() + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return 'uploads/' + filename;
}
function saveImage(d) { return saveFile(d, /^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/, 5*1024*1024); }
function saveVideo(d) { return saveFile(d, /^data:video\/(mp4|webm|ogg);base64,(.+)$/, 15*1024*1024); }

// ---- Auth helpers ----

function getAuthUser(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const sessions = loadSessions();
  const session = sessions[token];
  if (!session) return null;
  const users = loadUsers();
  return users.find(u => u.phone === session.phone) || null;
}

function validatePhone(phone) {
  return /^1\d{10}$/.test(phone);
}

// ---- MIME ----

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
};

function serveStatic(url, res) {
  const filePath = path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      res.end(data);
    }
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function authRequired(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    jsonResponse(res, 401, { error: '请先登录。' });
    return null;
  }
  return user;
}

// ---- Server ----

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // ======== AUTH ENDPOINTS ========

  // POST /api/auth/send-code - send verification code
  if (req.method === 'POST' && pathname === '/api/auth/send-code') {
    try {
      const body = await readBody(req);
      const phone = (body.phone || '').trim();
      if (!validatePhone(phone))
        return jsonResponse(res, 400, { error: '请输入正确的11位手机号。' });

      const code = String(Math.floor(100000 + Math.random() * 900000));
      verificationCodes[phone] = { code, expiresAt: Date.now() + 300000 };

      // Send SMS via configured provider
      await sendSMS(phone, code);

      return jsonResponse(res, 200, { success: true, message: '验证码已发送到您的手机' });
    } catch (e) {
      return jsonResponse(res, 400, { error: '请求格式错误。' });
    }
  }

  // GET /api/auth/check-phone - check if phone is registered
  if (req.method === 'GET' && pathname === '/api/auth/check-phone') {
    const phone = (url.searchParams.get('phone') || '').trim();
    if (!validatePhone(phone))
      return jsonResponse(res, 400, { error: '请输入正确的手机号。' });
    const users = loadUsers();
    return jsonResponse(res, 200, { registered: !!users.find(u => u.phone === phone) });
  }

  // GET /api/categories
  if (req.method === 'GET' && pathname === '/api/categories') {
    return jsonResponse(res, 200, CATEGORIES);
  }

  // POST /api/auth/register - register with phone + code + username + optional password
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    try {
      const body = await readBody(req);
      const phone = (body.phone || '').trim();
      const vcode = (body.code || '').trim();
      const username = (body.username || '').trim();
      const password = body.password || '';

      if (!validatePhone(phone))
        return jsonResponse(res, 400, { error: '请输入正确的11位手机号。' });
      if (!username || username.length < 1 || username.length > 16)
        return jsonResponse(res, 400, { error: '用户名需1-16个字符。' });

      const saved = verificationCodes[phone];
      if (!saved) return jsonResponse(res, 400, { error: '请先获取验证码。' });
      if (saved.expiresAt < Date.now()) {
        delete verificationCodes[phone];
        return jsonResponse(res, 400, { error: '验证码已过期，请重新获取。' });
      }
      if (saved.code !== vcode)
        return jsonResponse(res, 400, { error: '验证码错误。' });
      delete verificationCodes[phone];

      const users = loadUsers();
      if (users.find(u => u.phone === phone))
        return jsonResponse(res, 400, { error: '该手机号已注册。' });

      const newUser = { phone, username, createdAt: new Date().toISOString() };
      if (password && password.length >= 4) {
        newUser.passwordHash = hashPassword(password);
      }
      users.push(newUser);
      saveUsers(users);

      const token = generateToken();
      const sessions = loadSessions();
      sessions[token] = { phone, createdAt: new Date().toISOString() };
      saveSessions(sessions);

      return jsonResponse(res, 201, { token, user: { phone, username } });
    } catch (e) {
      return jsonResponse(res, 400, { error: '请求格式错误。' });
    }
  }

  // POST /api/auth/login - unified login/register (phone + password, username for new users)
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    try {
      const body = await readBody(req);
      const phone = (body.phone || '').trim();
      const password = body.password || '';
      const username = (body.username || '').trim();

      if (!validatePhone(phone))
        return jsonResponse(res, 400, { error: '请输入正确的11位手机号。' });
      if (!password || password.length < 4)
        return jsonResponse(res, 400, { error: '密码至少4位。' });

      const users = loadUsers();
      let user = users.find(u => u.phone === phone);

      if (user) {
        // Existing user - verify password
        if (!user.passwordHash || user.passwordHash !== hashPassword(password))
          return jsonResponse(res, 401, { error: '密码错误。' });
      } else {
        // New user - create account
        if (!username)
          return jsonResponse(res, 400, { error: '新用户请填写昵称。' });
        user = {
          phone, username,
          passwordHash: hashPassword(password),
          createdAt: new Date().toISOString()
        };
        users.push(user);
        saveUsers(users);
      }

      const token = generateToken();
      const sessions = loadSessions();
      sessions[token] = { phone, createdAt: new Date().toISOString() };
      saveSessions(sessions);

      return jsonResponse(res, 200, { token, user: { phone: user.phone, username: user.username } });
    } catch (e) {
      return jsonResponse(res, 400, { error: '请求格式错误。' });
    }
  }

  // POST /api/auth/logout
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const sessions = loadSessions();
      delete sessions[token];
      saveSessions(sessions);
    }
    return jsonResponse(res, 200, { success: true });
  }

  // GET /api/auth/me
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const user = getAuthUser(req);
    if (!user) return jsonResponse(res, 401, { error: '未登录。' });
    return jsonResponse(res, 200, { phone: user.phone, username: user.username });
  }


  // GET /api/auth/profile
  if (req.method === 'GET' && pathname === '/api/auth/profile') {
    const user = authRequired(req, res);
    if (!user) return;

    const posts = loadPosts();
    const userPosts = posts.filter(p => p.phone === user.phone);
    let replyCount = 0, totalLikes = 0;

    for (const p of userPosts) {
      totalLikes += (p.likes || 0);
      for (const r of (p.replies || [])) {
        if (r.phone === user.phone) { replyCount++; totalLikes += (r.likes || 0); }
      }
    }

    return jsonResponse(res, 200, {
      phone: user.phone,
      username: (body.name || "").trim() || "匿名",
      createdAt: user.createdAt,
      stats: {
        postCount: userPosts.length,
        replyCount,
        totalLikes
      }
    });
  }


  // ======== FORUM API (all require auth) ========

  // GET /api/posts (optional ?category= filter)
  if (req.method === 'GET' && pathname === '/api/posts') {
    let posts = loadPosts();
    const cat = url.searchParams.get('category');
    if (cat) posts = posts.filter(p => p.category === cat);
    posts.reverse();
    return jsonResponse(res, 200, posts);
  }

  // POST /api/posts - create new post (name comes from auth)
  if (req.method === 'POST' && pathname === '/api/posts') {
    try {
      const body = await readBody(req);
      const content = (body.content || '').trim();
      if (!content) return jsonResponse(res, 400, { error: '内容不能为空。' });

      const posts = loadPosts();
      const newPost = {
        id: generateId(),
        name: (body.name || "").trim() || "匿名",
        phone: user.phone,
        content,
        category: body.category || '',
        image: saveImage(body.image),
        video: saveVideo(body.video),
        createdAt: new Date().toISOString(),
        replies: [],
        likes: 0
      };
      posts.push(newPost);
      savePosts(posts);
      return jsonResponse(res, 201, newPost);
    } catch (e) {
      return jsonResponse(res, 400, { error: '请求格式错误。' });
    }
  }

  // POST /api/posts/:id/reply
  if (req.method === 'POST' && pathname.match(/^\/api\/posts\/[^/]+\/reply$/)) {
    const postId = pathname.split('/')[3];
    try {
      const body = await readBody(req);
      const content = (body.content || '').trim();
      if (!content) return jsonResponse(res, 400, { error: '回复内容不能为空。' });

      const posts = loadPosts();
      const post = posts.find(p => p.id === postId);
      if (!post) return jsonResponse(res, 404, { error: '帖子不存在。' });

      if (!post.replies) post.replies = [];
      const reply = {
        id: generateId(),
        name: (body.name || "").trim() || "匿名",
        phone: user.phone,
        content,
        image: saveImage(body.image),
        video: saveVideo(body.video),
        video: saveVideo(body.video),
        createdAt: new Date().toISOString(),
        likes: 0
      };
      post.replies.push(reply);
      savePosts(posts);
      return jsonResponse(res, 201, reply);
    } catch (e) {
      return jsonResponse(res, 400, { error: '请求格式错误。' });
    }
  }

  // POST /api/posts/:id/like
  if (req.method === 'POST' && pathname.match(/^\/api\/posts\/[^/]+\/like$/)) {
    const postId = pathname.split('/')[3];
    const posts = loadPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return jsonResponse(res, 404, { error: '帖子不存在。' });
    post.likes = (post.likes || 0) + 1;
    savePosts(posts);
    return jsonResponse(res, 200, { likes: post.likes });
  }

  // POST /api/posts/:id/unlike
  if (req.method === 'POST' && pathname.match(/^\/api\/posts\/[^/]+\/unlike$/)) {
    const postId = pathname.split('/')[3];
    const posts = loadPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return jsonResponse(res, 404, { error: '帖子不存在。' });
    post.likes = Math.max(0, (post.likes || 0) - 1);
    savePosts(posts);
    return jsonResponse(res, 200, { likes: post.likes });
  }

  // POST /api/posts/:id/reply/:replyId/like
  if (req.method === 'POST' && pathname.match(/^\/api\/posts\/[^/]+\/reply\/[^/]+\/like$/)) {
    const parts = pathname.split('/');
    const postId = parts[3], replyId = parts[5];
    const posts = loadPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return jsonResponse(res, 404, { error: '帖子不存在。' });
    const reply = (post.replies || []).find(r => r.id === replyId);
    if (!reply) return jsonResponse(res, 404, { error: '回复不存在。' });
    reply.likes = (reply.likes || 0) + 1;
    savePosts(posts);
    return jsonResponse(res, 200, { likes: reply.likes });
  }

  // POST /api/posts/:id/reply/:replyId/unlike
  if (req.method === 'POST' && pathname.match(/^\/api\/posts\/[^/]+\/reply\/[^/]+\/unlike$/)) {
    const parts = pathname.split('/');
    const postId = parts[3], replyId = parts[5];
    const posts = loadPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return jsonResponse(res, 404, { error: '帖子不存在。' });
    const reply = (post.replies || []).find(r => r.id === replyId);
    if (!reply) return jsonResponse(res, 404, { error: '回复不存在。' });
    reply.likes = Math.max(0, (reply.likes || 0) - 1);
    savePosts(posts);
    return jsonResponse(res, 200, { likes: reply.likes });
  }

  // DELETE /api/posts/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/posts/')) {
    const id = pathname.slice('/api/posts/'.length);
    const posts = loadPosts();
    const index = posts.findIndex(p => p.id === id);
    if (index === -1) return jsonResponse(res, 404, { error: '帖子不存在。' });
    // Only the poster or anyone can delete (simple forum)
    posts.splice(index, 1);
    savePosts(posts);
    return jsonResponse(res, 200, { success: true });
  }

  // Static files
  serveStatic(pathname === '/' ? '/index.html' : pathname, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Forum server running at http://0.0.0.0:${PORT}`);
});
