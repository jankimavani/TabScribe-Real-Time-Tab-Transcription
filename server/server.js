// console.log("proxy ready");

// import "dotenv/config";
// import express from "express";
// import multer from "multer";
// import cors from "cors";
// import fs from "fs/promises";
// import { createReadStream } from "fs";
// import path from "path";
// import OpenAI from "openai";

// const app = express();
// app.use(cors({ origin: "*" })); // tighten later to your extension id/origin
// app.use(express.json());

// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 25 * 1024 * 1024 },
// });
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// app.get("/health", (_req, res) => res.json({ ok: true }));

// app.post("/stt/chunk", upload.single("file"), async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ error: "No file" });
//     const tmpDir = "/tmp";
//     const fname = `chunk-${Date.now()}-${Math.random()
//       .toString(36)
//       .slice(2)}.webm`;
//     const tmpPath = path.join(tmpDir, fname);
//     await fs.writeFile(tmpPath, req.file.buffer);

//     const tr = await openai.audio.transcriptions.create({
//       file: createReadStream(tmpPath),
//       model: "whisper-1",
//       response_format: "json",
//     });

//     await fs.unlink(tmpPath).catch(() => {});
//     res.json({ text: tr.text || "" });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ error: "transcription-failed" });
//   }
// });

// const port = process.env.PORT || 3000;
// app.listen(port, () => console.log("Proxy listening on :" + port));

// server/server.js
import "dotenv/config";
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import OpenAI from "openai";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const PROVIDER = (process.env.PROVIDER || "openai").trim().toLowerCase();

// Only init OpenAI client if we use it
const openai =
  PROVIDER === "openai"
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

app.get("/health", (_req, res) => res.json({ ok: true, provider: PROVIDER }));

app.post("/stt/chunk", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    if (PROVIDER === "deepgram") {
      // ---- Deepgram path (raw buffer POST) ----
      const dgKey = process.env.DEEPGRAM_API_KEY;
      if (!dgKey)
        return res.status(500).json({ error: "missing-deepgram-key" });

      // Use the incoming mimetype or default to webm
      const contentType = req.file.mimetype || "audio/webm";

      const url = new URL("https://api.deepgram.com/v1/listen");
      // Tweak options as you like:
      url.searchParams.set("model", "nova-2"); // good general model
      url.searchParams.set("language", "en"); // force EN for reliability
      url.searchParams.set("smart_format", "true"); // punctuation, formatting

      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${dgKey}`,
          "Content-Type": contentType,
        },
        body: req.file.buffer,
      });

      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        console.error("Deepgram error:", r.status, errText);
        return res
          .status(500)
          .json({ error: "transcription-failed", provider: "deepgram" });
      }

      const dg = await r.json();
      // Extract transcript (handle a few shapes to be safe)
      let text = "";
      try {
        // classic shape
        text = dg?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
        // fallback shapes
        if (!text && Array.isArray(dg?.channels)) {
          text = dg.channels[0]?.alternatives?.[0]?.transcript || "";
        }
        if (!text && Array.isArray(dg?.results)) {
          text = dg.results
            .map((x) => x?.alternatives?.[0]?.transcript || "")
            .join(" ")
            .trim();
        }
      } catch {
        /* ignore */
      }

      return res.json({ text: text || "" });
    }

    // ---- OpenAI Whisper path (default) ----
    if (!openai)
      return res.status(500).json({ error: "openai-client-not-initialized" });

    // Save to /tmp then stream to SDK (OpenAI SDK prefers streams)
    const tmpDir = "/tmp";
    const fname = `chunk-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.webm`;
    const tmpPath = path.join(tmpDir, fname);
    await fs.writeFile(tmpPath, req.file.buffer);

    const tr = await openai.audio.transcriptions.create({
      file: createReadStream(tmpPath),
      model: "whisper-1",
      response_format: "json",
      language: "en",
      temperature: 0,
    });

    await fs.unlink(tmpPath).catch(() => {});
    return res.json({ text: tr.text || "" });
  } catch (e) {
    console.error("STT error:", e);
    return res.status(500).json({ error: "transcription-failed" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log("Proxy listening on :" + port, "provider=", PROVIDER)
);

// ---- Deepgram path (raw buffer POST) ----
if (PROVIDER === "deepgram") {
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (!dgKey) return res.status(500).json({ error: "missing-deepgram-key" });

  // Normalize Content-Type for Deepgram
  const contentType = normalizeAudioContentType(req.file);
  console.log(
    "Deepgram content-type:",
    contentType,
    "orig mimetype:",
    req.file.mimetype,
    "name:",
    req.file.originalname
  );

  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", "nova-2");
  url.searchParams.set("language", "en");
  url.searchParams.set("smart_format", "true");

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${dgKey}`,
      "Content-Type": contentType,
    },
    body: req.file.buffer,
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    console.error("Deepgram error:", r.status, errText);
    return res
      .status(500)
      .json({ error: "transcription-failed", provider: "deepgram" });
  }

  const dg = await r.json();
  let text = "";
  try {
    text =
      dg?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      dg?.channels?.[0]?.alternatives?.[0]?.transcript ||
      (Array.isArray(dg?.results)
        ? dg.results
            .map((x) => x?.alternatives?.[0]?.transcript || "")
            .join(" ")
        : "");
  } catch {}
  return res.json({ text: (text || "").trim() });
}

function normalizeAudioContentType(file) {
  let ct = (file.mimetype || "").trim().toLowerCase();
  const name = (file.originalname || "").toLowerCase();

  // Strip codec suffix if present (e.g., 'audio/webm;codecs=opus' -> 'audio/webm')
  if (ct.includes(";")) ct = ct.split(";")[0].trim();

  // If multer gave us a non-audio or empty type, infer from filename
  const isAudio = ct.startsWith("audio/");
  if (!isAudio || !ct) {
    if (name.endsWith(".wav")) ct = "audio/wav";
    else if (name.endsWith(".mp3")) ct = "audio/mpeg";
    else if (name.endsWith(".m4a") || name.endsWith(".mp4")) ct = "audio/mp4";
    else if (name.endsWith(".ogg") || name.endsWith(".oga")) ct = "audio/ogg";
    else if (name.endsWith(".webm")) ct = "audio/webm";
    else ct = "audio/webm"; // safest default for Chrome MediaRecorder
  }
  return ct;
}

// ---- Deepgram path (raw buffer POST) ----
if (PROVIDER === "deepgram") {
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (!dgKey) return res.status(500).json({ error: "missing-deepgram-key" });

  // Normalize Content-Type for Deepgram
  const contentType = normalizeAudioContentType(req.file);
  console.log(
    "Deepgram content-type:",
    contentType,
    "orig mimetype:",
    req.file.mimetype,
    "name:",
    req.file.originalname
  );

  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", "nova-2");
  url.searchParams.set("language", "en");
  url.searchParams.set("smart_format", "true");

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${dgKey}`,
      "Content-Type": contentType,
    },
    body: req.file.buffer,
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    console.error("Deepgram error:", r.status, errText);
    return res
      .status(500)
      .json({ error: "transcription-failed", provider: "deepgram" });
  }

  const dg = await r.json();
  let text = "";
  try {
    text =
      dg?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      dg?.channels?.[0]?.alternatives?.[0]?.transcript ||
      (Array.isArray(dg?.results)
        ? dg.results
            .map((x) => x?.alternatives?.[0]?.transcript || "")
            .join(" ")
        : "");
  } catch {}
  return res.json({ text: (text || "").trim() });
}
