self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());

// When the extension is installed/updated
chrome.runtime.onInstalled.addListener(async () => {
  // If Side Panel API isn't available (older Chrome), just log and rely on fallback.
  if (!chrome.sidePanel) {
    console.warn(
      "Side Panel API not available in this Chrome version. Falling back to opening sidepanel.html in a tab."
    );
    return;
  }
  try {
    // Use the manifest "side_panel.default_path", and make action click open the panel
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    // Optional: if you want to force the path (usually not needed if you have side_panel in manifest)
    await chrome.sidePanel.setOptions({
      path: "sidepanel.html",
      enabled: true,
    });
  } catch (err) {
    console.error("Failed to configure side panel:", err);
  }
});

// Toolbar icon click → open the panel (or fallback)
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel && chrome.sidePanel.open) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.error("Failed to open side panel:", err);
    }
  } else {
    // Fallback for older Chrome: open the UI as a normal tab
    chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
  }
});
