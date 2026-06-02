const API = '/api/posts';

// DOM refs
const form = document.getElementById('postForm');
const nameInput = document.getElementById('postName');
const contentInput = document.getElementById('postContent');
const submitBtn = document.getElementById('submitBtn');
const postsList = document.getElementById('postsList');
const postCount = document.getElementById('postCount');
const charCount = document.getElementById('charCount');
const loading = document.getElementById('loadingIndicator');

// ---- Helpers ----

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 48%, 55%)`;
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
  loading.style.display = state ? 'block' : 'none';
}

function showEmpty() {
  postsList.innerHTML = '<div class="empty-state"><p>还没有帖子</p><p>成为第一个发言的人吧 ✨</p></div>';
}

function showError(msg) {
  postsList.innerHTML = `<div class="error-state">${escapeHtml(msg)}</div>`;
}

function updatePostCount(posts) {
  const count = posts ? posts.length : document.querySelectorAll('.post').length;
  postCount.textContent = count + ' 条帖子';
}

// ---- Likes (localStorage tracking) ----

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
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    setLiked(key, !liked);
    btnEl.classList.toggle('liked', !liked);
    countEl.textContent = data.likes || 0;
  } catch (e) {
    // ignore
  }
}

// ---- Reply handlers ----

function toggleReplyForm(postId) {
  const form = document.getElementById('replyForm-' + postId);
  if (!form) return;
  form.classList.toggle('visible');
  if (form.classList.contains('visible')) {
    form.querySelector('.reply-name-input').focus();
  }
}

async function submitReply(postId) {
  const form = document.getElementById('replyForm-' + postId);
  const nameInput = form.querySelector('.reply-name-input');
  const contentInput = form.querySelector('.reply-content-input');
  const btn = form.querySelector('.reply-submit-btn');

  const name = nameInput.value.trim();
  const content = contentInput.value.trim();
  if (!name || !content) return;

  btn.disabled = true;
  btn.textContent = '发送中...';

  try {
    const res = await fetch(`${API}/${postId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '回复失败');
      return;
    }
    nameInput.value = '';
    contentInput.value = '';
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

  // Build replies HTML
  let repliesHtml = '';
  if (replyCount > 0) {
    repliesHtml = '<div class="replies-section">';
    for (const reply of replies) {
      const rColor = getAvatarColor(reply.name);
      const rInitials = reply.name.charAt(0).toUpperCase();
      const rLikes = reply.likes || 0;
      const rLiked = isLiked('reply:' + reply.id);
      repliesHtml += `
        <div class="reply">
          <div class="reply-header">
            <span class="reply-avatar" style="background:${rColor}">${escapeHtml(rInitials)}</span>
            <span class="reply-name">${escapeHtml(reply.name)}</span>
            <span class="reply-time" title="${formatFullTime(reply.createdAt)}">${formatTime(reply.createdAt)}</span>
          </div>
          <div class="reply-content">${escapeHtml(reply.content)}</div>
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
    ${repliesHtml}
    <div class="reply-form" id="replyForm-${post.id}">
      <div class="form-row">
        <input class="reply-name-input" placeholder="你的名字" maxlength="30">
      </div>
      <div class="form-row">
        <textarea class="reply-content-input" placeholder="写下你的回复..." rows="2" maxlength="2000"></textarea>
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

  // Delete handler
  const deleteBtn = div.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', async () => {
    if (!confirm('确定要删除这条帖子吗？')) return;
    try {
      const res = await fetch(`${API}/${post.id}`, { method: 'DELETE' });
      if (res.ok) {
        div.remove();
        updatePostCount();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  });

  return div;
}

// ---- Load Posts ----

async function loadPosts() {
  setLoading(true);
  try {
    const res = await fetch(API);
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
  postsList.innerHTML = '';
  if (posts.length === 0) {
    showEmpty();
    postCount.textContent = '0 条帖子';
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const post of posts) {
    fragment.appendChild(createPostElement(post));
  }
  postsList.appendChild(fragment);
  updatePostCount(posts);
}

// ---- Create Post ----

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const content = contentInput.value.trim();
  if (!name || !content) return;

  submitBtn.disabled = true;
  submitBtn.textContent = '发布中...';

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '发布失败');
      return;
    }
    nameInput.value = '';
    contentInput.value = '';
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

// ---- Char Counter ----

contentInput.addEventListener('input', () => {
  const len = contentInput.value.length;
  charCount.textContent = len + ' / 5000';
  charCount.style.color = len > 5000 ? '#e17055' : '#b0b8c1';
});

// ---- Init ----

loadPosts();
