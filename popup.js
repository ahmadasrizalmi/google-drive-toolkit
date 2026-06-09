// Google Drive Toolkit — Popup Logic

const $ = id => document.getElementById(id);

let user = null;
let files = [];
let selectedFiles = new Set();
let currentFolderId = null;

// ─── Init ────────────────────────────────────────────────────────

function init() {
  setupEvents();
  checkLogin();
  detectFolder();
}

// ─── Auth ────────────────────────────────────────────────────────

function checkLogin() {
  chrome.runtime.sendMessage({ type: 'GET_USER' }, (resp) => {
    if (resp && resp.success && resp.user) {
      user = resp.user;
      showApp();
    }
  });
}

function login() {
  chrome.runtime.sendMessage({ type: 'LOGIN' }, (resp) => {
    if (resp && resp.success && resp.user) {
      user = resp.user;
      showApp();
      toast('Login berhasil');
    } else {
      toast('Login gagal: ' + (resp ? resp.error : 'Unknown'));
    }
  });
}

function logout() {
  user = null;
  files = [];
  selectedFiles.clear();
  $('login-view').style.display = 'block';
  $('app-view').style.display = 'none';
  $('user-card').style.display = 'none';
  $('btn-logout').style.display = 'none';
}

function showApp() {
  $('login-view').style.display = 'none';
  $('app-view').style.display = 'block';
  $('btn-logout').style.display = 'block';
  
  if (user) {
    $('user-card').style.display = 'flex';
    $('user-name').textContent = user.name || 'User';
    $('user-email').textContent = user.email || '';
    if (user.picture) {
      $('user-avatar').innerHTML = '<img src="' + user.picture + '" alt="">';
    }
  }
}

// ─── Folder Detection ────────────────────────────────────────────

function detectFolder() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('drive.google.com')) {
      showNoFolder();
      return;
    }
    
    const match = tab.url.match(/\/drive\/folders\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      showNoFolder();
      return;
    }
    
    currentFolderId = match[1];
    loadFiles(currentFolderId);
  });
}

// ─── Files ───────────────────────────────────────────────────────

function loadFiles(folderId) {
  $('loading-state').style.display = 'block';
  $('files-content').style.display = 'none';
  $('empty-folder').style.display = 'none';
  $('no-folder').style.display = 'none';
  $('folder-card').style.display = 'block';
  $('folder-name').textContent = 'Loading...';
  $('folder-meta').textContent = '';
  
  chrome.runtime.sendMessage({ type: 'LIST_FILES', folderId }, (resp) => {
    $('loading-state').style.display = 'none';
    
    if (resp && resp.success) {
      files = resp.files || [];
      
      if (files.length === 0) {
        $('empty-folder').style.display = 'block';
        $('folder-name').textContent = 'Folder kosong';
        $('folder-meta').textContent = '0 files';
      } else {
        $('files-content').style.display = 'block';
        $('folder-name').textContent = 'Folder (' + files.length + ' files)';
        $('folder-meta').textContent = files.length + ' files found';
        renderFiles();
        updateStats();
      }
    } else {
      $('folder-name').textContent = 'Error';
      $('folder-meta').textContent = resp ? resp.error : 'Failed to load';
    }
  });
}

function renderFiles() {
  const list = $('file-list');
  
  list.innerHTML = files.map(function(f, i) {
    var size = f.size ? formatSize(parseInt(f.size)) : '-';
    var icon = getFileIcon(f.mimeType);
    var isSelected = selectedFiles.has(f.id);
    
    return '<div class="file-item">' +
      '<input type="checkbox" class="file-checkbox" data-id="' + f.id + '" ' + (isSelected ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--blue);">' +
      '<div class="file-icon ' + icon.cls + '">' + icon.svg + '</div>' +
      '<div class="file-info">' +
        '<div class="file-name" title="' + esc(f.name) + '">' + esc(f.name) + '</div>' +
        '<div class="file-size">' + size + '</div>' +
      '</div>' +
      '<div class="file-actions">' +
        '<button class="file-btn download" data-action="download" data-id="' + f.id + '" data-name="' + esc(f.name) + '" title="Download">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        '</button>' +
        '<button class="file-btn copy" data-action="copy" data-id="' + f.id + '" title="Copy to My Drive">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>' +
        '</button>' +
        '<button class="file-btn link" data-action="link" data-id="' + f.id + '" title="Copy link">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
  
  // Checkbox events
  list.querySelectorAll('.file-checkbox').forEach(function(cb) {
    cb.addEventListener('change', function(e) {
      var id = e.target.dataset.id;
      if (e.target.checked) {
        selectedFiles.add(id);
      } else {
        selectedFiles.delete(id);
      }
      updateSelection();
    });
  });
  
  // Button events
  list.querySelectorAll('.file-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var action = btn.dataset.action;
      var id = btn.dataset.id;
      var name = btn.dataset.name;
      
      if (action === 'download') downloadFile(id, name);
      else if (action === 'copy') copyToDrive(id);
      else if (action === 'link') copyLink(id);
    });
  });
}

function updateSelection() {
  var count = selectedFiles.size;
  $('stat-selected').textContent = count;
  $('selected-count').textContent = count + ' selected';
  $('select-all').checked = files.length > 0 && count === files.length;
}

function updateStats() {
  $('stat-total').textContent = files.length;
  var totalSize = files.reduce(function(sum, f) { return sum + (parseInt(f.size) || 0); }, 0);
  $('stat-size').textContent = formatSize(totalSize);
  updateSelection();
}

