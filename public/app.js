const API = '/api/posts';
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

// DOM refs
const postsList = document.getElementById('postsList');
const postCount = document.getElementById('postCount');
const contentInput = document.getElementById('postContent');
const submitBtn = document.getElementById('submitBtn');
const form = document.getElementById('postForm');
const charCount = document.getElementById('charCount');
const loading = document.getElementById('loadingIndicator');

// State
let _filterCategory = '';
let _view = 'boards';
let _selectedCategory = '';
let pendingPostImage = null;
let pendingPostVideo = null;

// ===== HELPERS =====
function getCatIcon(id) { const c = CATEGORIES.find(x => x.id === id); return c ? c.icon : ''; }
function getCatName(id) { const c = CATEGORIES.find(x => x.id === id); return c ? c.name : ''; }
function getBoardDesc(id) {
  const d = { sports:'运动健康，跑步健身', entertainment:'电影音乐剧', crafts:'手工DIY创意', reading:'读书笔记交流', cooking:'美食分享料理', travel:'旅行风景攻略', games:'棋牌游戏乐', tech:'数码产品电竞', arts:'书法绘画乐器', pets:'花草宠物生活' };
  return d[id] || '';
}
function getAvatarColor(n) { let h = 0; for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h); return 'hsl(' + Math.abs(h % 360) + ', 48%, 55%)'; }
function formatTime(iso) {
  const d = new Date(iso), now = new Date(), diff = Math.floor((now - d) / 1000);
  if (diff < 10) return '刚刚';
  if (diff < 60) return diff + ' 秒前';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 172800) return '昨天';
  if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
function formatFullTime(iso) {
  const d = new Date(iso);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');
}
function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function setLoading(s) { if (loading) loading.style.display = s ? 'block' : 'none'; }
function showEmpty() { if (postsList) postsList.innerHTML = '<div class="empty-state"><p>还没有帖子</p><p>成为第一个发言的人吧 ✨</p></div>'; }
function showError(m) { if (postsList) postsList.innerHTML = '<div class="error-state">' + escapeHtml(m) + '</div>'; }
function updatePostCount(p) { const c = p ? (p.length || p) : document.querySelectorAll('.post').length; if (postCount) postCount.textContent = c + ' 条帖子'; }

// ===== LIKES =====
function isLiked(key) { const l = JSON.parse(localStorage.getItem('forum_liked') || '{}'); return !!l[key]; }
function setLiked(key, s) { const l = JSON.parse(localStorage.getItem('forum_liked') || '{}'); l[key] = s; localStorage.setItem('forum_liked', JSON.stringify(l)); }
async function toggleLike(type, postId, replyId, btnEl, countEl) {
  const key = replyId ? 'reply:' + replyId : 'post:' + postId;
  const liked = isLiked(key);
  const url = replyId ? API + '/' + postId + '/reply/' + replyId + (liked ? '/unlike' : '/like') : API + '/' + postId + (liked ? '/unlike' : '/like');
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) return;
    const d = await r.json();
    setLiked(key, !liked);
    btnEl.classList.toggle('liked', !liked);
    countEl.textContent = d.likes || 0;
  } catch(e) {}
}

