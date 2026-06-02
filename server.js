const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;
const POSTS_FILE = path.join(__dirname, 'posts.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function loadPosts() {
  try {
    if (fs.existsSync(POSTS_FILE)) {
      return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading posts:', e.message);
  }
  return [];
}

function savePosts(posts) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf-8');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function saveImage(imageDataUrl) {
  if (!imageDataUrl || typeof imageDataUrl !== 'string') return null;
  const match = imageDataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) return null; // 5MB limit
  const filename = generateId() + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return 'uploads/' + filename;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // API: GET /api/posts
  if (req.method === 'GET' && pathname === '/api/posts') {
    const posts = loadPosts();
    posts.reverse();
    return jsonResponse(res, 200, posts);
  }

  // API: POST /api/posts - create new post
  if (req.method === 'POST' && pathname === '/api/posts') {
    try {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      const content = (body.content || '').trim();
      if (!name) return jsonResponse(res, 400, { error: '请填写名字。' });
      if (!content) return jsonResponse(res, 400, { error: '内容不能为空。' });

      const posts = loadPosts();
      const imageUrl = saveImage(body.image);
      const newPost = {
        id: generateId(),
        name,
        content,
        image: imageUrl,
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

  // API: POST /api/posts/:id/reply - reply to a post
  if (req.method === 'POST' && pathname.match(/^\/api\/posts\/[^/]+\/reply$/)) {
    const postId = pathname.split('/')[3];
    try {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      const content = (body.content || '').trim();
      if (!name) return jsonResponse(res, 400, { error: '请填写名字。' });
      if (!content) return jsonResponse(res, 400, { error: '回复内容不能为空。' });

      const posts = loadPosts();
      const post = posts.find(p => p.id === postId);
      if (!post) return jsonResponse(res, 404, { error: '帖子不存在。' });

      if (!post.replies) post.replies = [];
      const imageUrl = saveImage(body.image);
      const reply = {
        id: generateId(),
        name,
        content,
        image: imageUrl,
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

  // API: POST /api/posts/:id/like
  if (req.method === 'POST' && pathname.match(/^\/api\/posts\/[^/]+\/like$/)) {
    const postId = pathname.split('/')[3];
    const posts = loadPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return jsonResponse(res, 404, { error: '帖子不存在。' });
    post.likes = (post.likes || 0) + 1;
    savePosts(posts);
    return jsonResponse(res, 200, { likes: post.likes });
  }

  // API: POST /api/posts/:id/unlike
  if (req.method === 'POST' && pathname.match(/^\/api\/posts\/[^/]+\/unlike$/)) {
    const postId = pathname.split('/')[3];
    const posts = loadPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return jsonResponse(res, 404, { error: '帖子不存在。' });
    post.likes = Math.max(0, (post.likes || 0) - 1);
    savePosts(posts);
    return jsonResponse(res, 200, { likes: post.likes });
  }

  // API: POST /api/posts/:id/reply/:replyId/like
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

  // API: POST /api/posts/:id/reply/:replyId/unlike
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

  // API: DELETE /api/posts/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/posts/')) {
    const id = pathname.slice('/api/posts/'.length);
    const posts = loadPosts();
    const index = posts.findIndex(p => p.id === id);
    if (index === -1) return jsonResponse(res, 404, { error: '帖子不存在。' });
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
