const API = '/api/posts';
const AUTH_API = '/api/auth';

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
let _authMode = 'code';
let _isRegistered = false;
let _codeTimer = null;
let _currentPhone = '';

function setAuthMode(mode) {
  _authMode = mode;
  document.getElementById('tabCode') && document.getElementById('tabCode').classList.toggle('active', mode === 'code');
  document.getElementById('tabPwd') && document.getElementById('tabPwd').classList.toggle('active', mode === 'password');
  document.getElementById('codeSection').style.display = mode === 'code' ? 'block' : 'none';
  document.getElementById('pwdSection').style.display = mode === 'password' ? 'block' : 'none';
  document.getElementById('regSection').style.display = 'none';
  document.getElementById('authError').textContent = '';
  document.getElementById('authBtn').textContent = '登  录';
  document.getElementById('authHint').textContent = '一个手机号只能绑定一个账号';
  if (_codeTimer) { clearInterval(_codeTimer); _codeTimer = null; }
  const sb = document.getElementById('sendCodeBtn');
  if (sb) { sb.disabled = false; sb.textContent = '获取验证码'; }
}

async function doSendCode() {
  const phone = document.getElementById('loginPhone').value.trim();
  if (!/^1\d{10}$/.test(phone)) {
    document.getElementById('authError').textContent = '请输入正确的11位手机号';
    return;
  }
  document.getElementById('authError').textContent = '';
  _currentPhone = phone;
  const btn = document.getElementById('sendCodeBtn');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const res = await fetch('/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
    if (!res.ok) { document.getElementById('authError').textContent = (await res.json()).error; btn.disabled = false; btn.textContent = '重新获取'; return; }
    const check = await fetch('/api/auth/check-phone?phone=' + encodeURIComponent(phone));
    const checkData = await check.json();
    _isRegistered = checkData.registered;
    document.getElementById('regSection').style.display = _isRegistered ? 'none' : 'block';
    document.getElementById('authBtn').textContent = _isRegistered ? '登  录' : '注  册';
    let sec = 60;
    btn.textContent = sec + 's';
    _codeTimer = setInterval(() => { sec--; if (sec <= 0) { clearInterval(_codeTimer); _codeTimer = null; btn.disabled = false; btn.textContent = '重新获取'; } else { btn.textContent = sec + 's'; } }, 1000);
  } catch (e) { document.getElementById('authError').textContent = '网络错误'; btn.disabled = false; btn.textContent = '重新获取'; }
}

async function doAuth() {
  const phone = document.getElementById('loginPhone').value.trim();
  const code = document.getElementById('loginCode').value.trim();
  const pwd = document.getElementById('loginPassword').value;
  const regName = document.getElementById('regName').value.trim();
  const regPwd = document.getElementById('regPwd').value.trim();
  const errorEl = document.getElementById('authError');
  const btn = document.getElementById('authBtn');
  if (!/^1\d{10}$/.test(phone)) { errorEl.textContent = '请输入正确的11位手机号'; return; }
  try {
    if (_authMode === 'code') {
      if (!code || code.length !== 6) { errorEl.textContent = '请输入6位验证码'; return; }
      if (_isRegistered) {
        btn.disabled = true; btn.textContent = '...';
        const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code }) });
        const d = await r.json();
        if (!r.ok) { errorEl.textContent = d.error; btn.disabled = false; btn.textContent = '登录'; return; }
        onAuthSuccess(d.token, d.user);
      } else {
        if (!regName) { errorEl.textContent = '请填写昵称'; return; }
        btn.disabled = true; btn.textContent = '...';
        const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code, username: regName, password: regPwd || undefined }) });
        const d = await r.json();
        if (!r.ok) { errorEl.textContent = d.error; btn.disabled = false; btn.textContent = '注册'; return; }
        onAuthSuccess(d.token, d.user);
      }
    } else {
      if (!pwd || pwd.length < 4) { errorEl.textContent = '密码至少4位'; return; }
      btn.disabled = true; btn.textContent = '...';
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password: pwd }) });
      const d = await r.json();
      if (r.status === 404) { errorEl.textContent = '该手机号未注册'; btn.disabled = false; btn.textContent = '登录'; return; }
      if (!r.ok) { errorEl.textContent = d.error; btn.disabled = false; btn.textContent = '登录'; return; }
      onAuthSuccess(d.token, d.user);
    }
  } catch(e) { errorEl.textContent = '网络错误'; btn.disabled = false; btn.textContent = _authMode === 'code' ? (_isRegistered ? '登录' : '注册') : '登录'; }
}

