// // sw.js
// self.addEventListener("install", () => self.skipWaiting());
// self.addEventListener("activate", () => self.clients.claim());

// let popupWindowId = null;

// // Configure side panel on install if available
// chrome.runtime.onInstalled.addListener(async () => {
//   if (chrome.sidePanel?.setPanelBehavior) {
//     try {
//       await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
//       await chrome.sidePanel.setOptions({
//         path: "sidepanel.html",
//         enabled: true,
//       });
//       console.log("Side panel configured");
//     } catch (e) {
//       console.warn("Side panel setup failed:", e);
//     }
//   } else {
//     console.warn(
//       "Side Panel API not available in this context; popup fallback will be used."
//     );
//   }
// });

// chrome.action.onClicked.addListener(async (tab) => {
//   const targetTabId = tab?.id;
//   // Remember it so sidepanel.html can read it even when opened via real Side Panel
//   await chrome.storage.local.set({ targetTabId });

//   // Prefer real Side Panel
//   if (chrome.sidePanel?.open) {
//     try {
//       await chrome.sidePanel.setPanelBehavior?.({
//         openPanelOnActionClick: true,
//       });
//       await chrome.sidePanel.setOptions?.({
//         path: "sidepanel.html",
//         enabled: true,
//       });
//       await chrome.sidePanel.open({ windowId: tab.windowId });
//       return;
//     } catch (e) {
//       console.warn("Side panel open failed, falling back to popup", e);
//     }
//   }

//   // Fallback: tidy popup (NOT a full tab)
//   const url = chrome.runtime.getURL(
//     `sidepanel.html?targetTabId=${targetTabId}`
//   );
//   const w = await chrome.windows.create({
//     url,
//     type: "popup",
//     width: 420,
//     height: 700,
//     focused: true,
//   });
// });

// sw.js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());

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
  }
});

let popupWindowId = null;

chrome.action.onClicked.addListener(async (tab) => {
  const targetTabId = tab?.id || null;
  await chrome.storage.local.set({ targetTabId });

  if (chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch (e) {
      console.warn("Side panel open failed, falling back to popup", e);
    }
  }

  const url = chrome.runtime.getURL(
    `sidepanel.html?targetTabId=${targetTabId ?? ""}`
  );
  const w = await chrome.windows.create({
    url,
    type: "popup",
    width: 420,
    height: 700,
    focused: true,
  });
  popupWindowId = w.id;
});

chrome.windows.onRemoved.addListener((id) => {
  if (id === popupWindowId) popupWindowId = null;
});

// Allow sidepanel to request the current active tab id if user opened it from the panel menu
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_ACTIVE_TAB_ID") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tabId: tabs?.[0]?.id || null });
    });
    return true; // async
  }
});
