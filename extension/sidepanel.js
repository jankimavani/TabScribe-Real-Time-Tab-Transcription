let mediaStream, mediaRecorder, startedAt, timerId;
let paused = false;
let queue = [];
let uploading = false;
let lastTsMark = 0;

const $ = (s) => document.querySelector(s);
const statusEl = $("#status");
const transcriptEl = $("#transcript");
const bannerEl = $("#banner");

const state = {
  chunkSec: Number($("#chunkSec").value || 2),
  tsEvery: Number($("#tsEvery").value || 30),
  serverUrl: "",
  useMic: false,
};

// Put these near the top of sidepanel.js
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
  showBanner("Error: " + (e.reason?.message || String(e.reason)), true);
});

window.addEventListener("error", (e) => {
  console.error("Global error:", e.error || e.message);
  showBanner("Error: " + (e.error?.message || e.message), true);
});

async function getPreferredTargetTabId() {
  const q = new URLSearchParams(location.search);
  const fromQuery = Number(q.get("targetTabId"));
  if (!Number.isNaN(fromQuery) && fromQuery > 0) return fromQuery;
  const { targetTabId } = await chrome.storage.local.get("targetTabId");
  return Number(targetTabId) || null;
}

$("#tsEvery").addEventListener(
  "change",
  (e) => (state.tsEvery = Number(e.target.value))
);
$("#chunkSec").addEventListener(
  "change",
  (e) => (state.chunkSec = Number(e.target.value))
);
$("#serverUrl").addEventListener(
  "change",
  (e) => (state.serverUrl = e.target.value.trim())
);
$("#useMic").addEventListener(
  "change",
  (e) => (state.useMic = e.target.checked)
);

window.addEventListener(
  "online",
  () => showBanner("Back online — syncing queued audio…", true) || maybeUpload()
);
window.addEventListener("offline", () =>
  showBanner("Offline — buffering audio locally.", true)
);

$("#btnStart").addEventListener("click", startCapture);
$("#btnPause").addEventListener("click", pauseRec);
$("#btnResume").addEventListener("click", resumeRec);
$("#btnStop").addEventListener("click", stopCapture);
$("#btnExportTxt").addEventListener("click", exportText);
$("#btnExportJson").addEventListener("click", exportJSON);

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    paused ? resumeRec() : pauseRec();
  }
  if (e.code === "Escape") stopCapture();
});

function setStatus(msg, stateName) {
  statusEl.textContent = msg;
  if (stateName) statusEl.dataset.state = stateName;
}

function showBanner(msg, sticky = false) {
  bannerEl.textContent = msg;
  bannerEl.hidden = false;
  if (!sticky) setTimeout(() => (bannerEl.hidden = true), 3000);
}

function appendText(text) {
  transcriptEl.append(text);
  transcriptEl.append(" ");
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function addTimestamp(force = false) {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  if (force || elapsed - lastTsMark >= state.tsEvery) {
    const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const ss = String(elapsed % 60).padStart(2, "0");
    transcriptEl.append(`[${mm}:${ss}] `);
    lastTsMark = elapsed;
  }
}

function startTimer() {
  const el = $("#timer");
  timerId = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    el.textContent = `${mm}:${ss}`;
  }, 500);
}

// async function getTabStream() {
//   // If we’re in a fallback tab UI, we passed ?targetTabId=### in the URL
//   const params = new URLSearchParams(location.search);
//   const targetTabId = Number(params.get("targetTabId"));

//   // Prefer getMediaStreamId when we know the target tab
//   if (targetTabId && chrome.tabCapture && chrome.tabCapture.getMediaStreamId) {
//     try {
//       const streamId = await chrome.tabCapture.getMediaStreamId({
//         targetTabId,
//       });
//       // Turn the ID into a real MediaStream via getUserMedia
//       const stream = await navigator.mediaDevices.getUserMedia({
//         audio: {
//           mandatory: {
//             chromeMediaSource: "tab",
//             chromeMediaSourceId: streamId,
//           },
//         },
//         video: false,
//       });
//       return stream;
//     } catch (err) {
//       console.error(
//         "getMediaStreamId path failed, falling back to capture():",
//         err
//       );
//     }
//   }

