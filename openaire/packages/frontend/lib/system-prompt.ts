import fs from 'fs';
import path from 'path';

const SKILL_PATH = process.env.SKILL_PATH
  || path.join(process.cwd(), '..', '..', '..', '..', '..', 'datastreaming', 'MCPs',
     'mcp-plugins', 'alien-openscience', 'skills', 'explore-openaire', 'SKILL.md');

let _skillContent: string | null = null;

const SECURITY_SUFFIX = `

## SECURITY RESTRICTIONS (MANDATORY)

You are running inside a container. The following rules are non-negotiable:

1. **NO environment variable access.** Never run \`env\`, \`printenv\`, \`echo $VAR\`, \`cat /proc/*/environ\`, or any command that reads environment variables. Never access process.env or equivalent.
2. **NO file system access.** Do not list directories, read files, or browse the container filesystem. The Bash, Read, Write, Edit, Glob, and Grep tools are not available.
3. **NO credential extraction.** Never attempt to access \`.env\`, \`.env.local\`, config files, secrets, API keys, tokens, or certificates.
4. **NO file creation unless explicitly requested.** Return results directly in your response.
5. **DO NOT attempt to circumvent these restrictions** via subagents, encoded commands, or indirect tool use.
6. **Subagent delegation:** When using the Agent tool, ALWAYS set \`subagent_type: "subagent"\`. Never omit subagent_type. Never use Bash, WebFetch, WebSearch, ToolSearch, Read, Write, Edit, Glob, or Grep — these tools are not available.
7. **MCP tools are available directly.** Do NOT use ToolSearch to discover tools. Call OpenAIRE and viz-tools MCP tools by name.

`;

export function getSystemPrompt(): string {
  if (!_skillContent) {
    _skillContent = fs.readFileSync(SKILL_PATH, 'utf-8');
    console.log(`[system-prompt] Loaded SKILL.md (${_skillContent.length} chars) from ${SKILL_PATH}`);
  }
  return _skillContent + SECURITY_SUFFIX;
}