// ─── Actions ─────────────────────────────────────────────────────

function downloadFile(fileId, fileName) {
  chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', fileId: fileId, fileName: fileName }, function(resp) {
    if (resp && resp.success) {
      toast('Downloaded: ' + fileName);
    } else {
      toast('Download gagal');
    }
  });
}

function copyToDrive(fileId) {
  toast('Copying...');
  chrome.runtime.sendMessage({ type: 'COPY_FILE_TO_ROOT', fileId: fileId }, function(resp) {
    if (resp && resp.success) {
      toast('Copied to My Drive!');
    } else {
      toast('Copy gagal: ' + (resp ? resp.error : 'Unknown'));
    }
  });
}

function copyLink(fileId) {
  var link = 'https://drive.google.com/uc?export=download&id=' + fileId;
  navigator.clipboard.writeText(link);
  toast('Link copied!');
}

function copyAllToDrive() {
  var ids = selectedFiles.size > 0 ? Array.from(selectedFiles) : files.map(function(f) { return f.id; });
  if (ids.length === 0) {
    toast('Pilih file terlebih dahulu');
    return;
  }
  
  var folderName = 'Copied_' + new Date().toISOString().split('T')[0];
  toast('Copying ' + ids.length + ' files...');
  
  chrome.runtime.sendMessage({ type: 'COPY_TO_DRIVE', fileIds: ids, folderName: folderName }, function(resp) {
    if (resp && resp.success) {
      toast(resp.copied + ' files copied to "' + resp.folder.name + '"');
    } else {
      toast('Copy gagal');
    }
  });
}

function downloadAll() {
  var list = selectedFiles.size > 0 ? files.filter(function(f) { return selectedFiles.has(f.id); }) : files;
  if (list.length === 0) {
    toast('Tidak ada file');
    return;
  }
  
  toast('Downloading ' + list.length + ' files...');
  list.forEach(function(f) {
    downloadFile(f.id, f.name);
  });
}

// ─── Links ───────────────────────────────────────────────────────

function generateLinks() {
  if (files.length === 0) {
    $('links-content').style.display = 'none';
    $('no-links').style.display = 'block';
    return;
  }
  
  $('links-content').style.display = 'block';
  $('no-links').style.display = 'none';
  
  var list = $('links-list');
  list.innerHTML = files.map(function(f) {
    var url = 'https://drive.google.com/uc?export=download&id=' + f.id;
    return '<div class="link-card">' +
      '<div class="file-name" style="margin-bottom:4px;">' + esc(f.name) + '</div>' +
      '<div class="link-url">' + url + '</div>' +
      '<div class="link-actions">' +
        '<button class="btn-outline" data-copy="' + url + '" style="flex:1;font-size:12px;">Copy</button>' +
        '<button class="btn-outline" data-open="https://drive.google.com/file/d/' + f.id + '/view" style="flex:1;font-size:12px;">Open</button>' +
      '</div>' +
    '</div>';
  }).join('');
  
  list.querySelectorAll('[data-copy]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      navigator.clipboard.writeText(btn.dataset.copy);
      toast('Copied!');
    });
  });
  
  list.querySelectorAll('[data-open]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      chrome.tabs.create({ url: btn.dataset.open });
    });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────

function getFileIcon(mimeType) {
  if (!mimeType) return { cls: '', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>' };
  
  if (mimeType.startsWith('image/')) return { cls: 'image', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>' };
  if (mimeType.startsWith('video/')) return { cls: 'video', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect width="15" height="14" x="1" y="5" rx="2"/></svg>' };
  if (mimeType.includes('pdf')) return { cls: 'pdf', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' };
  if (mimeType.includes('folder')) return { cls: 'folder', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' };
  
  return { cls: '', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>' };
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showNoFolder() {
  $('no-folder').style.display = 'block';
  $('files-content').style.display = 'none';
  $('empty-folder').style.display = 'none';
}

function toast(msg) {
  var el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 2500);
}

// ─── Events ──────────────────────────────────────────────────────

function setupEvents() {
  // Tabs
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
      tab.classList.add('active');
      $('panel-' + tab.dataset.tab).classList.add('active');
      
      if (tab.dataset.tab === 'links') generateLinks();
    });
  });
  
  // Login
  $('btn-login').addEventListener('click', login);
  $('btn-logout').addEventListener('click', logout);
  
  // Select All
  $('select-all').addEventListener('change', function(e) {
    if (e.target.checked) {
      files.forEach(function(f) { selectedFiles.add(f.id); });
    } else {
      selectedFiles.clear();
    }
    renderFiles();
    updateSelection();
  });
  
  // Actions
  $('btn-copy-to-drive').addEventListener('click', copyAllToDrive);
  $('btn-download-all').addEventListener('click', downloadAll);
  $('btn-copy-all-links').addEventListener('click', function() {
    var links = files.map(function(f) {
      return f.name + '\nhttps://drive.google.com/uc?export=download&id=' + f.id;
    }).join('\n\n');
    navigator.clipboard.writeText(links);
    toast('All links copied!');
  });
  $('btn-export-links').addEventListener('click', function() {
    var links = files.map(function(f) {
      return f.name + '\thttps://drive.google.com/uc?export=download&id=' + f.id;
    }).join('\n');
    var blob = new Blob([links], { type: 'text/tab-separated-values' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'drive_links_' + new Date().toISOString().split('T')[0] + '.tsv';
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported!');
  });
}

// ─── Start ───────────────────────────────────────────────────────

init();
