/**
 * PURE JATS XML → structured sections + figures. No I/O — the fetch stage supplies
 * the XML string; this only parses. Used for the Europe PMC / publisher-JATS
 * full-text lane, which yields clean structured text (no OCR error rate).
 *
 * We parse ONLY the `<body>` — the abstract already comes from the OpenAIRE meta,
 * and front/back matter (refs, author notes) is noise for retrieval. Each top-level
 * `<body><sec>` becomes one `JatsSection` (nested `<sec>` titles are folded in as
 * sub-headings so their text stays attributed). Inline markup (`<italic>`, `<xref>`,
 * …) is flattened to text; a `<fig>`'s caption is inlined as a paragraph so figure
 * text stays searchable, and the figure is also recorded (id f1…fN, href) for the
 * image-fetch + `rag_list_figures` path.
 *
 * preserveOrder is required: JATS body is mixed content (text interleaved with
 * inline tags) and the default parser drops text order.
 */
import { XMLParser } from "fast-xml-parser";

export interface JatsSection {
  /** Slug-safe section id ("results", "materials-and-methods", "s1"). */
  id: string;
  /** Human-readable section title ("Results"). */
  title: string;
  /** Flattened section text (sub-section titles folded in, figure captions inlined). */
  text: string;
}

export interface JatsFigure {
  /** Stable per-doc id in document order — "f1", "f2", … */
  id: string;
  /** Figure caption (label + caption text), possibly empty. */
  caption: string;
  /** The `<graphic xlink:href>` value — a bare filename/relative path, NOT a URL. */
  href: string;
}

export interface ParsedJats {
  sections: JatsSection[];
  figures: JatsFigure[];
}

/** A preserveOrder node: exactly one content key (the tag name or "#text"), plus an
 *  optional ":@" attributes bag. */
type OrderedNode = Record<string, unknown> & { ":@"?: Record<string, unknown> };

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: false, // we trim ourselves; JATS relies on inter-tag whitespace
  processEntities: true,
});

/** The tag name of an ordered node (the one key that isn't ":@"), or null for text. */
function tagOf(node: OrderedNode): string | null {
  for (const k of Object.keys(node)) {
    if (k !== ":@" && k !== "#text") return k;
  }
  return null;
}

function childrenOf(node: OrderedNode, tag: string): OrderedNode[] {
  const v = node[tag];
  return Array.isArray(v) ? (v as OrderedNode[]) : [];
}

function attr(node: OrderedNode, name: string): string | null {
  const bag = node[":@"];
  if (!bag) return null;
  const v = bag[`@_${name}`];
  return typeof v === "string" ? v : null;
}

/** Back-matter section titles/types that carry no research content — excluded so the
 *  index and the citable-section list stay to the actual paper. eLife puts these
 *  (and References) inside `<body>`, not `<back>`. */
const BACKMATTER_TITLES = new Set([
  "references",
  "acknowledgements",
  "acknowledgments",
  "funding statement",
  "funding information",
  "contributor information",
  "additional information",
  "additional files",
  "data availability",
  "author contributions",
  "competing interests",
  "conflict of interest",
  "conflicts of interest",
  "ethics",
  "supplementary material",
  "supplementary materials",
  "abbreviations",
  "decision letter",
  "author response",
]);
/** JATS `sec-type` values marking back-matter (eLife/PMC use these). */
const BACKMATTER_SEC_TYPES = new Set([
  "data-availability",
  "additional-information",
  "supplementary-material",
  "funding-information",
  "author-contributions",
  "coi-statement",
  "ethics",
]);

function isBackMatter(secKids: OrderedNode[], secTitle: string, secType: string | null): boolean {
  if (secType && BACKMATTER_SEC_TYPES.has(secType.toLowerCase())) return true;
  if (BACKMATTER_TITLES.has(secTitle.trim().toLowerCase())) return true;
  // A section whose only substantive child is a <ref-list> (bibliography wrapper).
  const meaningful = secKids.filter((k) => {
    const t = tagOf(k);
    return t != null && t !== "title" && t !== ":@";
  });
  return meaningful.length > 0 && meaningful.every((k) => tagOf(k) === "ref-list");
}

/** Slugify a section title/id to `[a-z0-9-]+`; empty → "". */
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Recursively flatten a node's descendants to text. Block elements (`<p>`, `<sec>`,
 *  `<title>`) are separated by blank lines; inline elements concatenate. `<fig>` and
 *  `<table-wrap>` are handled by the caller (they don't recurse here). */
function textOf(nodes: OrderedNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (typeof node["#text"] === "string") {
      parts.push(node["#text"] as string);
      continue;
    }
    const tag = tagOf(node);
    if (tag == null) continue;
    // A figure: inline its caption as a paragraph so figure text stays searchable
    // (the image itself is fetched separately). Its href is collected elsewhere.
    if (tag === "fig") {
      const { caption } = readFigure(childrenOf(node, "fig"));
      if (caption) parts.push(`\n\n${caption}\n\n`);
      continue;
    }
    // Skip other structural/no-text elements that would inject noise. `<ref-list>`
    // is the bibliography (eLife nests it in <body>); dumping every reference into
    // the section text is pure noise for retrieval.
    if (tag === "table-wrap" || tag === "disp-formula" || tag === "graphic" || tag === "ref-list") {
      continue;
    }
    const kids = childrenOf(node, tag);
    const inner = textOf(kids);
    if (tag === "p" || tag === "title" || tag === "sec" || tag === "list-item" || tag === "caption") {
      parts.push(`\n\n${inner}\n\n`);
    } else {
      parts.push(inner);
    }
  }
  return parts.join("");
}

