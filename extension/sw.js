// // sw.js
// self.addEventListener("install", () => self.skipWaiting());
// self.addEventListener("activate", () => self.clients.claim());

// chrome.runtime.onInstalled.addListener(async () => {
//   // If Side Panel exists, wire action->open side panel
//   if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
//     try {
//       await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
//       await chrome.sidePanel.setOptions({
//         path: "sidepanel.html",
//         enabled: true,
//       });
//     } catch (e) {
//       console.warn("Side Panel setup failed:", e);
//     }
//   }
// });

// // Always handle action click. If no Side Panel, open our UI as a tab
// chrome.action.onClicked.addListener(async (tab) => {
//   const targetTabId = tab?.id;
//   if (chrome.sidePanel && chrome.sidePanel.open) {
//     try {
//       await chrome.sidePanel.open({ windowId: tab.windowId });
//     } catch (e) {
//       console.error("Failed to open side panel:", e);
//     }
//   } else {
//     const url = chrome.runtime.getURL(
//       `sidepanel.html?targetTabId=${targetTabId}`
//     );
//     chrome.tabs.create({ url });
//   }
// });

// sw.js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());

let popupWindowId = null;

// Configure side panel on install if available
chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      await chrome.sidePanel.setOptions({
        path: "sidepanel.html",
        enabled: true,
      });
      console.log("Side panel configured");
    } catch (e) {
      console.warn("Side panel setup failed:", e);
    }
  } else {
    console.warn(
      "Side Panel API not available in this context; popup fallback will be used."
    );
  }
});

// When the toolbar icon is clicked:
chrome.action.onClicked.addListener(async (tab) => {
  const targetTabId = tab?.id;

  // Prefer the real side panel on Chrome 139
  if (chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch (e) {
      console.warn("Failed to open side panel, falling back to popup:", e);
    }
  }

  // Fallback: a tidy popup window bound to the speech tab (doesn't cover the page)
  const url = chrome.runtime.getURL(
    `sidepanel.html?targetTabId=${targetTabId}`
  );
  try {
    if (popupWindowId) {
      const w = await chrome.windows.get(popupWindowId).catch(() => null);
      if (w) {
        await chrome.windows.update(popupWindowId, { focused: true });
        return;
      }
    }
  } catch {}
  const w = await chrome.windows.create({
    url,
    type: "popup",
    width: 420,
    height: 700,
    focused: true,
  });
  popupWindowId = w.id;
});

// Cleanup when popup closes
chrome.windows.onRemoved.addListener((id) => {
  if (id === popupWindowId) popupWindowId = null;
});
