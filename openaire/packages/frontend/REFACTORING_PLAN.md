# Research Page Refactoring Plan

## Overview
Refactoring `app/research/page.tsx` (748 lines) into modular, maintainable components and utilities.

---

## Phase 1: Types & Constants

### ✅ COMPLETED
- [x] `types/research.ts` - All TypeScript interfaces
  - ResearchProduct
  - ChartData
  - Message
  - Model
  - APIResponse
  - JobMessage
  - JobStatus
  - MessageComponentProps

### 🔄 IN PROGRESS
- [ ] `constants/models.ts` - Model configurations
  - AVAILABLE_MODELS array
  - DEFAULT_MODEL constant

- [ ] `constants/research-prompts.ts` - UI text constants
  - EXAMPLE_QUERIES array
  - AGENT_FEATURES array
  - WELCOME_TEXT object

---

## Phase 2: Utility Functions

### API Layer
- [ ] `lib/api/research-client.ts`
  - `startResearchJob(messages, model)` - POST to /api/research-sdk/start
  - `getJobStatus(jobId)` - GET from /api/research-sdk/status/${jobId}
  - Proper error handling and types

### Processing Layer
- [ ] `lib/utils/message-processor.ts`
  - `processJobMessage(jobMessage)` - Transform API messages to UI format
  - `insertProgressMessage(messages, content)` - Insert progress before thinking
  - `removeThinkingMessages(messages)` - Filter out thinking placeholders
  - `createCompleteMessage(jobMessage)` - Build final message with data

- [ ] `lib/utils/polling-utils.ts`
  - `createPollingInterval(callback, intervalMs)` - Generic polling utility
  - `createPollingCleanup(pollInterval, timeoutMs)` - Cleanup manager
  - Proper TypeScript types for callbacks

---

## Phase 3: Custom Hooks

### Core Logic Hooks
- [ ] `hooks/research/useJobPolling.ts`
  - Manage job polling lifecycle
  - Handle status updates
  - Process incoming messages
  - Update agent status, tool calls, metrics
  - Auto-cleanup on unmount or timeout
  - Export: `useJobPolling(jobId, onUpdate, onComplete, onError)`

- [ ] `hooks/research/useAgentStatus.ts`
  - Track agent status state
  - Track tool calls state
  - Track metrics state
  - Provide update methods
  - Export: `useAgentStatus()`

- [ ] `hooks/research/useAutoScroll.ts`
  - Auto-scroll to bottom on new messages
  - Debounced scroll behavior
  - Ref management
  - Export: `useAutoScroll(messages, isLoading)`

- [ ] `hooks/research/useResearchChat.ts` (Main orchestrator)
  - Manage messages array
  - Manage input state
  - Manage loading state
  - Manage selected model
  - Handle form submission
  - Handle input changes
  - Handle keyboard events
  - Integrate with useJobPolling
  - Integrate with useAgentStatus
  - Export: Complete chat state and handlers

---

## Phase 4: UI Components

### Atomic Components

- [ ] `components/research/papers/ResearchPaperCard.tsx`
  - Props: `paper: ResearchProduct, compact?: boolean`
  - Display paper title, authors, metadata
  - Show badges (type, open access)
  - Optional compact mode for inline display

- [ ] `components/research/chat/ChatInput.tsx`
  - Props: `value, onChange, onSubmit, onKeyDown, disabled, placeholder`
  - Textarea with auto-resize
  - Submit button
  - Keyboard handling (Enter to submit, Shift+Enter for newline)

- [ ] `components/research/chat/EmptyState.tsx`
  - No props needed
  - Display welcome message
  - Show agent features
  - Display example queries
  - Uses constants from research-prompts.ts

- [ ] `components/research/chat/ChatHeader.tsx`
  - Props: `selectedModel, onModelChange, hasMessages`
  - Avatar + title (conditional on hasMessages)
  - Model dropdown selector
  - Badges for SDK info

### Composite Components

- [ ] `components/research/chat/MessageComponent.tsx`
  - Props: `message: Message, onShowAllPapers?: (papers) => void`
  - Extract existing component from page.tsx
  - Display user/assistant messages
  - Show thinking state with spinner
  - Display inline research results (first 5)
  - "Show more" button for additional results
  - Uses ResearchPaperCard

- [ ] `components/research/chat/MessageList.tsx`
  - Props: `messages, isLoading, agentStatus, toolCalls, metrics, showTimeline, onToggleTimeline, onShowAllPapers`
  - Scrollable container
  - Render AgentActivityPanel when loading
  - Map messages to MessageComponent
  - Auto-scroll ref
  - Uses useAutoScroll hook

