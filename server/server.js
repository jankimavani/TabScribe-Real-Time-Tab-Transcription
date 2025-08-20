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

// IMPORTANT: robust provider parsing
const PROVIDER = (process.env.PROVIDER || "openai").trim().toLowerCase();

// Only init OpenAI client if we use it
const openai =
  PROVIDER === "openai"
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

app.get("/health", (_req, res) => res.json({ ok: true, provider: PROVIDER }));

// Normalize audio Content-Type for Deepgram
function normalizeAudioContentType(file) {
  let ct = (file.mimetype || "").trim().toLowerCase();
  const name = (file.originalname || "").toLowerCase();
  if (ct.includes(";")) ct = ct.split(";")[0].trim(); // e.g. 'audio/webm;codecs=opus' -> 'audio/webm'
  if (!ct.startsWith("audio/")) {
    if (name.endsWith(".wav")) ct = "audio/wav";
    else if (name.endsWith(".mp3")) ct = "audio/mpeg";
    else if (name.endsWith(".m4a") || name.endsWith(".mp4")) ct = "audio/mp4";
    else if (name.endsWith(".ogg") || name.endsWith(".oga")) ct = "audio/ogg";
    else if (name.endsWith(".webm")) ct = "audio/webm";
    else ct = "audio/webm"; // safe default for Chrome MediaRecorder
  }
  return ct;
}

app.post("/stt/chunk", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no-file" });

    // ---- Deepgram path ----
    if (PROVIDER === "deepgram") {
      const dgKey = process.env.DEEPGRAM_API_KEY;
      if (!dgKey)
        return res.status(500).json({ error: "missing-deepgram-key" });

      const contentType = normalizeAudioContentType(req.file);
      console.log(
        "DG CT:",
        contentType,
        "orig:",
        req.file.mimetype,
        "name:",
        req.file.originalname,
        "len:",
        req.file.size
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
        const body = await r.text().catch(() => "");
        console.error("Deepgram error", r.status, body);
        // Surface details to the client (helps you debug)
        return res
          .status(500)
          .json({
            error: "transcription-failed",
            provider: "deepgram",
            status: r.status,
            body: body.slice(0, 200),
          });
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

    // ---- OpenAI Whisper path ----
    if (!openai)
      return res.status(500).json({ error: "openai-client-not-initialized" });

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
  console.log(`Proxy listening on :${port} provider=${PROVIDER}`)
);
