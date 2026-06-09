// Google Drive Toolkit — Side Panel Logic

const $ = id => document.getElementById(id);

let user = null;
let files = [];
let selectedFiles = new Set();
let currentFolderId = null;

// ─── Init ──────────────────────────────────────────────────────────

async function init() {
  setupEvents();
  await checkLogin();
  await detectFolder();
}

// ─── Auth ──────────────────────────────────────────────────────────

async function checkLogin() {
  chrome.runtime.sendMessage({ type: 'GET_USER' }, (resp) => {
    if (resp?.success && resp.user) {
      user = resp.user;
      showApp();
    }
  });
}

function login() {
  chrome.runtime.sendMessage({ type: 'LOGIN' }, (resp) => {
    if (resp?.success && resp.user) {
      user = resp.user;
      showApp();
      toast('Login berhasil');
    } else {
      toast('Login gagal: ' + (resp?.error || 'Unknown error'));
    }
  });
}

function logout() {
  if (user?.token) {
    chrome.identity.removeCachedAuthToken({ token: user.token });
  }
  user = null;
  files = [];
  selectedFiles.clear();
  $('login-view').style.display = 'block';
  $('app-view').style.display = 'none';
}

function showApp() {
  $('login-view').style.display = 'none';
  $('app-view').style.display = 'block';
  
  if (user) {
    $('user-card').style.display = 'flex';
    $('user-name').textContent = user.name || 'User';
    $('user-email').textContent = user.email || '';
    if (user.picture) {
      $('user-avatar').innerHTML = `<img src="${user.picture}" alt="">`;
    }
  }
}

// ─── Folder Detection ──────────────────────────────────────────────

async function detectFolder() {
  // Try to get folder ID from active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.url?.includes('drive.google.com')) {
    $('no-folder').style.display = 'block';
    $('files-content').style.display = 'none';
    $('empty-folder').style.display = 'none';
    return;
  }
  
  const folderMatch = tab.url.match(/\/drive\/folders\/([a-zA-Z0-9_-]+)/);
  
  if (!folderMatch) {
    $('no-folder').style.display = 'block';
    $('files-content').style.display = 'none';
    $('empty-folder').style.display = 'none';
    return;
  }
  
  currentFolderId = folderMatch[1];
  
  // Try to inject content script and get info
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    
    chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }, (resp) => {
      if (resp?.success && resp.isFolder) {
        loadFiles(currentFolderId);
      }
    });
  } catch (e) {
    // Content script might already be injected, just load files
    loadFiles(currentFolderId);
  }
}

// ─── Files ─────────────────────────────────────────────────────────

function loadFiles(folderId) {
  $('loading-state').style.display = 'block';
  $('files-content').style.display = 'none';
  $('empty-folder').style.display = 'none';
  $('no-folder').style.display = 'none';
  
  $('folder-card').style.display = 'block';
  $('folder-name').textContent = 'Loading...';
  $('folder-meta').textContent = 'Fetching files from Google Drive API';
  
  chrome.runtime.sendMessage({ type: 'LIST_FILES', folderId }, (resp) => {
    $('loading-state').style.display = 'none';
    
    if (resp?.success) {
      files = resp.files || [];
      
      if (files.length === 0) {
        $('empty-folder').style.display = 'block';
        $('folder-name').textContent = 'Folder kosong';
        $('folder-meta').textContent = '0 files';
      } else {
        $('files-content').style.display = 'block';
        $('folder-name').textContent = `Folder (${files.length} files)`;
        $('folder-meta').textContent = `${resp.count} files found via Google Drive API`;
        renderFiles();
        updateStats();
        generateLinks();
      }
    } else {
      $('folder-name').textContent = 'Error';
      $('folder-meta').textContent = resp?.error || 'Failed to load files';
      toast('Gagal load files: ' + (resp?.error || 'Unknown'));
    }
  });
}

