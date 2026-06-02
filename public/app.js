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
  return `hsl(${hue}, 50%, 52%)`;
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);

  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 172800) return '昨天';
  if (diff < 2592000) return Math.floor(diff / 86400) + ' 天前';

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function createPostElement(post) {
  const initials = post.name.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(post.name);

  const div = document.createElement('div');
  div.className = 'post';
  div.dataset.id = post.id;
  div.innerHTML = `
    <div class="post-header">
      <div class="post-author">
        <span class="post-avatar" style="background:${avatarColor}">${initials}</span>
        <span class="post-name">${escapeHtml(post.name)}</span>
      </div>
      <span class="post-time">${formatTime(post.createdAt)}</span>
    </div>
    <div class="post-content">${escapeHtml(post.content)}</div>
    <div class="post-actions">
      <button class="delete-btn" data-id="${post.id}">删除</button>
    </div>
  `;

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

function updatePostCount() {
  const items = postsList.querySelectorAll('.post');
  postCount.textContent = items.length + ' 条帖子';
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
  updatePostCount();
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
  if (len > 5000) {
    charCount.style.color = '#e17055';
  } else {
    charCount.style.color = '#b2bec3';
  }
});

// ---- Init ----

loadPosts();
