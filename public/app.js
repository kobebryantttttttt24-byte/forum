const API = '/api/posts';
const AUTH_API = '/api/auth';

// ---- Auth State ----
let currentUser = null;
let authToken = null;

// DOM refs
const authScreen = document.getElementById('authScreen');
const forumApp = document.getElementById('forumApp');
const headerUsername = document.getElementById('headerUsername');

const form = document.getElementById('postForm');
const contentInput = document.getElementById('postContent');
const submitBtn = document.getElementById('submitBtn');
const postsList = document.getElementById('postsList');
const postCount = document.getElementById('postCount');
const charCount = document.getElementById('charCount');
const loading = document.getElementById('loadingIndicator');

// ---- Image upload state ----
let pendingPostImage = null;
let pendingPostVideo = null;

// ---- Auth Functions ----

let _currentPhone = '';
let _isRegistered = false;
let _codeTimer = null;
let _loginMode = 'code'; // 'code' or 'password'

function switchLoginMode(mode) {
  _loginMode = mode;
  document.getElementById('codeTab').classList.toggle('active', mode === 'code');
  document.getElementById('passwordTab').classList.toggle('active', mode === 'password');
  document.getElementById('codeInputGroup').style.display = mode === 'code' ? 'block' : 'none';
  document.getElementById('passwordInputGroup').style.display = mode === 'password' ? 'block' : 'none';
  document.getElementById('debugCode').style.display = 'none';
  // Only show send code button in code mode
  document.getElementById('sendCodeBtn').style.display = mode === 'code' ? 'inline-block' : 'none';
  // Reset
  document.getElementById('authError').textContent = '';
  document.getElementById('usernameStep').style.display = 'none';
  document.getElementById('authActionBtn').textContent = '登 录';
  document.getElementById('authHint').textContent = '一个手机号只能绑定一个账号';
  if (mode === 'code') {
    document.getElementById('codeInputGroup').innerHTML = '<div class="auth-field"><label>验证码</label><input type="text" id="authCode" placeholder="请输入6位验证码" maxlength="6" inputmode="numeric" pattern="[0-9]*"></div>';
  }
  if (_codeTimer) { clearInterval(_codeTimer); _codeTimer = null; }
  document.getElementById('sendCodeBtn').disabled = false;
  document.getElementById('sendCodeBtn').textContent = '获取验证码';
}

async function sendVerificationCode() {
  const phone = document.getElementById('authPhone').value.trim();
  const errorEl = document.getElementById('authError');
  const btn = document.getElementById('sendCodeBtn');

  if (!/^1\d{10}$/.test(phone)) { errorEl.textContent = '请输入正确的11位手机号。'; return; }
  errorEl.textContent = '';
  _currentPhone = phone;

  btn.disabled = true;
  btn.textContent = '发送中...';

  try {
    const res = await fetch(`${AUTH_API}/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error; btn.disabled = false; btn.textContent = '获取验证码'; return; }

    // Show debug code (demo mode)
    if (data._debug) {
      const debugEl = document.getElementById('debugCode');
      debugEl.textContent = '💡 验证码: ' + data._debug + '（测试模式）';
      debugEl.style.display = 'block';
    }

    // Check if phone is registered
    const checkRes = await fetch(`${AUTH_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code: data._debug || '' })
    });
    _isRegistered = checkRes.status !== 404;
    document.getElementById('usernameStep').style.display = _isRegistered ? 'none' : 'block';
    document.getElementById('authActionBtn').textContent = _isRegistered ? '登 录' : '注 册';
    document.getElementById('authHint').textContent = _isRegistered ? '该手机号已注册，输入验证码登录。' : '新用户，设置用户名后注册。';

    // Start countdown
    let sec = 60;
    btn.textContent = sec + 's';
    _codeTimer = setInterval(() => {
      sec--;
      if (sec <= 0) {
        clearInterval(_codeTimer);
        btn.disabled = false;
        btn.textContent = '重新获取';
      } else {
        btn.textContent = sec + 's';
      }
    }, 1000);

  } catch (err) {
    errorEl.textContent = '网络错误，请重试。';
    btn.disabled = false;
    btn.textContent = '获取验证码';
  }
}