// ===== REPLY =====
function toggleReplyForm(postId) {
  const f = document.getElementById('replyForm-' + postId); if (!f) return;
  f.classList.toggle('visible');
  if (f.classList.contains('visible')) { const i = f.querySelector('input'); if (i) i.focus(); }
}
async function submitReply(postId) {
  const f = document.getElementById('replyForm-' + postId);
  const name = (f.querySelector('.reply-name-input') ? f.querySelector('.reply-name-input').value.trim() : '') || '匿名';
  const content = f.querySelector('.reply-content-input').value.trim();
  if (!content) return;
  const btn = f.querySelector('.reply-submit-btn');
  const imgPreview = document.getElementById('replyImagePreview-' + postId);
  const vidPreview = document.getElementById('replyVideoPreview-' + postId);
  const imageData = imgPreview ? imgPreview.dataset.imageData : null;
  const videoData = vidPreview ? vidPreview.dataset.videoData : null;
  btn.disabled = true; btn.textContent = '...';
  try {
    const r = await fetch(API + '/' + postId + '/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, content, image: imageData || null, video: videoData || null }) });
    if (!r.ok) { alert((await r.json()).error); btn.disabled = false; btn.textContent = '回复'; return; }
    f.querySelector('.reply-content-input').value = '';
    if (imgPreview) { imgPreview.style.display = 'none'; imgPreview.innerHTML = ''; }
    if (vidPreview) { vidPreview.style.display = 'none'; vidPreview.innerHTML = ''; }
    toggleReplyForm(postId); await loadPosts();
  } catch(e) { alert('回复失败'); btn.disabled = false; btn.textContent = '回复'; }
}

// ===== CATEGORIES =====
function renderBoards() {
  if (!postsList) return;
  _view = 'boards'; _filterCategory = '';
  let html = '<div class="boards-section-title">选择板块</div><div class="board-grid">';
  for (const c of CATEGORIES) {
    html += '<div class="board-card" onclick="enterBoard(\'' + c.id + '\')"><div class="board-icon">' + c.icon + '</div><div class="board-name">' + c.name + '</div><div class="board-desc">' + getBoardDesc(c.id) + '</div></div>';
  }
  html += '</div>';
  postsList.innerHTML = html;
  if (postCount) postCount.textContent = '';
  document.querySelector('.new-post-section').style.display = 'none';
  document.querySelector('.posts-header').style.display = 'none';
  const bar = document.getElementById('categoryBar');
  if (bar) { bar.style.display = 'none'; }
}
function enterBoard(id) {
  _view = 'board'; _filterCategory = id; _selectedCategory = id;
  document.querySelector('.new-post-section').style.display = 'block';
  document.querySelector('.posts-header').style.display = 'flex';
  const bar = document.getElementById('categoryBar');
  if (bar) { bar.style.display = 'block'; bar.innerHTML = '<div class="category-scroll"><button class="cat-btn" onclick="renderBoards()">🏠 首页</button>' + CATEGORIES.map(c => '<button class="cat-btn' + (_filterCategory === c.id ? ' active' : '') + '" onclick="enterBoard(\'' + c.id + '\')">' + c.icon + ' ' + c.name + '</button>').join('') + '</div>'; }
  renderCategoryPicker();
  loadPosts();
}
function selectCategory(id) { _selectedCategory = id; renderCategoryPicker(); }
function renderCategoryPicker() {
  const picker = document.getElementById('categoryPicker'); if (!picker) return;
  picker.innerHTML = CATEGORIES.map(c => '<button class="cp-chip' + (_selectedCategory === c.id ? ' active' : '') + '" type="button" onclick="selectCategory(\'' + c.id + '\')">' + c.icon + ' ' + c.name + '</button>').join('');
}

// ===== POST ELEMENT =====
function createPostElement(post) {
  const initials = post.name.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(post.name);
  const replies = post.replies || [];
  const likes = post.likes || 0;
  const postLiked = isLiked('post:' + post.id);
  const postImg = post.image ? '<div class="post-image"><img src="' + escapeHtml(post.image) + '" alt="" loading="lazy"></div>' : '';
  const postVid = post.video ? '<div class="post-video"><video controls preload="metadata"><source src="' + escapeHtml(post.video) + '"></video></div>' : '';

  let repliesHtml = '';
  if (replies.length > 0) {
    repliesHtml = '<div class="replies-section">';
    for (const r of replies) {
      const rColor = getAvatarColor(r.name); const rInit = r.name.charAt(0).toUpperCase();
      const rLiked = isLiked('reply:' + r.id); const rLikes = r.likes || 0;
      const rImg = r.image ? '<div class="reply-image"><img src="' + escapeHtml(r.image) + '" alt="" loading="lazy"></div>' : '';
      const rVid = r.video ? '<div class="reply-video"><video controls preload="metadata"><source src="' + escapeHtml(r.video) + '"></video></div>' : '';
      repliesHtml += '<div class="reply"><div class="reply-header"><span class="reply-avatar" style="background:' + rColor + '">' + escapeHtml(rInit) + '</span><span class="reply-name">' + escapeHtml(r.name) + '</span><span class="reply-time" title="' + formatFullTime(r.createdAt) + '">' + formatTime(r.createdAt) + '</span></div><div class="reply-content">' + escapeHtml(r.content) + '</div>' + rImg + rVid + '<div style="display:flex;gap:0.3rem;margin-top:0.2rem"><button class="like-btn' + (rLiked ? ' liked' : '') + '" onclick="toggleLike(\'reply\',\'' + post.id + '\',\'' + r.id + '\',this,this.querySelector(\'.like-count\'))"><span class="heart-icon">' + (rLiked ? '♥' : '♡') + '</span><span class="like-count">' + rLikes + '</span></button></div></div>';
    }
    repliesHtml += '</div>';
  }

  const div = document.createElement('div');
  div.className = 'post';
  div.innerHTML = '<div class="post-header"><div class="post-author"><span class="post-avatar" style="background:' + avatarColor + '">' + escapeHtml(initials) + '</span><span class="post-name">' + escapeHtml(post.name) + '</span>' + (post.category ? '<span class="cat-tag">' + getCatIcon(post.category) + escapeHtml(getCatName(post.category)) + '</span>' : '') + '</div><span class="post-time" title="' + formatFullTime(post.createdAt) + '">' + formatTime(post.createdAt) + '</span></div><div class="post-content">' + escapeHtml(post.content) + '</div>' + postImg + postVid + repliesHtml + '<div class="reply-form" id="replyForm-' + post.id + '"><div class="form-row"><input class="reply-name-input" placeholder="你的名字" maxlength="30"></div><div class="form-row"><textarea class="reply-content-input" placeholder="写下你的回复..." rows="2" maxlength="2000"></textarea></div><div class="form-row" style="display:flex;gap:0.4rem;flex-wrap:wrap"><label class="image-upload-label"><input type="file" accept="image/*" onchange="handleReplyImageSelect(\'' + post.id + '\',event)" hidden><span class="image-upload-btn">📷 图片</span></label><label class="image-upload-label"><input type="file" accept="video/*" onchange="handleReplyVideoSelect(\'' + post.id + '\',event)" hidden><span class="image-upload-btn">📹 视频</span></label></div><div class="image-preview" id="replyImagePreview-' + post.id + '" style="display:none"></div><div class="image-preview" id="replyVideoPreview-' + post.id + '" style="display:none"></div><div class="form-actions"><button class="reply-submit-btn" onclick="submitReply(\'' + post.id + '\')">回复</button><button class="reply-cancel-btn" onclick="toggleReplyForm(\'' + post.id + '\')">取消</button></div></div><div class="post-meta"><div style="display:flex;align-items:center;gap:0.5rem"><button class="like-btn' + (postLiked ? ' liked' : '') + '" onclick="toggleLike(\'post\',\'' + post.id + '\',\' \',this,this.querySelector(\'.like-count\'))"><span class="heart-icon">' + (postLiked ? '♥' : '♡') + '</span><span class="like-count">' + likes + '</span></button><span class="reply-count">' + (replies.length > 0 ? replies.length + ' 条回复' : '回复') + '</span></div><div class="post-actions"><button class="action-btn reply-btn" onclick="toggleReplyForm(\'' + post.id + '\')">💬</button><button class="action-btn delete-btn" data-id="' + post.id + '">🗑</button></div></div>';

  div.querySelector('.delete-btn').addEventListener('click', async function() {
    if (!confirm('确定删除？')) return;
    try { const r = await fetch(API + '/' + post.id, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }); if (r.ok) { div.remove(); updatePostCount(); } } catch(e) {}
  });
  return div;
}

