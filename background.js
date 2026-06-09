// Google Drive Toolkit — Background Service Worker

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// ─── Auth Helpers ────────────────────────────────────────────────

function getToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

function getTokenSilent() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

async function getUserInfo(token) {
  const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return resp.json();
}

// ─── Drive API ───────────────────────────────────────────────────

async function listFiles(folderId, pageToken = null) {
  const token = await getToken();
  let url = `${DRIVE_API}/files?q='${folderId}'+in+parents&fields=nextPageToken,files(id,name,mimeType,size,webViewLink,createdTime,modifiedTime)&pageSize=100`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}

async function listAllFiles(folderId) {
  let allFiles = [];
  let pageToken = null;
  do {
    const result = await listFiles(folderId, pageToken);
    allFiles = allFiles.concat(result.files || []);
    pageToken = result.nextPageToken;
  } while (pageToken);
  return allFiles;
}

async function getFileMetadata(fileId) {
  const token = await getToken();
  const resp = await fetch(`${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,size,parents,webViewLink`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}

async function downloadFile(fileId) {
  const token = await getToken();
  const resp = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) throw new Error(`Download error: ${resp.status}`);
  return resp.blob();
}

async function createFolder(name, parentFolderId = null) {
  const token = await getToken();
  const metadata = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentFolderId) metadata.parents = [parentFolderId];
  const resp = await fetch(`${DRIVE_API}/files?fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });
  if (!resp.ok) throw new Error(`Create folder error: ${resp.status}`);
  return resp.json();
}

async function copyFile(fileId, destFolderId) {
  const token = await getToken();
  const meta = await getFileMetadata(fileId);
  const resp = await fetch(`${DRIVE_API}/files/${fileId}/copy?fields=id,name,mimeType`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: meta.name, parents: [destFolderId] })
  });
  if (!resp.ok) throw new Error(`Copy error: ${resp.status}`);
  return resp.json();
}

async function copyFileToRoot(fileId) {
  const token = await getToken();
  const resp = await fetch(`${DRIVE_API}/files/${fileId}/copy?fields=id,name,mimeType`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!resp.ok) throw new Error(`Copy error: ${resp.status}`);
  return resp.json();
}

// ─── Message Handler ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  
  if (msg.type === 'LOGIN') {
    (async () => {
      try {
        const token = await getToken();
        const user = await getUserInfo(token);
        sendResponse({ success: true, user, token });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  
  if (msg.type === 'GET_USER') {
    (async () => {
      try {
        const token = await getTokenSilent();
        const user = await getUserInfo(token);
        sendResponse({ success: true, user });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  
  if (msg.type === 'LIST_FILES') {
    (async () => {
      try {
        const files = await listAllFiles(msg.folderId);
        sendResponse({ success: true, files, count: files.length });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  
  if (msg.type === 'COPY_TO_DRIVE') {
    (async () => {
      try {
        const folder = await createFolder(msg.folderName || 'Copied from Shared Folder');
        const results = [];
        for (const fileId of msg.fileIds) {
          try {
            const copied = await copyFile(fileId, folder.id);
            results.push({ success: true, fileId, newId: copied.id });
          } catch (e) {
            results.push({ success: false, fileId, error: e.message });
          }
        }
        sendResponse({ 
          success: true, folder, results,
          copied: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  
  if (msg.type === 'COPY_FILE_TO_ROOT') {
    (async () => {
      try {
        const copied = await copyFileToRoot(msg.fileId);
        sendResponse({ success: true, file: copied });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  
  if (msg.type === 'DOWNLOAD_FILE') {
    (async () => {
      try {
        const blob = await downloadFile(msg.fileId);
        const filename = msg.fileName || `download_${msg.fileId}`;
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url, filename, saveAs: true }, () => {
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        });
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  
  if (msg.type === 'BULK_DOWNLOAD') {
    (async () => {
      try {
        const fileDataList = [];
        let downloaded = 0;
        for (const file of msg.files) {
          try {
            const blob = await downloadFile(file.id);
            const buffer = await blob.arrayBuffer();
            fileDataList.push({ name: file.name || `file_${file.id}`, data: buffer });
            downloaded++;
          } catch (e) {
            console.error(`Failed to download ${file.name}:`, e);
          }
        }
        sendResponse({ success: true, downloaded, total: msg.files.length });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  
  if (msg.type === 'GENERATE_LINKS') {
    const links = msg.files.map(f => ({
      name: f.name, id: f.id,
      downloadLink: `https://drive.google.com/uc?export=download&id=${f.id}`,
      viewLink: `https://drive.google.com/file/d/${f.id}/view`
    }));
    sendResponse({ success: true, links });
    return true;
  }
  
  return false;
});

console.log('[Google Drive Toolkit] Background loaded');
