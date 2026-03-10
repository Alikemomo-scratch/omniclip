// OmniClip Extension Service Worker
// Handles content buffering and periodic sync to backend

console.log('OmniClip service worker initialized');

// Listen for content collected messages from bridge scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CONTENT_COLLECTED') {
    console.log(`Received ${message.items?.length || 0} items from ${message.platform}`);
    sendResponse({ received: true });
  }
  return true;
});
