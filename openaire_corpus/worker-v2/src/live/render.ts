/**
 * Pure markdown rendering of a prepared doc — the `original`/`processed` artifact
 * stored in the data cluster. Front-matter-ish header (title, authors, year,
 * venue, doi) followed by the chunk bodies, page-headed for the fulltext lane so
 * the stored text stays navigable and citations map to a page.
 */
import type { OaMeta, PreparedChunk } from "../domain/types.js";

export function renderMarkdown(meta: OaMeta, chunks: PreparedChunk[]): string {
  const header: string[] = [`# ${meta.title}`];
  if (meta.authors.length > 0) header.push(`**Authors:** ${meta.authors.join(", ")}`);
  if (meta.year !== null) header.push(`**Year:** ${meta.year}`);
  if (meta.venue) header.push(`**Venue:** ${meta.venue}`);
  if (meta.publisher) header.push(`**Publisher:** ${meta.publisher}`);
  if (meta.doi) header.push(`**DOI:** ${meta.doi}`);

  const body = chunks.map((c) => {
    if (c.locator.kind === "page") {
      const part = c.locator.part !== undefined ? ` (part ${c.locator.part + 1})` : "";
      return `## Page ${c.locator.page}${part}\n\n${c.text.trim()}`;
    }
    if (c.locator.kind === "abstract") return `## Abstract\n\n${c.text.trim()}`;
    return c.text.trim();
  });

  return [header.join("\n"), ...body].join("\n\n");
}
