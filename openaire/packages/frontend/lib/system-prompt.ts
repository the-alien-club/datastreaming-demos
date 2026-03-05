import fs from 'fs';
import path from 'path';

const SKILL_PATH = process.env.SKILL_PATH
  || path.join(process.cwd(), '..', '..', '..', '..', '..', 'datastreaming', 'MCPs',
     'mcp-plugins', 'alien-openscience', 'skills', 'explore-openaire', 'SKILL.md');

let _skillContent: string | null = null;

export function getSystemPrompt(): string {
  if (!_skillContent) {
    _skillContent = fs.readFileSync(SKILL_PATH, 'utf-8');
    console.log(`[system-prompt] Loaded SKILL.md (${_skillContent.length} chars) from ${SKILL_PATH}`);
  }
  return _skillContent;
}
