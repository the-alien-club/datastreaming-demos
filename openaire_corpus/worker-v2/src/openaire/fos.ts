/**
 * OpenAIRE Fields of Science (FOS) vocabulary — code/id → clean label.
 *
 * Source of truth: src/openaire/spec/fos_vocabulary.json (vendored from the
 * mcp-openaire repo). The vocabulary is a nested tree of {code, id, label,
 * level, children[]}; the Graph API tags a product's subjects with the `id`
 * form ("0301 basic medicine") or the bare code ("0301"). We flatten the tree
 * once at module load into a lookup so the resolve stage can present a clean
 * human label ("basic medicine") instead of the code-prefixed id.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

interface FosNode {
  code: string;
  id: string;
  label: string;
  level: number;
  children?: FosNode[];
}

function buildLookup(): Map<string, string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "spec", "fos_vocabulary.json"), "utf8");
  const parsed = JSON.parse(raw) as { fos: FosNode[] };
  const map = new Map<string, string>();
  const walk = (node: FosNode): void => {
    if (node.code && node.label) map.set(node.code, node.label);
    if (node.id && node.label) map.set(node.id.toLowerCase(), node.label);
    for (const c of node.children ?? []) walk(c);
  };
  for (const top of parsed.fos ?? []) walk(top);
  return map;
}

// Built once — the vocabulary is static (a few thousand entries).
let _lookup: Map<string, string> | null = null;
function lookup(): Map<string, string> {
  if (_lookup === null) _lookup = buildLookup();
  return _lookup;
}

/**
 * Clean a raw subject string. FOS subjects arrive as "0301 basic medicine" or a
 * bare code; return the human label ("basic medicine"). Non-FOS subjects (plain
 * keywords) pass through trimmed. Empty/blank → null.
 */
export function cleanSubject(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "") return null;
  const map = lookup();
  // Exact id match ("0301 basic medicine") or bare code ("0301").
  const byId = map.get(s.toLowerCase());
  if (byId) return byId;
  const codeMatch = /^(\d{2,6})\b/.exec(s);
  const code = codeMatch?.[1];
  if (codeMatch && code) {
    const byCode = map.get(code);
    if (byCode) return byCode;
    // A code with a trailing label but no vocab hit — strip the numeric prefix.
    const rest = s.slice(codeMatch[0].length).trim();
    if (rest) return rest;
  }
  return s;
}

/** Clean + dedupe a list of raw subjects, dropping blanks. */
export function cleanSubjects(raws: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const r of raws) {
    const c = cleanSubject(r);
    if (c) out.add(c);
  }
  return [...out];
}
