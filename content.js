// Google Drive Toolkit — Content Script

(function() {
  'use strict';
  
  if (window.__gdtInjected) return;
  window.__gdtInjected = true;
  
  // Get folder ID from URL
  function getFolderId() {
    const match = window.location.href.match(/\/drive\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }
  
  // Listen for messages
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_PAGE_INFO') {
      sendResponse({
        success: true,
        isDrive: window.location.href.includes('drive.google.com'),
        isFolder: !!getFolderId(),
        folderId: getFolderId(),
        url: window.location.href
      });
    }
    return true;
  });
  
  console.log('[Google Drive Toolkit] Content script loaded');
})();
