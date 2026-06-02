const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;
const POSTS_FILE = path.join(__dirname, 'posts.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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

function saveImage(imageDataUrl) {
  if (!imageDataUrl || typeof imageDataUrl !== 'string') return null;
  const match = imageDataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) return null;
  const filename = generateId() + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return 'uploads/' + filename;
}

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
};

function serveStatic(url, res) {
  const filePath = path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
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

  // POST /api/auth/register
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    try {
      const body = await readBody(req);
      const phone = (body.phone || '').trim();
      const username = (body.username || '').trim();
      const password = body.password || '';

      if (!validatePhone(phone))
        return jsonResponse(res, 400, { error: '请输入正确的手机号（11位）。' });
      if (!username || username.length < 1 || username.length > 16)
        return jsonResponse(res, 400, { error: '用户名需1-16个字符。' });
      if (password.length < 4)
        return jsonResponse(res, 400, { error: '密码至少4位。' });

      const users = loadUsers();
      if (users.find(u => u.phone === phone))
        return jsonResponse(res, 400, { error: '该手机号已注册，请登录。' });

      const newUser = {
        phone,
        username,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
      };
      users.push(newUser);
      saveUsers(users);

      // Auto-login: create session
      const token = generateToken();
      const sessions = loadSessions();
      sessions[token] = { phone, createdAt: new Date().toISOString() };
      saveSessions(sessions);

      return jsonResponse(res, 201, { token, user: { phone, username } });
    } catch (e) {
      return jsonResponse(res, 400, { error: '请求格式错误。' });
    }
  }

  // POST /api/auth/login
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    try {
      const body = await readBody(req);
      const phone = (body.phone || '').trim();
      const password = body.password || '';

      if (!validatePhone(phone))
        return jsonResponse(res, 400, { error: '请输入正确的手机号。' });
      if (!password)
        return jsonResponse(res, 400, { error: '请输入密码。' });

      const users = loadUsers();
      const user = users.find(u => u.phone === phone && u.passwordHash === hashPassword(password));
      if (!user)
        return jsonResponse(res, 401, { error: '手机号或密码错误。' });

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
      username: user.username,
      createdAt: user.createdAt,
      stats: {
        postCount: userPosts.length,
        replyCount,
        totalLikes
      }
    });
  }


  // ======== FORUM API (all require auth) ========

  // GET /api/posts
  if (req.method === 'GET' && pathname === '/api/posts') {
    const user = authRequired(req, res);
    if (!user) return;
    const posts = loadPosts();
    posts.reverse();
    return jsonResponse(res, 200, posts);
  }

  // POST /api/posts - create new post (name comes from auth)
  if (req.method === 'POST' && pathname === '/api/posts') {
    const user = authRequired(req, res);
    if (!user) return;
    try {
      const body = await readBody(req);
      const content = (body.content || '').trim();
      if (!content) return jsonResponse(res, 400, { error: '内容不能为空。' });

      const posts = loadPosts();
      const newPost = {
        id: generateId(),
        name: user.username,
        phone: user.phone,
        content,
        image: saveImage(body.image),
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
    const user = authRequired(req, res);
    if (!user) return;
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
        name: user.username,
        phone: user.phone,
        content,
        image: saveImage(body.image),
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
    const user = authRequired(req, res);
    if (!user) return;
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
    const user = authRequired(req, res);
    if (!user) return;
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
    const user = authRequired(req, res);
    if (!user) return;
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
    const user = authRequired(req, res);
    if (!user) return;
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
    const user = authRequired(req, res);
    if (!user) return;
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
