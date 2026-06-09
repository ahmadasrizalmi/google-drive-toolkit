// Google Drive Toolkit — Background Service Worker (Minimal)

console.log('[Google Drive Toolkit] Loading...');

// Simple message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[GDT] Message:', msg.type);
  
  if (msg.type === 'PING') {
    sendResponse({ success: true, message: 'pong' });
    return true;
  }
  
  return false;
});

// Side panel behavior
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .then(() => console.log('[GDT] Side panel behavior set'))
    .catch(e => console.warn('[GDT] Side panel error:', e));
}

console.log('[GDT] Background loaded successfully');
