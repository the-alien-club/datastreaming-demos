// Shared static option lists for MCP/data-source UI. Pulled out of
// `mcps-view.tsx` so the own page, the readonly library grid, and the
// in-dialog pickers can all reference the same authoritative lists.

export const CATEGORY_OPTIONS = [
  "Gestion des contrats",
  "Droit international",
  "Droit du numérique",
  "Droit de la famille",
  "Droit de l'urbanisme et immobilier",
  "Generalites",
  "Droit des affaires",
  "Droit de la consommation",
  "Droit des assurances",
  "Droit public",
  "Droit fiscal",
  "Droit de l'environnement",
  "Droit des sociétés",
  "Contentieux",
  "Propriété intellectuelle",
  "Projets stratégiques",
  "Droit social",
  "Formation et Documentation",
  "Conformité réglementaire",
  "Droit de l'urbanisme",
] as const

export const TYPE_OPTIONS = ["Logiciels tier", "Open Data", "Ontologies"] as const