function showAuthScreen() {
  const s = document.getElementById('authScreen'); const f = document.getElementById('forumApp');
  if (s) s.style.display = 'flex'; if (f) f.style.display = 'none';
  setAuthMode('code');
}

// ---- Categories ----// ---- Categories ----

function renderBoards() {
  if (!postsList) return;
  _view = 'boards';
  _filterCategory = '';

  // Count posts per category from loaded data (if available)
  const catCounts = {};
  // Try to use cached posts to count
  const allPosts = document.querySelectorAll('.post');

  let html = '<div class="boards-section-title">选择板块</div><div class="board-grid">';
  for (const c of CATEGORIES) {
    html += '<div class="board-card" onclick="enterBoard(\'' + c.id + '\')">';
    html += '<div class="board-icon">' + c.icon + '</div>';
    html += '<div class="board-name">' + c.name + '</div>';
    html += '<div class="board-desc">' + getBoardDesc(c.id) + '</div>';
    html += '</div>';
  }
  html += '</div>';
  postsList.innerHTML = html;
  if (postCount) postCount.textContent = '';
  document.querySelector('.new-post-section').style.display = 'none';
  document.querySelector('.posts-header').style.display = 'none';
  updateCategoryBar();
}

function getBoardDesc(id) {
  const descs = {
    sports: '运动健康，跑步健身',
    entertainment: '电影音乐剧',
    crafts: '手工DIY创意',
    reading: '读书笔记交流',
    cooking: '美食分享料理',
    travel: '旅行风景攻略',
    games: '棋牌游戏乐',
    tech: '数码产品电竞',
    arts: '书法绘画乐器',
    pets: '花草宠物生活',
  };
  return descs[id] || '';
}

function enterBoard(id) {
  _view = 'board';
  _filterCategory = id;
  _selectedCategory = id;
  document.querySelector('.new-post-section').style.display = 'block';
  document.querySelector('.posts-header').style.display = 'flex';
  renderCategoryPicker();
  updateCategoryBar();
  loadPosts();
}

function updateCategoryBar() {
  const bar = document.getElementById('categoryBar');
  if (!bar) return;
  if (_view === 'boards') {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'block';
  let html = '<div class="category-scroll">';
  html += '<button class="cat-btn" onclick="goHome()">🏠 首页</button>';
  for (const c of CATEGORIES) {
    html += '<button class="cat-btn' + (_filterCategory === c.id ? ' active' : '') + '" onclick="enterBoard(\'' + c.id + '\')">' + c.icon + ' ' + c.name + '</button>';
  }
  html += '</div>';
  bar.innerHTML = html;
}

function goHome() {
  _view = 'boards';
  _filterCategory = '';
  document.querySelector('.new-post-section').style.display = 'none';
  document.querySelector('.posts-header').style.display = 'none';
  updateCategoryBar();
  renderBoards();
}

// ---- Old renderCategoryBar replaced by updateCategoryBar ----
// (keeping original renderCategoryBar for compatibility)
function renderCategoryBar() { updateCategoryBar(); } {
  const bar = document.getElementById('categoryBar');
  if (!bar) return;
  let html = '<div class="category-scroll">';
  html += '<button class="cat-btn' + (!_filterCategory ? ' active' : '') + '" onclick="filterCategory(\'\')">\U0001f4cb \u5168\u90e8</button>';
  for (const c of CATEGORIES) {
    html += '<button class="cat-btn' + (_filterCategory === c.id ? ' active' : '') + '" onclick="filterCategory(\'' + c.id + '\')">' + c.icon + ' ' + c.name + '</button>';
  }
  html += '</div>';
  bar.innerHTML = html;
}

function renderCategoryPicker() {
  const picker = document.getElementById('categoryPicker');
  if (!picker) return;
  let html = '';
  for (const c of CATEGORIES) {
    html += '<button class="cp-chip' + (_selectedCategory === c.id ? ' active' : '') + '" type="button" onclick="selectCategory(\'' + c.id + '\')">' + c.icon + ' ' + c.name + '</button>';
  }
  picker.innerHTML = html;
}

let _selectedCategory = '';

function selectCategory(id) {
  _selectedCategory = id;
  renderCategoryPicker();
}

function filterCategory(id) {
  if (!id) { goHome(); return; }
  enterBoard(id);
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
