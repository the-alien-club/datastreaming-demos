/**
 * Dataset slug + schema for OpenAIRE corpus datasets.
 *
 * One dataset per project; slug is `openaire-<projectId>`. The schema mirrors the
 * OaMeta shape so the cluster can validate ingested entries.
 */

export function openaireDatasetSlug(projectId: string): string {
  return `openaire-${projectId}`;
}

export function openaireDatasetSchema(projectId: string): Record<string, unknown> {
  const schemaId = `openaire_${projectId.replace(/[^a-zA-Z0-9]/g, "_")}`;
  return {
    schema_id: schemaId,
    version: "v1",
    description: `Schema for OpenAIRE project ${projectId} research products`,
    original: {
      required_files: [],
      optional_files: ["doc.md", "document.pdf", "document.xml"],
      metadata_schema: {
        type: "object",
        properties: {
          openaire_id: { type: "string" },
          doi: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          authors: { type: "array", items: { type: "string" } },
          year: { type: ["integer", "null"] },
          venue: { type: ["string", "null"] },
          publisher: { type: ["string", "null"] },
          type: { type: ["string", "null"] },
          best_access_right: { type: ["string", "null"] },
          open_access_color: { type: ["string", "null"] },
          has_fulltext: { type: "boolean" },
          source: { type: "string" },
        },
        required: ["openaire_id", "source"],
      },
    },
    processed: {
      content_schema: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
      },
      required_files: [],
      optional_files: [],
    },
    processing: {
      intermediate_files: [],
      retention_days: 7,
    },
  };
}
