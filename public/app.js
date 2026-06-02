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

// ---- Image upload state ----
let pendingPostImage = null; // { dataUrl, file }

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

// ---- Image handling for post form ----

function handlePostImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件');
    e.target.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('图片不能超过 5MB');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(ev) {
    pendingPostImage = { dataUrl: ev.target.result, file };
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
  document.getElementById('postImageInput').value = '';
  document.getElementById('postImagePreview').style.display = 'none';
  document.getElementById('postImagePreview').innerHTML = '';
}

// ---- Image handling for reply forms ----

function handleReplyImageSelect(postId, e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件');
    e.target.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('图片不能超过 5MB');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = document.getElementById('replyImagePreview-' + postId);
    preview.innerHTML = `
      <div class="image-preview-item">
        <img src="${ev.target.result}" alt="preview" class="preview-thumb">
        <button type="button" class="remove-image-btn" onclick="removeReplyImage('${postId}')">✕</button>
      </div>`;
    preview.style.display = 'block';
    // Store in a data attribute
    preview.dataset.imageData = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function removeReplyImage(postId) {
  const preview = document.getElementById('replyImagePreview-' + postId);
  preview.style.display = 'none';
  preview.innerHTML = '';
  delete preview.dataset.imageData;
  const input = document.getElementById('replyImageInput-' + postId);
  if (input) input.value = '';
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
  } catch (e) { /* ignore */ }
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
  const preview = document.getElementById('replyImagePreview-' + postId);
  const imageData = preview.dataset.imageData;

  const name = nameInput.value.trim();
  const content = contentInput.value.trim();
  if (!name || !content) return;

  btn.disabled = true;
  btn.textContent = '发送中...';

  try {
    const res = await fetch(`${API}/${postId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content, image: imageData || null }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '回复失败');
      return;
    }
    nameInput.value = '';
    contentInput.value = '';
    removeReplyImage(postId);
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

  // Post image
  const postImageHtml = post.image
    ? `<div class="post-image"><img src="${escapeHtml(post.image)}" alt="post image" loading="lazy"></div>`
    : '';

  // Build replies HTML
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
      repliesHtml += `
        <div class="reply">
          <div class="reply-header">
            <span class="reply-avatar" style="background:${rColor}">${escapeHtml(rInitials)}</span>
            <span class="reply-name">${escapeHtml(reply.name)}</span>
            <span class="reply-time" title="${formatFullTime(reply.createdAt)}">${formatTime(reply.createdAt)}</span>
          </div>
          <div class="reply-content">${escapeHtml(reply.content)}</div>
          ${rImg}
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
    ${repliesHtml}
    <div class="reply-form" id="replyForm-${post.id}">
      <div class="form-row">
        <input class="reply-name-input" placeholder="你的名字" maxlength="30">
      </div>
      <div class="form-row">
        <textarea class="reply-content-input" placeholder="写下你的回复..." rows="2" maxlength="2000"></textarea>
      </div>
      <div class="form-row reply-image-upload-row">
        <label class="image-upload-label" onclick="event.stopPropagation()">
          <input type="file" accept="image/*" class="image-input" id="replyImageInput-${post.id}" onchange="handleReplyImageSelect('${post.id}',event)" hidden>
          <span class="image-upload-btn">📷 添加图片</span>
        </label>
        <div class="image-preview" id="replyImagePreview-${post.id}" style="display:none"></div>
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
      if (res.ok) { div.remove(); updatePostCount(); }
    } catch (err) { console.error('Delete failed:', err); }
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
      body: JSON.stringify({
        name,
        content,
        image: pendingPostImage ? pendingPostImage.dataUrl : null
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '发布失败');
      return;
    }
    nameInput.value = '';
    contentInput.value = '';
    removePostImage();
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

// Add image upload to post form (insert after textarea)
const imageUploadRow = document.createElement('div');
imageUploadRow.className = 'form-row';
imageUploadRow.innerHTML = `
  <label class="image-upload-label">
    <input type="file" accept="image/*" id="postImageInput" onchange="handlePostImageSelect(event)" hidden>
    <span class="image-upload-btn">📷 添加图片</span>
  </label>
  <div class="image-preview" id="postImagePreview" style="display:none"></div>`;
contentInput.parentNode.insertAdjacentElement('afterend', imageUploadRow);

loadPosts();