function renderFiles() {
  const list = $('file-list');
  
  list.innerHTML = files.map((f, i) => {
    const size = f.size ? formatSize(parseInt(f.size)) : '-';
    const icon = getFileIcon(f.mimeType);
    const isSelected = selectedFiles.has(f.id);
    
    return `
      <div class="file-item" data-id="${f.id}" data-index="${i}">
        <input type="checkbox" class="file-checkbox" data-id="${f.id}" ${isSelected ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--primary);">
        <div class="file-icon ${icon.class}">
          ${icon.svg}
        </div>
        <div class="file-info">
          <div class="file-name" title="${esc(f.name)}">${esc(f.name)}</div>
          <div class="file-size">${size}</div>
        </div>
        <div class="file-actions">
          <button class="file-btn download" data-action="download" data-id="${f.id}" data-name="${esc(f.name)}" title="Download">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="file-btn copy" data-action="copy" data-id="${f.id}" title="Copy to My Drive">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
          <button class="file-btn link" data-action="link" data-id="${f.id}" title="Copy download link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Event listeners
  list.querySelectorAll('.file-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) {
        selectedFiles.add(id);
      } else {
        selectedFiles.delete(id);
      }
      updateSelection();
    });
  });
  
  list.querySelectorAll('.file-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      
      if (action === 'download') downloadSingleFile(id, name);
      else if (action === 'copy') copySingleFile(id);
      else if (action === 'link') copyDownloadLink(id);
    });
  });
}

function updateSelection() {
  const count = selectedFiles.size;
  $('stat-selected').textContent = count;
  $('selected-count').textContent = `${count} selected`;
  
  // Update select all checkbox
  const allChecked = files.length > 0 && count === files.length;
  $('select-all').checked = allChecked;
}

function updateStats() {
  $('stat-total').textContent = files.length;
  
  const totalSize = files.reduce((sum, f) => sum + (parseInt(f.size) || 0), 0);
  $('stat-size').textContent = formatSize(totalSize);
  
  updateSelection();
}

// ─── Links ─────────────────────────────────────────────────────────

function generateLinks() {
  const list = $('links-list');
  
  if (files.length === 0) {
    $('links-content').style.display = 'none';
    $('no-links').style.display = 'block';
    return;
  }
  
  $('links-content').style.display = 'block';
  $('no-links').style.display = 'none';
  
  list.innerHTML = files.map(f => {
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${f.id}`;
    const viewUrl = `https://drive.google.com/file/d/${f.id}/view`;
    
    return `
      <div class="link-card">
        <div class="file-name" style="margin-bottom:4px;">${esc(f.name)}</div>
        <div class="link-url">${downloadUrl}</div>
        <div class="link-actions">
          <button class="btn-sm btn-outline" data-copy="${downloadUrl}" style="flex:1;">Copy Link</button>
          <button class="btn-sm btn-outline" data-open="${viewUrl}" style="flex:1;">Open</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Event listeners
  list.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy);
      toast('Link copied!');
    });
  });
  
  list.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: btn.dataset.open });
    });
  });
}

// ─── Actions ───────────────────────────────────────────────────────

function getSelectedFiles() {
  if (selectedFiles.size === 0) return files; // All files if none selected
  return files.filter(f => selectedFiles.has(f.id));
}

function downloadSingleFile(fileId, fileName) {
  showActionProgress('Downloading...');
  
  chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', fileId, fileName }, (resp) => {
    hideActionProgress();
    if (resp?.success) {
      toast('Downloaded: ' + fileName);
    } else {
      toast('Download gagal: ' + (resp?.error || 'Unknown'));
    }
  });
}

function copySingleFile(fileId) {
  toast('Copying to My Drive...');
  
  chrome.runtime.sendMessage({ type: 'COPY_FILE_TO_ROOT', fileId }, (resp) => {
    if (resp?.success) {
      toast('File copied to My Drive!');
    } else {
      toast('Copy gagal: ' + (resp?.error || 'Unknown'));
    }
  });
}

function copyDownloadLink(fileId) {
  const link = `https://drive.google.com/uc?export=download&id=${fileId}`;
  navigator.clipboard.writeText(link);
  toast('Download link copied!');
}

function copyToMyDrive() {
  const selected = getSelectedFiles();
  if (selected.length === 0) {
    toast('Pilih file terlebih dahulu');
    return;
  }
  
  const folderName = `Copied_${new Date().toISOString().split('T')[0]}`;
  showActionProgress(`Copying ${selected.length} files to My Drive...`);
  
  chrome.runtime.sendMessage({ 
    type: 'COPY_TO_DRIVE', 
    fileIds: selected.map(f => f.id),
    folderName
  }, (resp) => {
    hideActionProgress();
    if (resp?.success) {
      toast(`${resp.copied} files copied to "${resp.folder.name}" in My Drive!`);
    } else {
      toast('Copy gagal: ' + (resp?.error || 'Unknown'));
    }
  });
}

function bulkDownload() {
  const selected = getSelectedFiles();
  if (selected.length === 0) {
    toast('Pilih file terlebih dahulu');
    return;
  }
  
  showActionProgress(`Downloading ${selected.length} files as ZIP...`);
  
  chrome.runtime.sendMessage({ 
    type: 'BULK_DOWNLOAD', 
    files: selected.map(f => ({ id: f.id, name: f.name })),
    folderName: 'drive_files'
  }, (resp) => {
    hideActionProgress();
    if (resp?.success) {
      toast(`${resp.downloaded}/${resp.total} files downloaded as ZIP`);
    } else {
      toast('Download gagal: ' + (resp?.error || 'Unknown'));
    }
  });
}

function downloadAll() {
  showActionProgress(`Downloading ${files.length} files as ZIP...`);
  
  chrome.runtime.sendMessage({ 
    type: 'BULK_DOWNLOAD', 
    files: files.map(f => ({ id: f.id, name: f.name })),
    folderName: 'drive_all_files'
  }, (resp) => {
    hideActionProgress();
    if (resp?.success) {
      toast(`${resp.downloaded}/${resp.total} files downloaded as ZIP`);
    } else {
      toast('Download gagal: ' + (resp?.error || 'Unknown'));
    }
  });
}

function copyAllLinks() {
  const links = files.map(f => 
    `${f.name}\nhttps://drive.google.com/uc?export=download&id=${f.id}`
  ).join('\n\n');
  
  navigator.clipboard.writeText(links);
  toast(`${files.length} links copied to clipboard!`);
}

function exportLinks() {
  const links = files.map(f => 
    `${f.name}\thttps://drive.google.com/uc?export=download&id=${f.id}`
  ).join('\n');
  
  const blob = new Blob([links], { type: 'text/tab-separated-values' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `drive_links_${new Date().toISOString().split('T')[0]}.tsv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Links exported');
}

// ─── Helpers ───────────────────────────────────────────────────────

function showActionProgress(text) {
  $('action-progress').style.display = 'block';
  $('action-progress-text').textContent = text;
  $('action-progress-fill').style.width = '50%';
}

function hideActionProgress() {
  $('action-progress').style.display = 'none';
}

function getFileIcon(mimeType) {
  if (!mimeType) return { class: '', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>' };
  
  if (mimeType.startsWith('image/')) return { class: 'image', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>' };
  if (mimeType.startsWith('video/')) return { class: 'video', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect width="15" height="14" x="1" y="5" rx="2"/></svg>' };
  if (mimeType.includes('pdf')) return { class: 'pdf', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' };
  if (mimeType.includes('folder')) return { class: 'folder', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' };
  
  return { class: '', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>' };
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatRupiah(num) {
  if (!num) return '-';
  return 'Rp ' + num.toLocaleString('id-ID');
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ─── Events ────────────────────────────────────────────────────────

function setupEvents() {
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
  
  // Login
  $('btn-login').addEventListener('click', login);
  $('btn-logout').addEventListener('click', logout);
  
  // Select All
  $('select-all').addEventListener('change', (e) => {
    if (e.target.checked) {
      files.forEach(f => selectedFiles.add(f.id));
    } else {
      selectedFiles.clear();
    }
    renderFiles();
    updateSelection();
  });
  
  // Actions
  $('btn-copy-to-drive').addEventListener('click', copyToMyDrive);
  $('btn-bulk-download').addEventListener('click', bulkDownload);
  $('btn-download-all').addEventListener('click', downloadAll);
  $('btn-copy-all-links').addEventListener('click', copyAllLinks);
  $('btn-export-links').addEventListener('click', exportLinks);
}

// ─── Start ─────────────────────────────────────────────────────────

init();
