# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15.5.6 voice-enabled persona chat application using React 19.1, TypeScript, and Tailwind CSS v4. The project demonstrates "persona as a service" with voice interaction, allowing users to have conversations with AI personas.

### Key Features
- Voice-activated recording with automatic silence detection (VAD)
- Voice-to-text using 11Labs STT (server-side API route)
- Text-to-speech from backend API (with protection and tracking)
- Automatic conversation loop (mic restarts after AI response)
- Pause/Resume button to control conversation flow
- Multiple conversations per persona with unique IDs
- Conversation sidebar to switch between chats and create new ones
- Automatic title generation from first message
- Conversation persistence via localStorage (no user accounts needed)
- Multiple persona support (Primavera De Filippi active with dataset 80 for voice and dataset 82 for knowledge base, Leo Blondel and Alexandre Cadain coming soon)
- Real-time chat interface with ShadCN UI components
- Visual feedback (button turns red when speaking detected)
- Animated thinking indicator with bouncing dots
- Clean UI with mic controls at top, chat messages below

## Common Commands

### Development
```bash
npm run dev         # Start development server with Turbopack
npm start           # Start production server
npm run build       # Build for production with Turbopack
```

### Code Quality
```bash
npm run lint        # Run Biome linter checks
npm run format      # Format code with Biome
```

## Architecture

### Tech Stack
- **Framework**: Next.js 15.5.6 with App Router
- **Build Tool**: Turbopack (Next.js native bundler)
- **React**: v19.1.0
- **TypeScript**: v5
- **Styling**: Tailwind CSS v4 with PostCSS + ShadCN UI
- **Code Quality**: Biome (replaces ESLint + Prettier)
- **Voice**: 11Labs STT (server-side API route), Backend TTS
- **Storage**: localStorage (conversation persistence)

### Directory Structure
- `app/` - Next.js App Router directory
  - `app/page.tsx` - Landing page with persona selection
  - `app/chat/[personaId]/page.tsx` - Redirects to new/existing conversation
  - `app/chat/[personaId]/[conversationId]/page.tsx` - Chat interface for specific conversation
  - `app/api/stt/route.ts` - 11Labs speech-to-text proxy API (server-side)
  - `app/api/chat/route.ts` - Backend avatar flow proxy API (server-side)
- `components/` - React components
  - `persona-card.tsx` - Persona selection cards
  - `chat-interface.tsx` - Main chat component with state management, conversation switching
  - `conversation-sidebar.tsx` - Sidebar with conversation list and management
  - `redirect-to-new-conversation.tsx` - Client component to create/load conversation
  - `message-list.tsx` - Chat message display with auto-scroll to bottom, scrollbar
  - `voice-recorder.tsx` - Voice-activated recording with automatic silence detection, debug panel
  - `ui/` - ShadCN UI components (button, card, avatar, badge, scroll-area, sheet)
- `lib/` - Utilities and configuration
  - `types.ts` - TypeScript interfaces (Message, Conversation, Persona, etc.)
  - `personas.ts` - Persona configuration (name, context, dataset ID, search dataset IDs)
  - `storage.ts` - localStorage management for conversations with IDs
  - `flows/avatar.ts` - Avatar flow with modular functions for backend API calls
- Path alias `@/*` maps to project root

### Key Configurations

**TypeScript (tsconfig.json)**
- Target: ES2017
- Strict mode enabled
- Path alias: `@/*` → `./*`
- Module resolution: bundler

**Biome (biome.json)**
- Linter and formatter enabled
- 2-space indentation
- Next.js and React domain rules enabled
- Import organization on save
- VCS integration with Git

**Next.js (next.config.ts)**
- Default configuration (minimal customization)

**Tailwind CSS**
- Uses v4 with PostCSS plugin
- Configured in `postcss.config.mjs`

### Fonts
- Uses `next/font` with Geist Sans and Geist Mono
- Fonts are optimized and loaded via CSS variables (`--font-geist-sans`, `--font-geist-mono`)

## Environment Variables

Create a `.env.local` file with the following variables:

```bash
# 11Labs API Key for Speech-to-Text (server-side only, not exposed to client)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Backend API Configuration
BACKEND_API_URL=http://localhost:3333
BACKEND_API_TOKEN=your_backend_api_token_here
```

## Application Flow

1. **Landing Page**: User selects from available personas (only Primavera De Filippi is active)
2. **Conversation Creation**: Clicking a persona creates a new conversation or loads the most recent one
3. **Chat Page**:
   - Sidebar shows all conversations for current persona (sorted by most recent)
   - Click "New Conversation" button to start a fresh chat
   - Click any conversation in sidebar to switch to it
   - Requests microphone permission on mount
   - User clicks mic button to start listening
   - Voice Activity Detection (VAD) automatically detects when user speaks
   - Button turns red and scales up when voice is detected
   - After 1.5 seconds of silence, automatically stops and sends audio
   - Audio sent to `/api/stt` route → 11Labs STT (server-side) → transcribed text displayed
   - Text sent to `/api/chat` route → backend API (POST `/flows/53/run`) with chat history
   - Backend returns response text + audio
   - AI response displayed and audio auto-played
   - **Mic automatically restarts** after audio finishes playing (for continuous conversation)
   - **Pause button** in header stops auto-restart and current recording/playback
   - **Play button** resumes auto-restart mode
   - Conversation title auto-generated from first user message
   - All conversations saved to localStorage with unique IDs

**Security Note**: Both the 11Labs API key and Backend API token are never exposed to the client. All external API calls happen through server-side Next.js API routes.

### Conversation Management
Each conversation has a unique ID and metadata stored separately:
- **Storage Structure**:
  - `avatar-conversations-list`: Array of all conversation metadata
  - `avatar-conversation-{id}`: Messages for each conversation
- **Auto-generated Titles**: First 50 characters of first user message
- **Metadata Tracked**: ID, persona ID, title, created/updated timestamps, message count
- **Sorting**: Conversations sorted by most recent first
- **Deletion**: Removes both metadata and messages from localStorage

### Voice Activity Detection (VAD)
The voice recorder uses Web Audio API to detect when the user is speaking:
- **Threshold**: 15 (average audio level to trigger speech detection - adjustable in `voice-recorder.tsx:74`)
- **Silence Duration**: 1.5 seconds (how long to wait after silence before stopping - adjustable in `voice-recorder.tsx:107`)
- **Visual Feedback**: Button turns red and scales up when voice is detected
- **Debug Panel**: Shows real-time audio level, status, and countdown
- **Status Text**: Shows "Start speaking..." when listening, "Listening..." when voice detected

## Backend API Integration

The app uses a server-side API route (`/api/chat`) that proxies requests to the backend. The route uses modular flow functions in `lib/flows/avatar.ts` to call `POST http://localhost:3333/flows/53/run`.

### Avatar Flow (`runAvatarFlow`)
The flow accepts these parameters:
- **Required:**
  - `userMessage`: User's transcribed text
  - `chatHistory`: Previous conversation messages
  - `personaContext`: Persona's system prompt
  - `datasetId`: Dataset for voice model (e.g., Primavera uses 80)
- **Optional (with defaults):**
  - `llmModel`: "gpt-3.5-turbo" | "gpt-4" | "gpt-4o" | "gpt-4o-mini" (default: "gpt-4o-mini")
  - `voiceModel`: "eleven_turbo_v2_5" | "eleven_multilingual_v2" | "eleven_flash_v2_5" (default: "eleven_turbo_v2_5")
  - `searchDatasetIds`: number[] | null - Dataset IDs for knowledge base search (e.g., Primavera uses [82])
  - `searchK`: number (default: 5)
  - `maxTokens`: number (default: 300)
  - `temperature`: number (default: 0.7)

Response includes:
- `output.text`: AI response text
- `output.audio`: Base64 encoded audio

The flow is broken into modular functions:
- `buildAvatarRequest()`: Constructs the API request payload
- `callAvatarAPI()`: Handles the HTTP call and error handling
- `runAvatarFlow()`: Main entry point that combines both