// async function getTabStream() {
//   const targetTabId = Number(
//     new URLSearchParams(location.search).get("targetTabId")
//   );
//   if (targetTabId && chrome.tabCapture?.getMediaStreamId) {
//     try {
//       const streamId = await chrome.tabCapture.getMediaStreamId({
//         targetTabId,
//       });
//       const stream = await navigator.mediaDevices.getUserMedia({
//         audio: {
//           mandatory: {
//             chromeMediaSource: "tab",
//             chromeMediaSourceId: streamId,
//           },
//         },
//         video: false,
//       });
//       return stream;
//     } catch (e) {
//       console.error("getMediaStreamId failed, falling back:", e);
//     }
//   }
//   // Works when the UI is a real side panel or you clicked the icon on the audio tab
//   return new Promise((resolve, reject) => {
//     chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
//       if (chrome.runtime.lastError || !stream) {
//         reject(
//           chrome.runtime.lastError || new Error("Failed to capture tab audio")
//         );
//       } else {
//         resolve(stream);
//       }
//     });
//   });
// }
async function getTabStream() {
  const targetTabId = await getPreferredTargetTabId();
  console.log("Target tab id:", targetTabId);

  if (targetTabId && chrome.tabCapture?.getMediaStreamId) {
    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId,
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId,
          },
        },
        video: false,
      });
      return stream;
    } catch (e) {
      console.warn(
        "getMediaStreamId path failed, falling back to capture():",
        e
      );
    }
  }

  // Works when UI is a real Side Panel and you clicked on the audio tab
  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
      if (chrome.runtime.lastError || !stream) {
        reject(
          chrome.runtime.lastError || new Error("Failed to capture tab audio")
        );
      } else {
        resolve(stream);
      }
    });
  });
}

async function maybeGetMicStream() {
  if (!state.useMic) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showBanner("Mic permission denied — continuing with tab audio only.");
    return null;
  }
}

async function mixStreams(tabStream, micStream) {
  if (!micStream) return tabStream;
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const s1 = ctx.createMediaStreamSource(tabStream);
  const s2 = ctx.createMediaStreamSource(micStream);
  s1.connect(dest);
  s2.connect(dest);
  return dest.stream;
}

// async function startCapture() {
//   if (!$("#serverUrl").value.trim()) {
//     showBanner("Enter your server URL first.");
//     return;
//   }
//   state.serverUrl = $("#serverUrl").value.trim();

//   await stopCapture(); // clean start
//   setStatus("Starting…", "starting");

//   const tab = await getTabStream();
//   const mic = await maybeGetMicStream();
//   mediaStream = await mixStreams(tab, mic);

//   const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
//     ? "audio/webm;codecs=opus"
//     : "audio/webm";
//   mediaRecorder = new MediaRecorder(mediaStream, {
//     mimeType: mime,
//     audioBitsPerSecond: 32000,
//   });

//   mediaRecorder.ondataavailable = (e) => {
//     if (e.data && e.data.size > 0) queueChunk(e.data);
//   };
//   mediaRecorder.start(state.chunkSec * 1000);

//   startedAt = Date.now();
//   lastTsMark = 0;
//   transcriptEl.textContent = "";
//   addTimestamp(true);
//   startTimer();

//   $("#btnStart").disabled = true;
//   $("#btnPause").disabled = false;
//   $("#btnStop").disabled = false;
//   $("#btnExportTxt").disabled = false;
//   $("#btnExportJson").disabled = false;

//   setStatus("Recording", "recording");
// }

async function startCapture() {
  if (!$("#serverUrl").value.trim()) {
    showBanner("Enter your server URL first.");
    return;
  }
  state.serverUrl = $("#serverUrl").value.trim();

  await stopCapture(); // clean start
  setStatus("Starting…", "starting");

  try {
    let stream = null;

    // 1) Try capturing the intended tab
    try {
      stream = await getTabStream();
    } catch (e) {
      console.warn("Tab capture failed:", e);
      showBanner("Tab capture failed — trying system audio fallback…", true);
    }

    // 2) Fallback: system audio
    if (!stream) {
      stream = await getSystemAudio();
    }

    if (!stream || stream.getAudioTracks().length === 0) {
      throw new Error(
        "No audio track captured. Make sure the source tab is playing sound or allow “Share system audio”."
      );
    }

    mediaStream = stream;

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType: mime,
      audioBitsPerSecond: 32000,
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) queueChunk(e.data);
    };
    mediaRecorder.start(state.chunkSec * 1000);

    startedAt = Date.now();
    lastTsMark = 0;
    transcriptEl.textContent = "";
    addTimestamp(true);
    startTimer();

    $("#btnStart").disabled = true;
    $("#btnPause").disabled = false;
    $("#btnStop").disabled = false;
    $("#btnExportTxt").disabled = false;
    $("#btnExportJson").disabled = false;

    setStatus("Recording", "recording");
  } catch (err) {
    console.error("Start failed:", err);
    setStatus("Idle", "idle");
    showBanner("Start failed: " + (err.message || String(err)), true);
    // Make sure we don’t leave dangling tracks
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    mediaRecorder = null;
  }
}

