// Google Drive Toolkit — Background Service Worker

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// ─── Auth ────────────────────────────────────────────────────────

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

function getUserInfo(token) {
  return fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  }).then(r => r.json());
}

// ─── Drive API ───────────────────────────────────────────────────

function listAllFiles(folderId) {
  return getToken().then(token => {
    let allFiles = [];
    
    function fetchPage(pageToken) {
      let url = `${DRIVE_API}/files?q='${folderId}'+in+parents&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=100`;
      if (pageToken) url += `&pageToken=${pageToken}`;
      
      return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          allFiles = allFiles.concat(data.files || []);
          if (data.nextPageToken) {
            return fetchPage(data.nextPageToken);
          }
          return allFiles;
        });
    }
    
    return fetchPage(null);
  });
}

function downloadFile(fileId) {
  return getToken().then(token => {
    return fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => {
      if (!r.ok) throw new Error(`Download error: ${r.status}`);
      return r.blob();
    });
  });
}

function copyFile(fileId, destFolderId) {
  return getToken().then(token => {
    return fetch(`${DRIVE_API}/files/${fileId}/copy?fields=id,name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ parents: [destFolderId] })
    }).then(r => {
      if (!r.ok) throw new Error(`Copy error: ${r.status}`);
      return r.json();
    });
  });
}

function createFolder(name) {
  return getToken().then(token => {
    return fetch(`${DRIVE_API}/files?fields=id,name`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder'
      })
    }).then(r => {
      if (!r.ok) throw new Error(`Create folder error: ${r.status}`);
      return r.json();
    });
  });
}

// ─── Download Helper ─────────────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
}

// ─── Message Handler ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  
  if (msg.type === 'LOGIN') {
    getToken()
      .then(token => getUserInfo(token).then(user => ({ success: true, user, token })))
      .catch(e => ({ success: false, error: e.message }))
      .then(sendResponse);
    return true;
  }
  
  if (msg.type === 'GET_USER') {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false });
      } else {
        getUserInfo(token).then(user => {
          sendResponse({ success: true, user });
        }).catch(() => {
          sendResponse({ success: false });
        });
      }
    });
    return true;
  }
  
  if (msg.type === 'LIST_FILES') {
    listAllFiles(msg.folderId)
      .then(files => sendResponse({ success: true, files, count: files.length }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  
  if (msg.type === 'DOWNLOAD_FILE') {
    downloadFile(msg.fileId)
      .then(blob => {
        downloadBlob(blob, msg.fileName || `file_${msg.fileId}`);
        sendResponse({ success: true });
      })
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  
  if (msg.type === 'COPY_TO_DRIVE') {
    createFolder(msg.folderName || 'Copied from Shared')
      .then(folder => {
        const promises = msg.fileIds.map(fileId => {
          return copyFile(fileId, folder.id)
            .then(copied => ({ success: true, fileId, newId: copied.id }))
            .catch(e => ({ success: false, fileId, error: e.message }));
        });
        return Promise.all(promises).then(results => {
          sendResponse({
            success: true,
            folder,
            results,
            copied: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
          });
        });
      })
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  
  if (msg.type === 'COPY_FILE_TO_ROOT') {
    copyFile(msg.fileId, null)
      .then(copied => sendResponse({ success: true, file: copied }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  
  return false;
});

console.log('[Google Drive Toolkit] Background loaded');
