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

// ─── ZIP Generation (client-side) ───────────────────────────────

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

async function generateZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralDir = [];
  let offset = 0;
  
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = new Uint8Array(file.data);
    
    const header = new Uint8Array(30 + nameBytes.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 0, true);
    hv.setUint16(8, 0, true);
    hv.setUint16(10, 0, true);
    hv.setUint16(12, 0, true);
    hv.setUint32(14, crc32(data), true);
    hv.setUint32(18, data.length, true);
    hv.setUint32(22, data.length, true);
    hv.setUint16(26, nameBytes.length, true);
    hv.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    
    const cd = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, crc32(data), true);
    dv.setUint32(20, data.length, true);
    dv.setUint32(24, data.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    
    chunks.push(header, data);
    centralDir.push(cd);
    offset += header.length + data.length;
  }
  
  const cdOffset = offset;
  let cdSize = 0;
  for (const c of centralDir) cdSize += c.length;
  
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);
  
  const zip = new Uint8Array(offset + cdSize + 22);
  let pos = 0;
  for (const c of chunks) { zip.set(c, pos); pos += c.length; }
  for (const c of centralDir) { zip.set(c, pos); pos += c.length; }
  zip.set(end, pos);
  
  return new Blob([zip], { type: 'application/zip' });
}

// ─── Download Helpers ────────────────────────────────────────────

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    chrome.downloads.download({ url, filename, saveAs: true }, (downloadId) => {
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      resolve(downloadId);
    });
  });
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
        await downloadBlob(blob, msg.fileName || `download_${msg.fileId}`);
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
        if (fileDataList.length > 0) {
          const zipBlob = await generateZip(fileDataList);
          await downloadBlob(zipBlob, `${msg.folderName || 'drive_files'}.zip`);
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
  
  return true;
});

// ─── Open Side Panel ──────────────────────────────────────────────

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

console.log('[Google Drive Toolkit] Background loaded');