/** Collapse runs of blank lines/spaces from textOf into tidy paragraphs. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first `<title>` child's flattened text, or "". */
function titleOf(secKids: OrderedNode[]): string {
  for (const k of secKids) {
    if (tagOf(k) === "title") return tidy(textOf(childrenOf(k, "title")));
  }
  return "";
}

/** Extract a `<fig>`'s caption (label + caption text) and its graphic href. */
function readFigure(figKids: OrderedNode[]): { caption: string; href: string } {
  let label = "";
  let caption = "";
  let href = "";
  const walkForGraphic = (nodes: OrderedNode[]): void => {
    for (const n of nodes) {
      const t = tagOf(n);
      if (t === "graphic") {
        href = attr(n, "xlink:href") ?? attr(n, "href") ?? href;
      } else if (t != null) {
        walkForGraphic(childrenOf(n, t));
      }
    }
  };
  for (const k of figKids) {
    const t = tagOf(k);
    if (t === "label") label = tidy(textOf(childrenOf(k, "label")));
    else if (t === "caption") caption = tidy(textOf(childrenOf(k, "caption")));
  }
  walkForGraphic(figKids);
  const full = [label, caption].filter((s) => s.length > 0).join(". ");
  return { caption: full, href };
}

/** Collect every `<fig>` under a subtree, in document order. */
function collectFigures(nodes: OrderedNode[], out: Array<{ caption: string; href: string }>): void {
  for (const n of nodes) {
    const t = tagOf(n);
    if (t === "fig") {
      out.push(readFigure(childrenOf(n, "fig")));
    } else if (t != null) {
      collectFigures(childrenOf(n, t), out);
    }
  }
}

/** Parse JATS XML into body sections + figures. Returns empty arrays on unparseable
 *  or body-less input (the caller degrades to the next tier / abstract). */
export function parseJats(xml: string): ParsedJats {
  let tree: OrderedNode[];
  try {
    tree = parser.parse(xml) as OrderedNode[];
  } catch {
    return { sections: [], figures: [] };
  }

  const article = findFirst(tree, "article");
  const body = article ? findFirst(childrenOf(article, "article"), "body") : null;
  if (!body) return { sections: [], figures: [] };
  const bodyKids = childrenOf(body, "body");

  // Figures: document order across the whole body → stable f1…fN ids.
  const rawFigs: Array<{ caption: string; href: string }> = [];
  collectFigures(bodyKids, rawFigs);
  const figures: JatsFigure[] = rawFigs
    .filter((f) => f.href.length > 0)
    .map((f, i) => ({ id: `f${i + 1}`, caption: f.caption, href: f.href }));

  // Sections: each top-level <sec> → one JatsSection. If the body has loose <p>
  // with no <sec>, emit a single "Full text" section.
  const topSecs = bodyKids.filter((n) => tagOf(n) === "sec");
  const sections: JatsSection[] = [];
  const usedIds = new Set<string>();
  if (topSecs.length === 0) {
    const text = tidy(textOf(bodyKids));
    if (text.length > 0) sections.push({ id: "body", title: "Full text", text });
  } else {
    let n = 0;
    for (const sec of topSecs) {
      n++;
      const kids = childrenOf(sec, "sec");
      const title = titleOf(kids) || `Section ${n}`;
      // Drop bibliography + boilerplate back-matter (eLife nests it in <body>).
      if (isBackMatter(kids, title, attr(sec, "sec-type"))) continue;
      const text = tidy(textOf(kids));
      if (text.length === 0) continue;
      let id = attr(sec, "id") ? slugify(attr(sec, "id")!) : slugify(title);
      if (!id) id = `s${n}`;
      // Dedupe collisions (two "Methods" sections, or reused sec ids).
      let unique = id;
      let suffix = 2;
      while (usedIds.has(unique)) unique = `${id}-${suffix++}`;
      usedIds.add(unique);
      sections.push({ id: unique, title, text });
    }
  }

  return { sections, figures };
}

/** First descendant (BFS over the ordered forest) whose tag matches `name`. */
function findFirst(nodes: OrderedNode[], name: string): OrderedNode | null {
  for (const n of nodes) {
    if (tagOf(n) === name) return n;
  }
  for (const n of nodes) {
    const t = tagOf(n);
    if (t == null) continue;
    const hit = findFirst(childrenOf(n, t), name);
    if (hit) return hit;
  }
  return null;
}