// ===== LOAD/RENDER =====
async function loadPosts() {
  setLoading(true);
  try {
    const url = _filterCategory ? API + '?category=' + encodeURIComponent(_filterCategory) : API;
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error('Failed');
    const posts = await r.json();
    renderPosts(posts);
  } catch(e) { showError('加载失败，请刷新页面'); console.error(e); }
  finally { setLoading(false); }
}
function renderPosts(posts) {
  if (!postsList) return;
  postsList.innerHTML = '';
  if (posts.length === 0) { showEmpty(); if (postCount) postCount.textContent = '0 条帖子'; return; }
  const frag = document.createDocumentFragment();
  for (const p of posts) frag.appendChild(createPostElement(p));
  postsList.appendChild(frag);
  updatePostCount(posts);
}

// ===== POST FORM =====
if (form) {
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = (document.getElementById('postName') ? document.getElementById('postName').value.trim() : '') || '匿名';
    const content = contentInput.value.trim();
    if (!content) return;
    submitBtn.disabled = true; submitBtn.textContent = '...';
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, content, category: _selectedCategory, image: pendingPostImage ? pendingPostImage.dataUrl : null, video: pendingPostVideo ? pendingPostVideo.dataUrl : null }) });
      if (!r.ok) { alert((await r.json()).error || '发布失败'); submitBtn.disabled = false; submitBtn.textContent = '发布'; return; }
      contentInput.value = '';
      pendingPostImage = null; pendingPostVideo = null;
      document.getElementById('postImagePreview') && (document.getElementById('postImagePreview').style.display = 'none');
      document.getElementById('postVideoPreview') && (document.getElementById('postVideoPreview').style.display = 'none');
      charCount.textContent = '0 / 5000';
      await loadPosts();
    } catch(e) { alert('发布失败'); console.error(e); }
    finally { submitBtn.disabled = false; submitBtn.textContent = '发布'; }
  });
  if (contentInput) {
    contentInput.addEventListener('input', function() {
      const len = contentInput.value.length;
      charCount.textContent = len + ' / 5000';
      charCount.style.color = len > 5000 ? '#e17055' : '#b0b8c1';
    });
  }
}

