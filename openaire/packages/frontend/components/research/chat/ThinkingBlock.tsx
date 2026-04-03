import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ToolActivity } from "@/lib/job-store";

interface ProgressItem {
  content: string;
  timestamp: number;
}

interface ThinkingBlockProps {
  progressMessages: ProgressItem[];
  toolActivity?: ToolActivity[];
}

/** Pretty-print an MCP tool name */
function formatToolName(name: string): string {
  return name
    .replace(/^mcp__(?:plugin_openaire_)?(?:openaire-local|openaire|viz-tools)__/, '')
    .replace(/^openaire_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

/** Format tool input params for display — compact key: value pairs */
function formatInputParams(input: Record<string, any>): { key: string; value: string }[] {
  return Object.entries(input)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([key, value]) => {
      let display: string;
      if (typeof value === 'string') {
        display = value.length > 60 ? value.slice(0, 57) + '...' : value;
      } else if (Array.isArray(value)) {
        display = JSON.stringify(value);
        if (display.length > 60) display = display.slice(0, 57) + '...';
      } else {
        display = String(value);
      }
      return { key, value: display };
    });
}

/** Format output snippet: extract meaningful fields and present as key: value lines */
function formatOutputSnippet(snippet: string): { lines: { key: string; value: string }[]; fallback?: string } {
  // Try to parse as JSON (may be truncated, so try adding closing braces)
  let obj: any = null;
  for (const suffix of ['', '}', '}}', '"}}', '"]}}']) {
    try {
      obj = JSON.parse(snippet + suffix);
      break;
    } catch { /* try next */ }
  }

  if (obj && typeof obj === 'object') {
    // Known MCP response shape: { success, data: { ... } }
    if (obj.success !== undefined && obj.data) {
      const data = obj.data;
      const lines: { key: string; value: string }[] = [];

      // Summary / title / description
      if (data.title) lines.push({ key: 'title', value: truncVal(data.title) });
      if (data.description) lines.push({ key: 'description', value: truncVal(data.description) });
      if (data.center) lines.push({ key: 'center', value: truncVal(String(data.center)) });
      if (obj.summary) lines.push({ key: 'summary', value: truncVal(obj.summary) });

      // Counts for arrays / pagination
      if (data.pagination?.total !== undefined) lines.push({ key: 'total', value: String(data.pagination.total) });
      for (const [k, v] of Object.entries(data)) {
        if (Array.isArray(v)) lines.push({ key: k, value: `${v.length} items` });
      }
      // Metadata
      if (data.metadata && typeof data.metadata === 'object') {
        lines.push({ key: 'metadata', value: truncVal(JSON.stringify(data.metadata)) });
      }

      if (lines.length > 0) return { lines: lines.slice(0, 5) };
    }

    // Generic object: show top-level keys with truncated values
    const lines: { key: string; value: string }[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) lines.push({ key: k, value: `${v.length} items` });
      else if (typeof v === 'object') lines.push({ key: k, value: truncVal(JSON.stringify(v)) });
      else lines.push({ key: k, value: truncVal(String(v)) });
      if (lines.length >= 5) break;
    }
    if (lines.length > 0) return { lines };
  }

  // Fallback: plain text, truncated
  const firstLine = snippet.split('\n')[0];
  return { lines: [], fallback: firstLine.length > 100 ? firstLine.slice(0, 97) + '...' : firstLine };
}

