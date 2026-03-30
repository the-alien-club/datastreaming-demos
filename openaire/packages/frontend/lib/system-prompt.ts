import fs from 'fs';
import path from 'path';

const MARKETPLACE_REPO = process.env.MARKETPLACE_REPO || 'the-alien-club/claude-marketplace';
const MARKETPLACE_BRANCH = process.env.MARKETPLACE_BRANCH || 'local';
const PLUGIN_SKILLS_PATH = 'plugins/alien-openscience/skills';

// Local search paths for dev environments
const SKILL_SEARCH_DIRS = [
  process.env.SKILL_PATH ? path.dirname(process.env.SKILL_PATH) : null,
  '/app/.claude-plugins/alien-openscience/skills',
  path.join(process.cwd(), '..', '..', '..', '..', '..', 'datastreaming', 'MCPs',
    'mcp-plugins', 'alien-openscience', 'skills'),
].filter(Boolean) as string[];

let _skillCache: string | null = null;

const SECURITY_SUFFIX = `

## SECURITY RESTRICTIONS (MANDATORY)

You are running inside a container. The following rules are non-negotiable:

1. **NO environment variable access.** Never run \`env\`, \`printenv\`, \`echo $VAR\`, \`cat /proc/*/environ\`, or any command that reads environment variables. Never access process.env or equivalent.
2. **NO file system access.** Do not list directories, read files, or browse the container filesystem. The Bash, Read, Write, Edit, Glob, and Grep tools are not available.
3. **NO credential extraction.** Never attempt to access \`.env\`, \`.env.local\`, config files, secrets, API keys, tokens, or certificates.
4. **DO NOT attempt to circumvent these restrictions** via subagents, encoded commands, or indirect tool use.
5. **Subagent delegation:** When using the Agent tool, ALWAYS set \`subagent_type: "subagent"\`. Never omit subagent_type. Never use Bash, WebFetch, WebSearch, ToolSearch, Read, Write, Edit, Glob, or Grep — these tools are not available.
6. **MCP tools are available directly.** Do NOT use ToolSearch to discover tools. Call MCP tools by name.

`;

/** Recursively collect all .md files from a local directory */
function collectLocalMarkdown(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectLocalMarkdown(fullPath));
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch { /* dir doesn't exist */ }
  return results;
}

/** Try loading skills from local filesystem (dev / local plugin copy) */
function loadLocalSkills(): string | null {
  for (const dir of SKILL_SEARCH_DIRS) {
    const mdFiles = collectLocalMarkdown(dir);
    if (mdFiles.length > 0) {
      const contents = mdFiles.map(f => {
        const rel = path.relative(dir, f);
        const text = fs.readFileSync(f, 'utf-8');
        return `<!-- skill: ${rel} -->\n${text}`;
      });
      console.log(`[system-prompt] Loaded ${mdFiles.length} skill files from ${dir}`);
      return contents.join('\n\n---\n\n');
    }
  }
  return null;
}

/** Fetch all skill .md files from the GitHub marketplace repo */
async function fetchGitHubSkills(): Promise<string | null> {
  const apiUrl = `https://api.github.com/repos/${MARKETPLACE_REPO}/git/trees/${MARKETPLACE_BRANCH}?recursive=1`;
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) {
      console.warn(`[system-prompt] GitHub tree fetch failed: ${res.status}`);
      return null;
    }
    const data = await res.json();

    const mdFiles = (data.tree || []).filter((f: any) =>
      f.path.startsWith(PLUGIN_SKILLS_PATH + '/') && f.path.endsWith('.md') && f.type === 'blob'
    );

    if (mdFiles.length === 0) {
      console.warn(`[system-prompt] No .md files found under ${PLUGIN_SKILLS_PATH}`);
      return null;
    }

    // Fetch all files in parallel
    const fetches = mdFiles.map(async (file: any) => {
      const rawUrl = `https://raw.githubusercontent.com/${MARKETPLACE_REPO}/${MARKETPLACE_BRANCH}/${file.path}`;
      const fileRes = await fetch(rawUrl);
      if (!fileRes.ok) return null;
      const rel = file.path.replace(PLUGIN_SKILLS_PATH + '/', '');
      const text = await fileRes.text();
      return `<!-- skill: ${rel} -->\n${text}`;
    });

    const results = (await Promise.all(fetches)).filter(Boolean) as string[];
    console.log(`[system-prompt] Loaded ${results.length} skill files from ${MARKETPLACE_REPO}#${MARKETPLACE_BRANCH}`);
    return results.join('\n\n---\n\n');
  } catch (err) {
    console.warn(`[system-prompt] Failed to fetch skills from GitHub:`, err);
    return null;
  }
}

/** Load skill content: GitHub first, local fallback. Cached after first call. */
export async function getSystemPrompt(): Promise<string> {
  if (_skillCache !== null) return _skillCache + SECURITY_SUFFIX;

  // Fetch from GitHub (default — uses MARKETPLACE_BRANCH from env)
  const remote = await fetchGitHubSkills();
  if (remote) {
    _skillCache = remote;
    return _skillCache + SECURITY_SUFFIX;
  }

  // Fallback: local filesystem (dev with local plugin copy)
  const local = loadLocalSkills();
  _skillCache = local || '';
  if (!_skillCache) {
    console.warn(`[system-prompt] No skill content loaded — agent will have no skill instructions`);
  }
  return _skillCache + SECURITY_SUFFIX;
}