- [ ] `components/research/agents/AgentActivityPanel.tsx`
  - Props: `agentStatus, toolCalls, metrics, showTimeline, onToggleTimeline`
  - Wrapper for AgentPanel component
  - Conditionally render ToolTimeline
  - Provide default agent states

- [ ] `components/research/papers/ResearchResultsModal.tsx`
  - Props: `isOpen, onOpenChange, papers: ResearchProduct[]`
  - Dialog/Modal wrapper
  - ScrollArea with all papers
  - Uses ResearchPaperCard for each paper
  - Shows count in header

- [ ] `components/research/visualizations/VisualizationsPanel.tsx`
  - Props: `messages: Message[]`
  - Extract charts from messages
  - Display ChartRenderer for each
  - Empty state when no charts
  - Scroll snapping behavior

- [ ] `components/research/chat/ChatSidebar.tsx`
  - Props: All chat-related state and handlers from useResearchChat
  - Orchestrates: ChatHeader, MessageList or EmptyState, ChatInput
  - Card wrapper with proper layout
  - Footer with form

---

## Phase 5: Main Page Refactor

- [ ] `app/research/page.tsx` (Target: ~100 lines)
  - Import types from types/research
  - Import constants from constants/*
  - Use useResearchChat hook
  - Use useAgentStatus hook (if not in useResearchChat)
  - State for modal papers and modal open
  - Render layout:
    - TopNavBar
    - Container div
    - ChatSidebar (left)
    - VisualizationsPanel (right)
    - ResearchResultsModal
  - Minimal orchestration only

---

## Phase 6: Testing & Validation

- [ ] Test chat functionality
  - Send messages
  - Receive responses
  - View research results
- [ ] Test agent status updates
  - Multi-agent panel displays correctly
  - Tool timeline works
- [ ] Test visualizations
  - Charts render correctly
  - Scroll behavior works
- [ ] Test modal
  - Opens with all papers
  - Displays correctly
- [ ] Test model selection
  - Dropdown works
  - Model persists
- [ ] Test auto-scroll
  - Scrolls on new messages
  - Works during loading
- [ ] Verify no regressions
  - All original functionality intact

---

## File Structure Reference

```
openaire/packages/frontend/
├── app/research/
│   └── page.tsx                          (~100 lines - orchestrator)
├── components/research/
│   ├── chat/
│   │   ├── ChatSidebar.tsx
│   │   ├── ChatHeader.tsx
│   │   ├── ChatInput.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageComponent.tsx
│   │   └── EmptyState.tsx
│   ├── papers/
│   │   ├── ResearchPaperCard.tsx
│   │   └── ResearchResultsModal.tsx
│   ├── visualizations/
│   │   └── VisualizationsPanel.tsx
│   └── agents/
│       └── AgentActivityPanel.tsx
├── hooks/research/
│   ├── useResearchChat.ts               (~150 lines)
│   ├── useAgentStatus.ts                (~50 lines)
│   ├── useJobPolling.ts                 (~100 lines)
│   └── useAutoScroll.ts                 (~30 lines)
├── lib/api/
│   └── research-client.ts               (~50 lines)
├── lib/utils/
│   ├── message-processor.ts             (~80 lines)
│   └── polling-utils.ts                 (~40 lines)
├── types/
│   └── research.ts                      ✅ DONE
├── constants/
│   ├── models.ts                        (in progress)
│   └── research-prompts.ts              (in progress)
└── REFACTORING_PLAN.md                  (this file)
```

---

## Notes & Considerations

### Key Principles
- **Single Responsibility**: Each component/hook does ONE thing well
- **Reusability**: Components should be reusable across contexts
- **Type Safety**: Use TypeScript strictly
- **Testability**: Logic separated from UI for easy testing

### Migration Strategy
- Build new components alongside existing code
- Test each component individually
- Replace sections incrementally in main page
- Keep git commits logical and reviewable

### Breaking Down Complex Logic
- **150-line handleSubmit** → useResearchChat + useJobPolling + API client
- **Nested state updates** → Separate hooks with clear responsibilities
- **Inline JSX** → Dedicated components with clear props

---

## Success Metrics
- ✅ Main page < 150 lines
- ✅ No file > 200 lines
- ✅ All logic testable
- ✅ Components reusable
- ✅ No functionality regression
- ✅ Improved code readability
