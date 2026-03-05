// Claude Code process manager — one persistent process per chat session.
// Spawns `claude -p` with bidirectional JSON streaming (--input-format stream-json --output-format stream-json).

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import { getSystemPrompt } from './system-prompt';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface ClaudeProcess {
  process: ChildProcess;
  readline: Interface;
  sessionId: string | null;
  alive: boolean;
  lastActivity: number;
}

// Global process map: chatSessionKey → ClaudeProcess
const processMap = new Map<string, ClaudeProcess>();

// Idle timeout: kill processes unused for 30 minutes
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

let cleanupTimer: NodeJS.Timeout | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    Array.from(processMap.entries()).forEach(([key, proc]) => {
      if (now - proc.lastActivity > IDLE_TIMEOUT_MS) {
        console.log(`[claude-process] Idle timeout, killing process for session: ${key}`);
        destroyProcess(key);
      }
    });
  }, 5 * 60 * 1000);
}

/**
 * Generate an MCP config file with resolved paths.
 * When OPENAIRE_MCP_URL is set, adds an HTTP MCP server with the access token.
 * Returns the path to the temp config file.
 */
function generateMcpConfig(accessToken?: string): string {
  const vizMcpPath = path.join(process.cwd(), '..', 'viz-mcp', 'dist', 'index.js');

  const mcpServers: Record<string, any> = {
    'viz-tools': {
      command: 'node',
      args: [vizMcpPath],
    },
  };

  // Add remote OpenAIRE MCP server when URL is configured
  const openaireMcpUrl = process.env.OPENAIRE_MCP_URL;
  if (openaireMcpUrl) {
    const serverConfig: Record<string, any> = {
      type: 'http',
      url: openaireMcpUrl,
    };
    if (accessToken) {
      serverConfig.headers = {
        Authorization: `Bearer ${accessToken}`,
      };
    }
    mcpServers['openaire-local'] = serverConfig;
    console.log(`[claude-process] Remote MCP: ${openaireMcpUrl} (auth: ${accessToken ? 'yes' : 'no'})`);
  }

  const config = { mcpServers };

  const configDir = path.join(os.tmpdir(), 'claude-openaire');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const configPath = path.join(configDir, 'mcp-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`[claude-process] MCP config written to ${configPath}`);
  return configPath;
}

/**
 * Get or create a persistent Claude Code process for a chat session.
 */
export function getOrCreateProcess(chatSessionKey: string, model: string, accessToken?: string): ClaudeProcess {
  const existing = processMap.get(chatSessionKey);
  if (existing && existing.alive) {
    existing.lastActivity = Date.now();
    console.log(`[claude-process] Reusing existing process for session: ${chatSessionKey}`);
    return existing;
  }

  // Clean up dead process entry if any
  if (existing) {
    processMap.delete(chatSessionKey);
  }

  const mcpConfigPath = generateMcpConfig(accessToken);
  const pluginDir = process.env.PLUGIN_DIR;

  const args = [
    '-p',
    '--verbose',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--mcp-config', mcpConfigPath,
    '--permission-mode', 'bypassPermissions',
    '--model', model,
    '--allowedTools', '*',
  ];

  if (pluginDir) {
    // Docker/standalone: plugin provides skill + MCP config
    args.push('--plugin-dir', pluginDir);
    console.log(`[claude-process] Plugin dir: ${pluginDir}`);
  } else {
    // Local dev: plugin loaded from ~/.claude, pass system prompt explicitly
    const systemPrompt = getSystemPrompt();
    args.push('--system-prompt', systemPrompt);
  }

  console.log(`[claude-process] Spawning claude process for session: ${chatSessionKey}`);
  console.log(`[claude-process] Model: ${model}`);

  const child = spawn('claude', args, {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const rl = createInterface({ input: child.stdout! });

  const claudeProc: ClaudeProcess = {
    process: child,
    readline: rl,
    sessionId: null,
    alive: true,
    lastActivity: Date.now(),
  };

  // Log stderr for debugging
  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) {
      console.error(`[claude-process:stderr:${chatSessionKey}] ${text}`);
    }
  });

  child.on('exit', (code, signal) => {
    console.log(`[claude-process] Process exited for session ${chatSessionKey}: code=${code}, signal=${signal}`);
    claudeProc.alive = false;
  });

  child.on('error', (err) => {
    console.error(`[claude-process] Process error for session ${chatSessionKey}:`, err);
    claudeProc.alive = false;
  });

  processMap.set(chatSessionKey, claudeProc);
  ensureCleanupTimer();

  return claudeProc;
}

/**
 * Write a user message to the Claude process stdin.
 * Format: JSON object with type "user" on a single line.
 */
export function writeUserMessage(proc: ClaudeProcess, message: string): void {
  if (!proc.alive || !proc.process.stdin?.writable) {
    throw new Error('Claude process is not alive or stdin is not writable');
  }

  const userMsg = {
    type: 'user',
    message: {
      role: 'user',
      content: message,
    },
  };

  proc.process.stdin.write(JSON.stringify(userMsg) + '\n');
  proc.lastActivity = Date.now();
  console.log(`[claude-process] Wrote user message (${message.length} chars)`);
}

/**
 * Kill and clean up a Claude process.
 */
export function destroyProcess(chatSessionKey: string): void {
  const proc = processMap.get(chatSessionKey);
  if (proc) {
    proc.alive = false;
    proc.readline.close();
    proc.process.stdin?.end();
    proc.process.kill('SIGTERM');
    processMap.delete(chatSessionKey);
    console.log(`[claude-process] Destroyed process for session: ${chatSessionKey}`);
  }
}