async function handleAuth() {
  const phone = document.getElementById('authPhone').value.trim();
  const code = document.getElementById('authCode') ? document.getElementById('authCode').value.trim() : '';
  const password = document.getElementById('authPassword') ? document.getElementById('authPassword').value : '';
  const username = document.getElementById('authUsername').value.trim();
  const errorEl = document.getElementById('authError');
  const btn = document.getElementById('authActionBtn');

  if (!/^1\d{10}$/.test(phone)) { errorEl.textContent = '请输入正确的11位手机号。'; return; }

  if (_loginMode === 'code') {
    if (!code || code.length !== 6) { errorEl.textContent = '请输入6位验证码。'; return; }
    if (!_isRegistered && (!username || username.length > 16)) { errorEl.textContent = '用户名需1-16个字符。'; return; }
  } else {
    // Password mode
    if (!password || password.length < 4) { errorEl.textContent = '密码至少4位。'; return; }
  }

  btn.disabled = true;
  btn.textContent = '处理中...';
  errorEl.textContent = '';

  try {
    if (_loginMode === 'code') {
      if (_isRegistered) {
        const res = await fetch(`${AUTH_API}/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code })
        });
        const data = await res.json();
        if (!res.ok) { errorEl.textContent = data.error; btn.disabled = false; btn.textContent = '登录'; return; }
        onAuthSuccess(data.token, data.user);
      } else {
        // Register with optional password
        const regPassword = document.getElementById('regPassword').value.trim();
        const res = await fetch(`${AUTH_API}/register`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code, username, password: regPassword || '' })
        });
        const data = await res.json();
        if (!res.ok) { errorEl.textContent = data.error; btn.disabled = false; btn.textContent = '注册'; return; }
        onAuthSuccess(data.token, data.user);
      }
    } else {
      // Password login
      const res = await fetch(`${AUTH_API}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });
      const data = await res.json();
      if (res.status === 404) {
        errorEl.textContent = '该手机号未注册，请先用验证码注册。';
        btn.disabled = false; btn.textContent = '登录';
        return;
      }
      if (!res.ok) { errorEl.textContent = data.error; btn.disabled = false; btn.textContent = '登录'; return; }
      onAuthSuccess(data.token, data.user);
    }
  } catch (err) {
    errorEl.textContent = '网络错误，请重试。';
    btn.disabled = false;
    btn.textContent = _isRegistered ? '登录' : '注册';
  }
}

function onAuthSuccess(token, user) {
  authToken = token;
  currentUser = user;
  localStorage.setItem('forum_token', token);
  localStorage.setItem('forum_user', JSON.stringify(user));
  showForum();
}

async function handleLogout() {
  if (authToken) {
    try {
      await fetch(`${AUTH_API}/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    } catch (e) { /* ignore */ }
  }
  authToken = null;
  currentUser = null;
  localStorage.removeItem('forum_token');
  localStorage.removeItem('forum_user');
  showAuth();
}

async function checkAuth() {
  const token = localStorage.getItem('forum_token');
  const cached = localStorage.getItem('forum_user');
  if (!token) { showAuth(); return; }

  try {
    const res = await fetch(`${AUTH_API}/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { localStorage.removeItem('forum_token'); localStorage.removeItem('forum_user'); showAuth(); return; }
    const user = await res.json();
    authToken = token;
    currentUser = user;
    showForum();
  } catch (err) {
    // Offline? Use cached user
    if (cached) {
      authToken = token;
      currentUser = JSON.parse(cached);
      showForum();
    } else {
      showAuth();
    }
  }
}

function showAuth() {
  if (authScreen) authScreen.style.display = 'flex';
  if (forumApp) forumApp.style.display = 'none';
  // Clear forms
  _currentPhone = '';
  _loginMode = 'code';
  document.getElementById('authPhone').value = '';
  document.getElementById('authUsername').value = '';
  document.getElementById('authError').textContent = '';
  document.getElementById('debugCode').style.display = 'none';
  document.getElementById('usernameStep').style.display = 'none';
  document.getElementById('authActionBtn').textContent = '登录';
  document.getElementById('sendCodeBtn').style.display = 'inline-block';
  document.getElementById('sendCodeBtn').disabled = false;
  document.getElementById('sendCodeBtn').textContent = '获取验证码';
  document.getElementById('authHint').textContent = '一个手机号只能绑定一个账号';
  document.getElementById('codeInputGroup').style.display = 'block';
  document.getElementById('passwordInputGroup').style.display = 'none';
  document.getElementById('codeInputGroup').innerHTML = '<div class="auth-field"><label>验证码</label><input type="text" id="authCode" placeholder="请输入6位验证码" maxlength="6" inputmode="numeric" pattern="[0-9]*"></div>';
  document.getElementById('codeTab').classList.add('active');
  document.getElementById('passwordTab').classList.remove('active');
  if (_codeTimer) { clearInterval(_codeTimer); _codeTimer = null; }
}

function showForum() {
  if (authScreen) authScreen.style.display = 'none';
  if (forumApp) forumApp.style.display = 'block';
  if (headerUsername) { headerUsername.textContent = currentUser ? currentUser.username : ''; headerUsername.style.cursor = 'pointer'; headerUsername.onclick = showProfile; }
}

// ---- Auth helper for API calls ----

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };
}

