console.log("proxy ready");

import "dotenv/config";
import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import OpenAI from "openai";

const app = express();
app.use(cors({ origin: "*" })); // tighten later to your extension id/origin
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/stt/chunk", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
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
    });

    await fs.unlink(tmpPath).catch(() => {});
    res.json({ text: tr.text || "" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "transcription-failed" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Proxy listening on :" + port));