function pauseRec() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;
  mediaRecorder.pause();
  paused = true;
  $("#btnPause").disabled = true;
  $("#btnResume").disabled = false;
  setStatus("Paused", "paused");
}

function resumeRec() {
  if (!mediaRecorder || mediaRecorder.state !== "paused") return;
  mediaRecorder.resume();
  paused = false;
  $("#btnPause").disabled = false;
  $("#btnResume").disabled = true;
  setStatus("Recording", "recording");
}

async function stopCapture() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
  mediaRecorder = null;
  mediaStream = null;
  paused = false;

  $("#btnStart").disabled = false;
  $("#btnPause").disabled = true;
  $("#btnResume").disabled = true;
  $("#btnStop").disabled = true;
  setStatus("Idle", "idle");
}

function exportText() {
  const text = transcriptEl.innerText;
  navigator.clipboard.writeText(text);
  showBanner("Transcript copied to clipboard.");
}

function exportJSON() {
  const payload = {
    createdAt: new Date(startedAt || Date.now()).toISOString(),
    text: transcriptEl.innerText,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: "transcript.json",
  });
  a.click();
  URL.revokeObjectURL(url);
}

function queueChunk(blob) {
  queue.push({ blob, ts: Date.now(), retries: 0 });
  maybeUpload();
}
async function maybeUpload() {
  if (uploading || !navigator.onLine) return;
  uploading = true;
  try {
    while (queue.length) {
      const item = queue[0]; // peek
      try {
        const text = await uploadChunk(item.blob);
        if (text && text.trim()) {
          addTimestamp();
          appendText(text.trim());
        } else {
          console.warn(
            "Empty transcript for chunk at",
            new Date(item.ts).toISOString()
          );
        }
        queue.shift(); // remove processed item
      } catch (e) {
        item.retries = (item.retries || 0) + 1;
        showBanner(
          `Upload error: ${e?.message || String(e)}`.slice(0, 120) +
            ` (try ${item.retries}/3)`,
          true
        );

        if (item.retries >= 3) {
          // leave the item in the queue; we'll try again later (e.g., when back online)
          showBanner("Upload failed after retries — keeping in queue.", true);
          break; // exit the while loop so we don't spin
        }

        await delay(backoffMs(item.retries));
        // then loop to retry the same item
      }
    }
  } finally {
    uploading = false;
  }
}

// async function uploadChunk(blob) {
//   console.log("Uploading chunk bytes:", blob.size);
//   const fd = new FormData();
//   fd.append("file", blob, `chunk-${Date.now()}.webm`);
//   let res;
//   try {
//     res = await fetch(state.serverUrl, { method: "POST", body: fd });
//   } catch (err) {
//     console.error("Network error to server:", err);
//     throw err;
//   }
//   if (!res.ok) {
//     const text = await res.text().catch(() => "");
//     console.error("Server responded non-OK:", res.status, text);
//     throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
//   }
//   const data = await res.json().catch(() => ({}));
//   console.log(
//     "Transcript text length:",
//     (data.text || "").length,
//     "preview:",
//     (data.text || "").slice(0, 60)
//   );
//   return data.text || data.transcript || "";
// }

async function uploadChunk(blob) {
  console.log("Uploading chunk bytes:", blob.size);
  const fd = new FormData();
  fd.append("file", blob, `chunk-${Date.now()}.webm`);
  let res;
  try {
    res = await fetch(state.serverUrl, { method: "POST", body: fd });
  } catch (err) {
    console.error("Network error to server:", err);
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Server responded non-OK:", res.status, text);
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => ({}));
  console.log(
    "Transcript text length:",
    (data.text || "").length,
    "preview:",
    (data.text || "").slice(0, 60)
  );
  return data.text || data.transcript || "";
}

async function getSystemAudio() {
  // Prompts a picker: select a screen/tab and tick "Share system audio"
  const s = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });
  // Stop video track to save CPU; keep audio
  const v = s.getVideoTracks()[0];
  if (v) v.stop();
  console.log("System audio tracks:", s.getAudioTracks().length);
  return s;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function backoffMs(n) {
  return Math.min(30000, 1000 * 2 ** n);
} // 1s, 2s, 4s... cap 30s
