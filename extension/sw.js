// sw.js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());

chrome.runtime.onInstalled.addListener(async () => {
  // If Side Panel exists, wire action->open side panel
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      await chrome.sidePanel.setOptions({
        path: "sidepanel.html",
        enabled: true,
      });
    } catch (e) {
      console.warn("Side Panel setup failed:", e);
    }
  }
});

// Always handle action click. If no Side Panel, open our UI as a tab
chrome.action.onClicked.addListener(async (tab) => {
  const targetTabId = tab?.id;
  if (chrome.sidePanel && chrome.sidePanel.open) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (e) {
      console.error("Failed to open side panel:", e);
    }
  } else {
    const url = chrome.runtime.getURL(
      `sidepanel.html?targetTabId=${targetTabId}`
    );
    chrome.tabs.create({ url });
  }
});
