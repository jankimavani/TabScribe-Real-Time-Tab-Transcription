# TabScribe

# TabScribe — Real-Time Tab Transcription (Chrome MV3)

[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=google-chrome&logoColor=white)](#)
[![Node](https://img.shields.io/badge/Node-20%2B-6DA55F?logo=node.js&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-000.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/<YOUR_GH_USER_OR_ORG>/tabscribe/ci.yml?label=CI)](https://github.com/<YOUR_GH_USER_OR_ORG>/tabscribe/actions/workflows/ci.yml)
[![Deploy: Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel)](#)

> A Chrome MV3 sidepanel extension that captures **active tab audio** and provides (near) real-time transcription with timestamps, export, offline buffering, and resilient error handling — without exposing API keys in the client.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Repo Structure](#repo-structure)
- [Quick Start](#quick-start)
- [Server (Proxy) Setup](#server-proxy-setup)
- [Extension Setup](#extension-setup)
- [Usage](#usage)
- [Permissions & Rationale](#permissions--rationale)
- [Settings](#settings)
- [Accessibility](#accessibility)
- [Reliability & Error Handling](#reliability--error-handling)
- [Export](#export)
- [Performance](#performance)
- [Known Limitations](#known-limitations)
- [Security & Privacy](#security--privacy)
- [Roadmap](#roadmap)
- [Demo](#demo)
- [Packaging & Release](#packaging--release)
- [Development & CI](#development--ci)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

**TabScribe** records audio from the **current browser tab** and transcribes it in near real time. It’s designed for interviews, meetings, lectures, and videos. The extension streams short audio chunks (1–2s) to a minimal Node proxy that calls **OpenAI Whisper** for transcription. The architecture also supports adding WebSocket streaming providers later (Deepgram, Gemini Speech) while keeping the chunk fallback for resilience.

---

## Features

- **Sidepanel UI** with Start / Pause / Resume / Stop
- **Live transcript** with auto-scroll and **timestamps**
- **Chunked uploads** with **exponential backoff** and **offline queueing**
- **User-friendly status & error banners**
- **Export** to Clipboard (text) & **Download JSON**
- Optional **microphone mixing** with tab audio (toggle)
- **MV3-safe** design: minimal background service worker, logic in sidepanel
- Clean, accessible UI (keyboard navigation, `aria-live`)

---

## Architecture

```mermaid
flowchart LR
  A[Active Tab Audio] -->|tabCapture| B(Sidepanel UI)
  M[(Mic Audio)] -->|optional mix| B
  B -- 1–2s WebM/Opus blobs --> C[/HTTPS POST/]
  C[[Proxy Server (Node)]] -->|OpenAI SDK| D[(Whisper)]
  D -->|text| C -->|JSON {text}| B
  B -->|append + timestamps| E[Transcript View]
  B -->|Copy / JSON| F[(Export)]
  B -->|Queue + Retry| C
```
