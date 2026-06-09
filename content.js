// Google Drive Toolkit — Content Script
// Detects Google Drive folder pages and extracts file info

(function() {
  'use strict';
  
  if (window.__gdToolkitInjected) return;
  window.__gdToolkitInjected = true;
  
  // ─── Folder Detection ──────────────────────────────────────────
  
  function getFolderId() {
    const match = window.location.href.match(/\/drive\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }
  
  function getFileId() {
    const match = window.location.href.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }
  
  // ─── Extract Files from DOM ────────────────────────────────────
  
  function extractFilesFromDOM() {
    const files = [];
    
    // Google Drive uses data attributes for file items
    const fileElements = document.querySelectorAll('[data-id]');
    
    fileElements.forEach(el => {
      const fileId = el.getAttribute('data-id');
      if (!fileId || fileId.length < 10) return;
      
      // Try to get filename
      let fileName = '';
      const nameEl = el.querySelector('[aria-label]') || el.querySelector('[role="button"]');
      if (nameEl) {
        fileName = nameEl.getAttribute('aria-label') || nameEl.textContent.trim();
      }
      
      // Try to get file type from icon
      let fileType = 'unknown';
      const iconEl = el.querySelector('img, svg, [class*="icon"]');
      if (iconEl) {
        const alt = iconEl.getAttribute('alt') || '';
        const cls = iconEl.className || '';
        if (alt.toLowerCase().includes('folder') || cls.includes('folder')) fileType = 'folder';
        else if (alt.toLowerCase().includes('image') || cls.includes('image')) fileType = 'image';
        else if (alt.toLowerCase().includes('video') || cls.includes('video')) fileType = 'video';
        else if (alt.toLowerCase().includes('pdf') || cls.includes('pdf')) fileType = 'pdf';
        else if (alt.toLowerCase().includes('document') || cls.includes('document')) fileType = 'document';
        else if (alt.toLowerCase().includes('spreadsheet') || cls.includes('spreadsheet')) fileType = 'spreadsheet';
      }
      
      // Avoid duplicates
      if (!files.find(f => f.id === fileId)) {
        files.push({
          id: fileId,
          name: fileName || `File ${fileId.substring(0, 8)}`,
          type: fileType,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
          viewUrl: `https://drive.google.com/file/d/${fileId}/view`
        });
      }
    });
    
    return files;
  }
  
  // ─── Message Handler ───────────────────────────────────────────
  
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    
    if (msg.type === 'GET_PAGE_INFO') {
      const folderId = getFolderId();
      const fileId = getFileId();
      
      sendResponse({
        success: true,
        isDrive: !!(folderId || fileId),
        isFolder: !!folderId,
        isFile: !!fileId,
        folderId,
        fileId,
        url: window.location.href
      });
      return true;
    }
    
    if (msg.type === 'EXTRACT_FILES') {
      const files = extractFilesFromDOM();
      sendResponse({
        success: true,
        files,
        count: files.length
      });
      return true;
    }
    
    return true;
  });
  
  // Notify background that content script is ready
  chrome.runtime.sendMessage({ 
    type: 'CONTENT_SCRIPT_READY',
    url: window.location.href,
    folderId: getFolderId()
  });
  
  console.log('[Google Drive Toolkit] Content script loaded');
})();