// ---- Helpers ----

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash % 360)}, 48%, 55%)`;
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 10) return '刚刚';
  if (diff < 60) return diff + ' 秒前';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 172800) return '昨天';
  if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function formatFullTime(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${sec}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setLoading(state) {
  if (loading) loading.style.display = state ? 'block' : 'none';
}

function showEmpty() {
  if (postsList) postsList.innerHTML = '<div class="empty-state"><p>还没有帖子</p><p>成为第一个发言的人吧 ✨</p></div>';
}

function showError(msg) {
  if (postsList) postsList.innerHTML = `<div class="error-state">${escapeHtml(msg)}</div>`;
}

function updatePostCount(posts) {
  const count = posts ? posts.length : document.querySelectorAll('.post').length;
  if (postCount) postCount.textContent = count + ' 条帖子';
}

// ---- Image upload ----

function handlePostImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('请选择图片文件'); e.target.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { alert('图片不能超过 5MB'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    pendingPostImage = { dataUrl: ev.target.result };
    document.getElementById('postImagePreview').innerHTML = `
      <div class="image-preview-item">
        <img src="${ev.target.result}" alt="preview" class="preview-thumb">
        <button type="button" class="remove-image-btn" onclick="removePostImage()">✕</button>
      </div>`;
    document.getElementById('postImagePreview').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removePostImage() {
  pendingPostImage = null;
  const input = document.getElementById('postImageInput');
  if (input) input.value = '';
  const preview = document.getElementById('postImagePreview');
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
}

// ---- Video ----

function handlePostVideoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('video/')) { alert('请选择视频文件'); e.target.value = ''; return; }
  if (file.size > 15 * 1024 * 1024) { alert('视频不能超过 15MB'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    pendingPostVideo = { dataUrl: ev.target.result };
    document.getElementById('postVideoPreview').innerHTML = `
      <div class="image-preview-item">
        <video controls preload="metadata" class="preview-thumb">
          <source src="${ev.target.result}">
        </video>
        <button type="button" class="remove-image-btn" onclick="removePostVideo()">✕</button>
      </div>`;
    document.getElementById('postVideoPreview').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removePostVideo() {
  pendingPostVideo = null;
  const input = document.getElementById('postVideoInput');
  if (input) input.value = '';
  const preview = document.getElementById('postVideoPreview');
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
}

function handleReplyVideoSelect(postId, e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('video/')) { alert('请选择视频文件'); e.target.value = ''; return; }
  if (file.size > 15 * 1024 * 1024) { alert('视频不能超过 15MB'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = document.getElementById('replyVideoPreview-' + postId);
    if (!preview) return;
    preview.innerHTML = `<div class="image-preview-item">
      <video controls preload="metadata" class="preview-thumb">
        <source src="${ev.target.result}">
      </video>
      <button type="button" class="remove-image-btn" onclick="removeReplyVideo('${postId}')">✕</button>
    </div>`;
    preview.style.display = 'block';
    preview.dataset.videoData = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function removeReplyVideo(postId) {
  const preview = document.getElementById('replyVideoPreview-' + postId);
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; delete preview.dataset.videoData; }
  const input = document.getElementById('replyVideoInput-' + postId);
  if (input) input.value = '';
}

function handleReplyImageSelect(postId, e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('请选择图片文件'); e.target.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { alert('图片不能超过 5MB'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = document.getElementById('replyImagePreview-' + postId);
    if (!preview) return;
    preview.innerHTML = `<div class="image-preview-item">
      <img src="${ev.target.result}" alt="preview" class="preview-thumb">
      <button type="button" class="remove-image-btn" onclick="removeReplyImage('${postId}')">✕</button>
    </div>`;
    preview.style.display = 'block';
    preview.dataset.imageData = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function removeReplyImage(postId) {
  const preview = document.getElementById('replyImagePreview-' + postId);
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; delete preview.dataset.imageData; }
  const input = document.getElementById('replyImageInput-' + postId);
  if (input) input.value = '';
}

// ---- Likes ----

function isLiked(key) {
  const liked = JSON.parse(localStorage.getItem('forum_liked') || '{}');
  return !!liked[key];
}

function setLiked(key, state) {
  const liked = JSON.parse(localStorage.getItem('forum_liked') || '{}');
  liked[key] = state;
  localStorage.setItem('forum_liked', JSON.stringify(liked));
}

async function toggleLike(type, postId, replyId, btnEl, countEl) {
  const key = replyId ? `reply:${replyId}` : `post:${postId}`;
  const liked = isLiked(key);
  const url = replyId
    ? `${API}/${postId}/reply/${replyId}/${liked ? 'unlike' : 'like'}`
    : `${API}/${postId}/${liked ? 'unlike' : 'like'}`;
  try {
    const res = await fetch(url, { method: 'POST', headers: apiHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setLiked(key, !liked);
    btnEl.classList.toggle('liked', !liked);
    countEl.textContent = data.likes || 0;
  } catch (e) { /* ignore */ }
}

// ---- Reply handlers ----

function toggleReplyForm(postId) {
  const form = document.getElementById('replyForm-' + postId);
  if (!form) return;
  form.classList.toggle('visible');
  if (form.classList.contains('visible')) {
    const name = form.querySelector('.reply-name-input');
    if (name) name.focus();
  }
}

async function submitReply(postId) {
  const form = document.getElementById('replyForm-' + postId);
  const contentInput = form.querySelector('.reply-content-input');
  const btn = form.querySelector('.reply-submit-btn');
  const preview = document.getElementById('replyImagePreview-' + postId);
  const imageData = preview ? preview.dataset.imageData : null;
  const previewVid = document.getElementById('replyVideoPreview-' + postId);
  const videoData = previewVid ? previewVid.dataset.videoData : null;

  const content = contentInput.value.trim();
  if (!content) return;

  btn.disabled = true;
  btn.textContent = '发送中...';

  try {
    const res = await fetch(`${API}/${postId}/reply`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ content, image: imageData || null, video: videoData || null }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '回复失败');
      return;
    }
    contentInput.value = '';
    removeReplyImage(postId);
    removeReplyVideo(postId);
    toggleReplyForm(postId);
    await loadPosts();
  } catch (err) {
    alert('回复失败，请重试');
  } finally {
    btn.disabled = false;
    btn.textContent = '回复';
  }
}

// ---- Create post element ----

function createPostElement(post) {
  const initials = post.name.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(post.name);
  const replies = post.replies || [];
  const replyCount = replies.length;
  const likes = post.likes || 0;
  const postLiked = isLiked('post:' + post.id);

  const div = document.createElement('div');
  div.className = 'post';
  div.dataset.id = post.id;

  const postImageHtml = post.image
    ? `<div class="post-image"><img src="${escapeHtml(post.image)}" alt="post image" loading="lazy"></div>`
    : '';
  const postVideoHtml = post.video
    ? `<div class="post-video"><video controls preload="metadata"><source src="${escapeHtml(post.video)}"></video></div>`
    : '';

  let repliesHtml = '';
  if (replyCount > 0) {
    repliesHtml = '<div class="replies-section">';
    for (const reply of replies) {
      const rColor = getAvatarColor(reply.name);
      const rInitials = reply.name.charAt(0).toUpperCase();
      const rLikes = reply.likes || 0;
      const rLiked = isLiked('reply:' + reply.id);
      const rImg = reply.image
        ? `<div class="reply-image"><img src="${escapeHtml(reply.image)}" alt="reply image" loading="lazy"></div>`
        : '';
      const rVid = reply.video
        ? `<div class="reply-video"><video controls preload="metadata"><source src="${escapeHtml(reply.video)}"></video></div>`
        : '';
      repliesHtml += `
        <div class="reply">
          <div class="reply-header">
            <span class="reply-avatar" style="background:${rColor}">${escapeHtml(rInitials)}</span>
            <span class="reply-name">${escapeHtml(reply.name)}</span>
            <span class="reply-time" title="${formatFullTime(reply.createdAt)}">${formatTime(reply.createdAt)}</span>
          </div>
          <div class="reply-content">${escapeHtml(reply.content)}</div>
          ${rImg}
          ${rVid}
          <div style="display:flex;gap:0.3rem;margin-top:0.2rem">
            <button class="like-btn${rLiked ? ' liked' : ''}" onclick="toggleLike('reply','${post.id}','${reply.id}',this,this.querySelector('.like-count'))">
              <span class="heart-icon">${rLiked ? '♥' : '♡'}</span>
              <span class="like-count">${rLikes}</span>
            </button>
          </div>
        </div>`;
    }
    repliesHtml += '</div>';
  }

  div.innerHTML = `
    <div class="post-header">
      <div class="post-author">
        <span class="post-avatar" style="background:${avatarColor}">${escapeHtml(initials)}</span>
        <span class="post-name">${escapeHtml(post.name)}</span>
      </div>
      <span class="post-time" title="${formatFullTime(post.createdAt)}">${formatTime(post.createdAt)}</span>
    </div>
    <div class="post-content">${escapeHtml(post.content)}</div>
    ${postImageHtml}
    ${postVideoHtml}
    ${repliesHtml}
    <div class="reply-form" id="replyForm-${post.id}">
      <div class="form-row">
        <textarea class="reply-content-input" placeholder="写下你的回复..." rows="2" maxlength="2000"></textarea>
      </div>
      <div class="form-row reply-media-row">
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <label class="image-upload-label" onclick="event.stopPropagation()">
            <input type="file" accept="image/*" class="image-input" id="replyImageInput-${post.id}" onchange="handleReplyImageSelect('${post.id}',event)" hidden>
            <span class="image-upload-btn">📷 图片</span>
          </label>
          <label class="image-upload-label" onclick="event.stopPropagation()">
            <input type="file" accept="video/*" class="image-input" id="replyVideoInput-${post.id}" onchange="handleReplyVideoSelect('${post.id}',event)" hidden>
            <span class="image-upload-btn">📹 视频</span>
          </label>
        </div>
        <div class="image-preview" id="replyImagePreview-${post.id}" style="display:none"></div>
        <div class="image-preview" id="replyVideoPreview-${post.id}" style="display:none"></div>
      </div>
      <div class="form-actions">
        <button class="reply-submit-btn" onclick="submitReply('${post.id}')">回复</button>
        <button class="reply-cancel-btn" onclick="toggleReplyForm('${post.id}')">取消</button>
      </div>
    </div>
    <div class="post-meta">
      <div style="display:flex;align-items:center;gap:0.5rem">
        <button class="like-btn${postLiked ? ' liked' : ''}" onclick="toggleLike('post','${post.id}','',this,this.querySelector('.like-count'))">
          <span class="heart-icon">${postLiked ? '♥' : '♡'}</span>
          <span class="like-count">${likes}</span>
        </button>
        <span class="reply-count">${replyCount > 0 ? replyCount + ' 条回复' : '回复'}</span>
      </div>
      <div class="post-actions">
        <button class="action-btn reply-btn" onclick="toggleReplyForm('${post.id}')">💬</button>
        <button class="action-btn delete-btn" data-id="${post.id}">🗑</button>
      </div>
    </div>
  `;

  const deleteBtn = div.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', async () => {
    if (!confirm('确定要删除这条帖子吗？')) return;
    try {
      const res = await fetch(`${API}/${post.id}`, { method: 'DELETE', headers: apiHeaders() });
      if (res.ok) { div.remove(); updatePostCount(); }
    } catch (err) { console.error('Delete failed:', err); }
  });

  return div;
}

// ---- Load Posts ----

async function loadPosts() {
  setLoading(true);
  try {
    const res = await fetch(API, { headers: apiHeaders() });
    if (!res.ok) throw new Error('Failed to load posts');
    const posts = await res.json();
    renderPosts(posts);
  } catch (err) {
    showError('加载帖子失败，请刷新页面重试');
    console.error(err);
  } finally {
    setLoading(false);
  }
}

function renderPosts(posts) {
  if (!postsList) return;
  postsList.innerHTML = '';
  if (posts.length === 0) { showEmpty(); if (postCount) postCount.textContent = '0 条帖子'; return; }
  const fragment = document.createDocumentFragment();
  for (const post of posts) fragment.appendChild(createPostElement(post));
  postsList.appendChild(fragment);
  updatePostCount(posts);
}

// ---- Create Post ----

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = contentInput.value.trim();
  if (!content) return;

  submitBtn.disabled = true;
  submitBtn.textContent = '发布中...';

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ content, image: pendingPostImage ? pendingPostImage.dataUrl : null, video: pendingPostVideo ? pendingPostVideo.dataUrl : null }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '发布失败');
      return;
    }
    contentInput.value = '';
    removePostImage();
    removePostVideo();
    charCount.textContent = '0 / 5000';
    await loadPosts();
  } catch (err) {
    alert('发布失败，请检查网络连接');
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '发布';
  }
});

contentInput.addEventListener('input', () => {
  const len = contentInput.value.length;
  charCount.textContent = len + ' / 5000';
  charCount.style.color = len > 5000 ? '#e17055' : '#b0b8c1';
});

// ---- Init image upload row ----
const uploadRow = document.getElementById('postImageUploadRow');
if (uploadRow) {
  uploadRow.innerHTML = `
    <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
      <label class="image-upload-label">
        <input type="file" accept="image/*" id="postImageInput" onchange="handlePostImageSelect(event)" hidden>
        <span class="image-upload-btn">📷 图片</span>
      </label>
      <label class="image-upload-label">
        <input type="file" accept="video/*" id="postVideoInput" onchange="handlePostVideoSelect(event)" hidden>
        <span class="image-upload-btn">📹 视频</span>
      </label>
    </div>
    <div class="image-preview" id="postImagePreview" style="display:none"></div>
    <div class="image-preview" id="postVideoPreview" style="display:none"></div>`;
}


// ---- Profile ----

async function showProfile() {
  const modal = document.getElementById('profileModal');
  const content = document.getElementById('profileContent');
  if (!modal || !content) return;
  modal.style.display = 'flex';
  content.innerHTML = '<div class="profile-loading">加载中...</div>';

  try {
    const res = await fetch('/api/auth/profile', { headers: apiHeaders() });
    if (!res.ok) { content.innerHTML = '<div class="profile-error">加载失败</div>'; return; }
    const data = await res.json();
    renderProfile(content, data);
  } catch (err) {
    content.innerHTML = '<div class="profile-error">网络错误</div>';
  }
}

function renderProfile(container, data) {
  const initial = data.username.charAt(0).toUpperCase();
  const color = getAvatarColor(data.username);
  const joined = new Date(data.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const phoneMasked = data.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');

  container.innerHTML = `
    <div class="profile-avatar" style="background:${color}">${escapeHtml(initial)}</div>
    <div class="profile-name">${escapeHtml(data.username)}</div>
    <div class="profile-phone">${escapeHtml(phoneMasked)}</div>
    <div class="profile-joined">注册于 ${joined}</div>
    <div class="profile-stats">
      <div class="profile-stat">
        <div class="profile-stat-num">${data.stats.postCount}</div>
        <div class="profile-stat-label">帖子</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-num">${data.stats.replyCount}</div>
        <div class="profile-stat-label">回复</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-num">${data.stats.totalLikes}</div>
        <div class="profile-stat-label">获赞</div>
      </div>
    </div>`;
}

function closeProfile(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('profileModal');
  if (modal) modal.style.display = 'none';
}

// ---- Start ----
checkAuth();