function truncVal(s: string): string {
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

const statusConfig = {
  running: { icon: '⏳', label: 'Running', className: 'border-blue-500/30 bg-blue-500/5' },
  completed: { icon: '✓', label: 'Done', className: 'border-green-600/30 bg-green-600/5' },
  error: { icon: '✗', label: 'Error', className: 'border-red-500/30 bg-red-500/5' },
};

type TimelineItem =
  | { kind: 'text'; content: string; timestamp: number }
  | { kind: 'tool'; activity: ToolActivity; timestamp: number };

function ToolCallCard({ activity }: { activity: ToolActivity }) {
  const config = statusConfig[activity.status];
  const params = activity.input ? formatInputParams(activity.input) : [];
  const duration = activity.completedAt
    ? ((activity.completedAt - activity.startedAt) / 1000).toFixed(1)
    : null;

  return (
    <div className={`rounded-md border px-3 py-2 text-xs font-mono ${config.className}`}>
      <div className="flex items-center gap-2">
        <span>{config.icon}</span>
        <span className="font-semibold text-foreground">{formatToolName(activity.toolName)}</span>
        {duration && <span className="text-muted-foreground ml-auto">{duration}s</span>}
        {activity.status === 'running' && (
          <span className="text-blue-500 animate-pulse ml-auto">
            {activity.elapsedSeconds != null ? `${activity.elapsedSeconds.toFixed(0)}s` : 'running'}
          </span>
        )}
      </div>
      {activity.status === 'running' && activity.subStatus && (
        <div className="mt-1 pl-5 text-xs text-blue-400 animate-pulse">{activity.subStatus}</div>
      )}
      {params.length > 0 && (
        <div className="mt-1.5 space-y-0.5 pl-5">
          {params.map(({ key, value }) => (
            <div key={key} className="text-muted-foreground">
              <span className="text-foreground/70">{key}:</span>{' '}
              <span className="text-muted-foreground">{value}</span>
            </div>
          ))}
        </div>
      )}
      {activity.outputSnippet && activity.status !== 'running' && (() => {
        const { lines, fallback } = formatOutputSnippet(activity.outputSnippet);
        if (lines.length > 0) {
          return (
            <div className="mt-1.5 space-y-0.5 pl-5 text-muted-foreground">
              {lines.map(({ key, value }) => (
                <div key={key} className="truncate">
                  <span className="text-foreground/70">{key}:</span>{' '}
                  <span>{value}</span>
                </div>
              ))}
            </div>
          );
        }
        if (fallback) {
          return (
            <div className="mt-1.5 pl-5 text-muted-foreground truncate">
              → {fallback}
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}

export function ThinkingBlock({ progressMessages, toolActivity = [] }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Build a unified chronological timeline from text steps and tool activities
  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    for (const msg of progressMessages) {
      if (msg.content) {
        items.push({ kind: 'text', content: msg.content, timestamp: msg.timestamp });
      }
    }

    for (const activity of toolActivity) {
      items.push({ kind: 'tool', activity, timestamp: activity.startedAt });
    }

    // Sort by timestamp; for equal timestamps, text comes before tools
    // (since text is emitted in the same assistant block before tool_use)
    items.sort((a, b) => {
      const diff = a.timestamp - b.timestamp;
      if (diff !== 0) return diff;
      if (a.kind === 'text' && b.kind === 'tool') return -1;
      if (a.kind === 'tool' && b.kind === 'text') return 1;
      return 0;
    });

    return items;
  }, [progressMessages, toolActivity]);

  if (timeline.length === 0) return null;

  return (
    <div className="flex items-start gap-2">
      <div className="w-5 flex-shrink-0 mt-2.5 flex justify-center">
        <div className="w-3 h-3 rounded-full bg-foreground" />
      </div>
      <div className="flex flex-col max-w-[90%] md:max-w-[75%]">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 p-2 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="italic">
            {toolActivity.some(t => t.status === 'running')
              ? `Working... (${timeline.length} steps)`
              : `Thinking (${timeline.length} steps)`}
          </span>
        </button>

        {isExpanded && (
          <div className="mt-2 space-y-2">
            {timeline.map((item, index) => {
              if (item.kind === 'text') {
                return (
                  <div key={`text-${index}`} className="p-3 rounded-md text-sm bg-muted/50 border border-muted">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                    </div>
                  </div>
                );
              }
              return (
                <ToolCallCard
                  key={`tool-${item.activity.toolUseId || index}`}
                  activity={item.activity}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
