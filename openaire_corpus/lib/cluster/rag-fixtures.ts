// lib/cluster/rag-fixtures.ts
// Hand-written fake passages for the FakeRagRunner.
//
// Each entry extends RagPassage with a `topics` string array used by the
// scoring function to match against free-text queries without any embedding
// model. Topics are lowercase English keywords — the scorer does a simple
// substring check.
//
// The fixtures model a small CRISPR-Cas9 literature corpus (the design's demo
// scenario). openaireIds / DOIs are plausible but synthetic; passages are
// illustrative excerpts, NOT verbatim reproductions of the cited papers. Each
// record contributes an abstract chunk (locator "abstract") and one or more
// body-page chunks (locator "p<N>").

import type { RagPassage } from "./rag"

// Fixtures carry no entryId — the FakeRagRunner derives a stable one from the
// openaireId (and uses it to reconstruct full text). Everything else mirrors
// RagPassage.
export type RagFixture = Omit<RagPassage, "entryId"> & { topics: string[] }

export const RAG_FIXTURES: RagFixture[] = [
  // ── Cong et al., Science 2013 — Multiplex genome engineering ─────────────
  {
    openaireId: "50|doi_dedup___::a1b2c3d4e5f60718",
    doi: "10.1126/science.1231143",
    locator: "abstract",
    snippet:
      "Functional elements of the type II CRISPR system from Streptococcus pyogenes can be engineered to enable RNA-guided genome editing in mammalian cells. Cas9 nuclease, directed by a short guide RNA, introduces precise double-strand breaks at endogenous genomic loci in human and mouse cells.",
    score: 0.0,
    charRange: [0, 288] as [number, number],
    title: "Multiplex Genome Engineering Using CRISPR/Cas Systems",
    year: 2013,
    topics: ["crispr", "cas9", "genome editing", "guide rna", "mammalian cells", "streptococcus pyogenes", "double-strand break"],
  },
  {
    openaireId: "50|doi_dedup___::a1b2c3d4e5f60718",
    doi: "10.1126/science.1231143",
    locator: "p3",
    snippet:
      "By co-expressing multiple guide RNAs, we achieved simultaneous editing of several genomic sites, demonstrating the multiplexing capacity of the system. Homology-directed repair with a donor template enabled precise sequence replacement at the targeted locus.",
    score: 0.0,
    charRange: [289, 540] as [number, number],
    title: "Multiplex Genome Engineering Using CRISPR/Cas Systems",
    year: 2013,
    topics: ["multiplex", "guide rna", "homology-directed repair", "donor template", "targeting", "editing efficiency"],
  },

  // ── Jinek et al., Science 2012 — Programmable dual-RNA endonuclease ───────
  {
    openaireId: "50|doi_dedup___::b2c3d4e5f6071829",
    doi: "10.1126/science.1225829",
    locator: "abstract",
    snippet:
      "We show that the Cas9 endonuclease can be programmed with a single chimeric RNA to cleave specific DNA sequences. The dual-tracrRNA:crRNA duplex, fused into one guide RNA, directs sequence-specific cleavage, establishing a simple two-component system for genome editing.",
    score: 0.0,
    charRange: [0, 275] as [number, number],
    title: "A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity",
    year: 2012,
    topics: ["cas9", "endonuclease", "tracrrna", "crrna", "single guide rna", "dna cleavage", "bacterial immunity", "mechanism"],
  },
  {
    openaireId: "50|doi_dedup___::b2c3d4e5f6071829",
    doi: "10.1126/science.1225829",
    locator: "p5",
    snippet:
      "Cleavage requires a short protospacer-adjacent motif (PAM) immediately downstream of the target sequence. The HNH and RuvC-like nuclease domains each cut one strand of the double helix, producing a blunt double-strand break three base pairs upstream of the PAM.",
    score: 0.0,
    charRange: [276, 530] as [number, number],
    title: "A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity",
    year: 2012,
    topics: ["pam", "protospacer", "hnh domain", "ruvc", "nuclease domain", "blunt cut", "mechanism"],
  },

  // ── Mali et al., Science 2013 — RNA-guided human genome engineering ──────
  {
    openaireId: "50|doi_dedup___::c3d4e5f607182930",
    doi: "10.1126/science.1232033",
    locator: "abstract",
    snippet:
      "We engineered the type II bacterial CRISPR system to function in human cells. Using a codon-optimized Cas9 and custom guide RNAs, we achieved targeted cleavage and homologous recombination at endogenous loci in induced pluripotent stem cells and other human cell lines.",
    score: 0.0,
    charRange: [0, 278] as [number, number],
    title: "RNA-Guided Human Genome Engineering via Cas9",
    year: 2013,
    topics: ["human cells", "cas9", "codon-optimized", "ips cells", "pluripotent stem cells", "homologous recombination", "genome engineering"],
  },

  // ── Hsu, Lander & Zhang, Cell 2014 — Development and applications ─────────
  {
    openaireId: "50|doi_dedup___::d4e5f60718293041",
    doi: "10.1016/j.cell.2014.05.010",
    locator: "abstract",
    snippet:
      "CRISPR-Cas9 has transformed genome engineering. Here we review its development, mechanism, and applications, and discuss off-target effects, delivery strategies, and approaches to improving specificity for research and therapeutic use.",
    score: 0.0,
    charRange: [0, 235] as [number, number],
    title: "Development and Applications of CRISPR-Cas9 for Genome Engineering",
    year: 2014,
    topics: ["review", "off-target", "specificity", "delivery", "therapeutic", "applications", "crispr", "cas9"],
  },
  {
    openaireId: "50|doi_dedup___::d4e5f60718293041",
    doi: "10.1016/j.cell.2014.05.010",
    locator: "p9",
    snippet:
      "Off-target cleavage is influenced by guide RNA sequence, mismatch position, and the concentration and duration of Cas9 activity. Truncated guide RNAs and high-fidelity Cas9 variants substantially reduce unintended edits without sacrificing on-target efficiency.",
    score: 0.0,
    charRange: [236, 500] as [number, number],
    title: "Development and Applications of CRISPR-Cas9 for Genome Engineering",
    year: 2014,
    topics: ["off-target", "mismatch", "high-fidelity", "truncated guide", "specificity", "on-target efficiency"],
  },

  // ── Doudna & Charpentier, Science 2014 — The new frontier ────────────────
  {
    openaireId: "50|doi_dedup___::e5f6071829304152",
    doi: "10.1126/science.1258096",
    locator: "abstract",
    snippet:
      "The RNA-programmed genome editing technology derived from the bacterial CRISPR-Cas9 system opens a new frontier in the life sciences, enabling researchers to alter DNA sequences and modify gene function across a wide range of organisms.",
    score: 0.0,
    charRange: [0, 232] as [number, number],
    title: "The New Frontier of Genome Engineering with CRISPR-Cas9",
    year: 2014,
    topics: ["review", "genome editing", "gene function", "organisms", "life sciences", "frontier", "crispr", "cas9"],
  },

  // ── Ran et al., Nature Protocols 2013 — Genome engineering protocol ──────
  {
    openaireId: "50|doi_dedup___::f607182930415263",
    doi: "10.1038/nprot.2013.143",
    locator: "abstract",
    snippet:
      "This protocol provides step-by-step instructions for genome engineering using the CRISPR-Cas9 system, including guide RNA design, delivery, and assays for quantifying editing efficiency and off-target activity in mammalian cells.",
    score: 0.0,
    charRange: [0, 228] as [number, number],
    title: "Genome Engineering Using the CRISPR-Cas9 System",
    year: 2013,
    topics: ["protocol", "guide rna design", "delivery", "editing efficiency", "off-target assay", "mammalian cells", "methods"],
  },
  {
    openaireId: "50|doi_dedup___::f607182930415263",
    doi: "10.1038/nprot.2013.143",
    locator: "p12",
    snippet:
      "The surveyor nuclease assay and targeted deep sequencing are complementary methods for measuring indel frequency at the cut site. A paired-nickase strategy, using two guide RNAs and a Cas9 nickase, further reduces off-target mutagenesis.",
    score: 0.0,
    charRange: [229, 470] as [number, number],
    title: "Genome Engineering Using the CRISPR-Cas9 System",
    year: 2013,
    topics: ["surveyor assay", "deep sequencing", "indel", "nickase", "paired nickase", "off-target", "methods"],
  },
]
