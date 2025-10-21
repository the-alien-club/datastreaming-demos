# Avatar - Persona as a Service Demo

A voice-enabled chat application demonstrating "Persona as a Service" powered by [Alien Intelligence Data Streaming](https://datastreaming.ai/how-it-works) technology.

## Overview

This demo showcases real-time voice conversations with AI personas, featuring:
- **Voice-activated recording** with automatic silence detection (VAD)
- **Speech-to-Text** using ElevenLabs (server-side)
- **Text-to-Speech** with voice cloning from backend
- **Knowledge retrieval** from vector databases
- **Conversation management** with multiple conversations per persona
- **Auto-restart** for continuous conversation flow
- **LocalStorage persistence** (no user accounts needed)

## Features

- 🎤 **Voice Activity Detection**: Automatically detects speech and stops after 1.5s of silence
- 🔊 **Voice Cloning**: Each persona has their own voice model (ElevenLabs TTS)
- 📚 **Knowledge Base**: RAG-powered responses using vector search
- 💬 **Multiple Conversations**: Create and switch between conversations with sidebar
- 🔄 **Continuous Loop**: Mic auto-restarts after AI response for natural conversation
- ⏸️ **Pause/Resume**: Control conversation flow with pause button
- 🎨 **Modern UI**: Dark theme with ShadCN UI components
- 🔒 **Secure**: All API keys kept server-side via Next.js API routes

## Tech Stack

- **Framework**: Next.js 15.5.6 (App Router + Turbopack)
- **React**: 19.1.0
- **TypeScript**: 5
- **Styling**: Tailwind CSS v4 + ShadCN UI
- **Voice**: ElevenLabs STT, Backend TTS with voice cloning
- **Code Quality**: Biome

## Getting Started

### Prerequisites

1. ElevenLabs API key for Speech-to-Text
2. Backend API running at `http://localhost:3333` with flow ID 53
3. Backend API token

### Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Create `.env.local`:**
```bash
# ElevenLabs API Key (server-side only)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Backend API Configuration
BACKEND_API_URL=http://localhost:3333
BACKEND_API_TOKEN=your_backend_api_token_here
```

3. **Run the development server:**
```bash
npm run dev
```

4. **Open [http://localhost:3000](http://localhost:3000)**

### Available Commands

```bash
npm run dev         # Start development server with Turbopack
npm run build       # Build for production
npm start           # Start production server
npm run lint        # Run Biome linter
npm run format      # Format code with Biome
```

## Architecture

### API Routes (Server-Side)

- **`/api/stt`**: Proxies audio to ElevenLabs STT API
- **`/api/chat`**:
  - Calls backend avatar flow endpoint
  - Streams job execution via SSE
  - Returns final text + audio response

### Flow Structure

```
User speaks → VAD detects → Auto-stop on silence →
STT (ElevenLabs) → Backend Avatar Flow (GPT-4o-mini + RAG + ElevenLabs TTS) →
Display text + Play audio → Auto-restart mic → Repeat
```

### Storage

Conversations stored in `localStorage`:
- `avatar-conversations-list`: Array of conversation metadata
- `avatar-conversation-{id}`: Messages for each conversation

Audio (base64) is **not** persisted to avoid quota issues.

## Personas

Currently available:
- **Primavera De Filippi** (Active)
  - Voice dataset: 80
  - Knowledge base: 82
  - Custom persona context with speaking style instructions

Coming soon:
- Leo Blondel
- Alexandre Cadain

## Learn More

- [Alien Intelligence Data Streaming](https://datastreaming.ai/how-it-works)
- [Next.js Documentation](https://nextjs.org/docs)
- [ElevenLabs API](https://elevenlabs.io/docs)
- [ShadCN UI](https://ui.shadcn.com)