// ===== IMAGE/VIDEO =====
function handlePostImageSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  if (!file.type.startsWith('image/')) { alert('请选择图片'); e.target.value = ''; return; }
  if (file.size > 5*1024*1024) { alert('图片最大5MB'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    pendingPostImage = { dataUrl: ev.target.result };
    const p = document.getElementById('postImagePreview');
    if (p) { p.innerHTML = '<div class="image-preview-item"><img src="' + ev.target.result + '" class="preview-thumb"><button type="button" class="remove-image-btn" onclick="removePostImage()">✕</button></div>'; p.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}
function removePostImage() { pendingPostImage = null; const p = document.getElementById('postImagePreview'); if (p) { p.style.display = 'none'; p.innerHTML = ''; } const inp = document.getElementById('postImageInput'); if (inp) inp.value = ''; }
function handlePostVideoSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  if (!file.type.startsWith('video/')) { alert('请选择视频'); e.target.value = ''; return; }
  if (file.size > 15*1024*1024) { alert('视频最大15MB'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    pendingPostVideo = { dataUrl: ev.target.result };
    const p = document.getElementById('postVideoPreview');
    if (p) { p.innerHTML = '<div class="image-preview-item"><video controls preload="metadata" class="preview-thumb"><source src="' + ev.target.result + '"></video><button type="button" class="remove-image-btn" onclick="removePostVideo()">✕</button></div>'; p.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}
function removePostVideo() { pendingPostVideo = null; const p = document.getElementById('postVideoPreview'); if (p) { p.style.display = 'none'; p.innerHTML = ''; } const inp = document.getElementById('postVideoInput'); if (inp) inp.value = ''; }
function handleReplyImageSelect(postId, e) {
  const file = e.target.files[0]; if (!file) return;
  if (!file.type.startsWith('image/')) { alert('请选择图片'); e.target.value = ''; return; }
  if (file.size > 5*1024*1024) { alert('图片最大5MB'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    const p = document.getElementById('replyImagePreview-' + postId); if (!p) return;
    p.innerHTML = '<div class="image-preview-item"><img src="' + ev.target.result + '" class="preview-thumb"><button type="button" class="remove-image-btn" onclick="removeReplyImage(\'' + postId + '\')">✕</button></div>';
    p.style.display = 'block'; p.dataset.imageData = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function removeReplyImage(postId) { const p = document.getElementById('replyImagePreview-' + postId); if (p) { p.style.display = 'none'; p.innerHTML = ''; delete p.dataset.imageData; } }
function handleReplyVideoSelect(postId, e) {
  const file = e.target.files[0]; if (!file) return;
  if (!file.type.startsWith('video/')) { alert('请选择视频'); e.target.value = ''; return; }
  if (file.size > 15*1024*1024) { alert('视频最大15MB'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    const p = document.getElementById('replyVideoPreview-' + postId); if (!p) return;
    p.innerHTML = '<div class="image-preview-item"><video controls preload="metadata" class="preview-thumb"><source src="' + ev.target.result + '"></video><button type="button" class="remove-image-btn" onclick="removeReplyVideo(\'' + postId + '\')">✕</button></div>';
    p.style.display = 'block'; p.dataset.videoData = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function removeReplyVideo(postId) { const p = document.getElementById('replyVideoPreview-' + postId); if (p) { p.style.display = 'none'; p.innerHTML = ''; delete p.dataset.videoData; } }

// ===== PROFILE =====
async function showProfile() {
  document.getElementById('profileModal').style.display = 'flex';
  document.getElementById('profileContent').innerHTML = '<div class="profile-loading">加载中...</div>';
  document.getElementById('profileContent').innerHTML = '<div class="profile-loading">用户信息功能已简化</div>';
}
function closeProfile(e) { if (e && e.target !== e.currentTarget) return; document.getElementById('profileModal').style.display = 'none'; }

// ===== INIT =====
const uploadRow = document.getElementById('postImageUploadRow');
if (uploadRow) {
  uploadRow.innerHTML = '<div style="display:flex;gap:0.4rem;flex-wrap:wrap"><label class="image-upload-label"><input type="file" accept="image/*" id="postImageInput" onchange="handlePostImageSelect(event)" hidden><span class="image-upload-btn">📷 图片</span></label><label class="image-upload-label"><input type="file" accept="video/*" id="postVideoInput" onchange="handlePostVideoSelect(event)" hidden><span class="image-upload-btn">📹 视频</span></label></div><div class="image-preview" id="postImagePreview" style="display:none"></div><div class="image-preview" id="postVideoPreview" style="display:none"></div>';
}

renderBoards();
