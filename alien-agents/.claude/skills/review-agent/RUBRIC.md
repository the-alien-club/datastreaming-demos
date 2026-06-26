# Alien Agent Review Rubric

Deterministic checklist for the `review-agent` skill. Each check states:

- **Look for** — the mechanical condition. If true, flag.
- **Severity** — 🔴 high (likely breaks dispatch / safety / queryability), 🟡 medium (degrades quality but the agent still works), ℹ️ info (advisory; no proposed-state mutation).
- **Suggest** — a concrete fill-in template for the proposed replacement. The model interpolates the agent's own content into the template; do not output the template literally.

Apply every check in this file in order. Skip checks whose precondition isn't met (e.g. corpus checks when no datasets are attached). Record findings as `{field, severity, message, suggestion}` tuples for the report and the proposed-state.

The `slugify` helper used for subagent names is documented in `lib/platform/workflows.ts:52-62`: lowercase, NFKD strip-accents, non-alphanumeric → `-`, trim, max 40 chars. Mirror it inline when checking name quality.

---

## Layer 1 — Agent core fields

### 1.1 Name is generic or placeholder
- **Look for**: `agent.name` matches `/^(agent|untitled|new agent|test|my agent)$/i` or is fewer than 3 chars.
- **Severity**: 🟡
- **Suggest**: a name derived from the first sentence of `systemPrompt` (verb-noun, e.g. "Paper Summarizer", "Code Reviewer"). Max 60 chars.

### 1.2 Description is empty
- **Look for**: `agent.description == null` or trimmed length 0.
- **Severity**: 🟡
- **Suggest**: a one-sentence summary derived from the first 1-2 sentences of `systemPrompt`, ≤ 200 chars, no trailing period if it's a noun phrase. The description is shown in the agent grid and on share — empty descriptions hurt discoverability.

### 1.3 Starter prompts missing or sparse
- **Look for**: `agent.starterPrompts.length < 3`.
- **Severity**: 🟡
- **Suggest**: 3-5 starter prompts, each phrased as the first message a user would actually type. Derive from the use cases the system prompt mentions. Each ≤ 500 chars, ≥ 1 char.

### 1.4 System prompt is under-specified
- **Look for**: `agent.systemPrompt` trimmed length < 100 chars.
- **Severity**: 🔴
- **Suggest**: expand to at least: a role declaration ("You are…"), the user it serves, the kinds of questions it should and should not answer, and the output format. Aim for 300-800 chars at minimum.

### 1.5 System prompt contains placeholder text
- **Look for**: case-insensitive match against `\b(todo|tbd|lorem ipsum|xxx|fixme|placeholder|<.*?>)\b` in `agent.systemPrompt`.
- **Severity**: 🔴
- **Suggest**: replace the placeholder with concrete content matching the surrounding context. Flag each occurrence with its character offset.

### 1.6 System prompt does not declare a role
- **Look for**: `agent.systemPrompt` does not start (within the first 200 chars) with "You are" or an equivalent role-declaration phrase ("Your role is", "Act as", "I am" in 1st-person prompts).
- **Severity**: 🟡
- **Suggest**: prepend "You are <role>. <one-sentence scope>." derived from the prompt's apparent purpose.

### 1.7 Model is the default and the prompt suggests heavier work
- **Look for**: `agent.model == "gpt-4.1-mini"` AND the assembled prompt mentions any of: "long document", "complex reasoning", "multi-step planning", "deep research", "code generation", "math".
- **Severity**: ℹ️
- **Suggest**: surface to the user — "Consider a stronger model (e.g. `gpt-4.1` or equivalent) for tasks the prompt describes."

---

## Layer 2 — Assembled system prompt + steps

The "assembled" prompt = `systemPrompt + "\n\n# Steps\n\n## Step 1: …"` (see API.md). All checks below run on the **assembled** string.

### 2.1 Assembled prompt near the model's context limit
- **Look for**: assembled length > 100 000 chars (78% of the 128k Zod cap).
- **Severity**: 🟡
- **Suggest**: identify the longest step or section; propose factoring it into a corpus or a subagent's system prompt instead of inlining.

### 2.2 Step references a subagent that doesn't exist
- **Look for**: any step's `prompt` mentions a name that looks like a subagent reference (capitalised noun phrase, or text like "ask the X specialist", "use the X subagent") where the referenced name has no matching `subagents[i].name` (case-insensitive, slugify-equal).
- **Severity**: 🔴
- **Suggest**: rename the reference in the step to match an existing subagent, or add the missing subagent.

### 2.3 Steps contradict the overall prompt
- **Look for**: model-judgement — read both halves, flag if a step says "do X" while the overall prompt says "never do X" (or close paraphrases).
- **Severity**: 🟡
- **Suggest**: name the contradiction explicitly in the finding ("Overall prompt forbids `<x>`, but Step `<n>` requires it") and propose the resolution that aligns with the prompt's role.

### 2.4 Steps duplicate the overall prompt
- **Look for**: the overall prompt already contains a numbered list ("1. … 2. … 3. …") covering the same ground as `steps[]`.
- **Severity**: 🟡
- **Suggest**: either (a) remove the inline list from the overall prompt and keep `steps[]`, or (b) clear `steps[]` and keep the inline list. Pick whichever is shorter.

### 2.5 Step is under-specified
- **Look for**: any `step.prompt` trimmed length < 20 chars.
- **Severity**: 🟡
- **Suggest**: expand to describe the input, the action, and the output expected at this step. Min ~80 chars.

### 2.6 Step name is generic
- **Look for**: `step.name` matches `/^step \d+$/i` or is in `{"Start","Do it","Process","Next"}`.
- **Severity**: 🟡
- **Suggest**: rename to a verb-object phrase describing the action ("Extract key findings", "Validate input", "Synthesise answer").

---

## Layer 3 — Specialist subagents (apply per subagent)

For each `subagent` in `subagents[]`:

### 3.1 Name slugifies to a generic or numeric token
- **Look for**: `slugify(subagent.name)` is in `{"helper","assistant","specialist","tool","agent","subagent","worker"}`, or the slug consists only of digits, or `slugify(subagent.name)` is empty (would fall back to the index).
- **Severity**: 🔴 (digit/empty), 🟡 (generic word)
- **Suggest**: rename to a domain-specific noun phrase. The slugified name becomes the `task()` tool name the orchestrator sees — `subagent-paper-summarizer` is dispatchable, `subagent-helper-2` is not.

### 3.2 Description is empty
- **Look for**: `subagent.description == null` OR trimmed length < 10.
- **Severity**: 🔴
- **Suggest**: write 1-2 sentences describing **when** the parent agent should dispatch this subagent. The LLM reads this at dispatch time. Pattern: "Use this specialist when <trigger condition>. It can <capabilities>."

### 3.3 System prompt is under-specified
- **Look for**: trimmed length < 100 chars.
- **Severity**: 🔴
- **Suggest**: expand to role + scope + tool-usage instructions + output format. The minimum viable subagent prompt is ~300 chars.

### 3.4 Capability/wiring mismatch — claims to search but has no MCP
- **Look for**: `subagent.mcpIds` (parsed) is empty AND the system prompt contains any of: "search", "look up", "fetch", "retrieve", "browse", "query", "find documents", "find papers", "recherche" (FR).
- **Severity**: 🔴
- **Suggest**: name the verb in the finding ("Prompt says 'search the web' but no MCP is wired"). Propose either (a) wire the right MCP from the catalog, or (b) reword the prompt to not promise capabilities the subagent can't fulfil.

### 3.5 mcpId references an MCP not in the catalog
- **Look for**: any id in `subagent.mcpIds` (parsed) is missing from the `/api/mcps` response.
- **Severity**: 🔴
- **Suggest**: name the broken id. The next workflow rebuild will fail in `buildAgentWorkflow` (it throws `Unknown MCP ID`). Either remove the id from `mcpIds[]` or recreate the MCP entry.

### 3.6 Orphan dispatch surface — never referenced by the parent
- **Look for**: the slugified subagent name appears nowhere in the assembled parent system prompt (case-insensitive substring search across both the slug and the original name with whitespace collapsed).
- **Severity**: 🟡
- **Suggest**: add a sentence to the parent's overall prompt or to a step that names this subagent and describes when to dispatch it. E.g. "For `<task type>` questions, delegate to the `<subagent-name>` specialist."

### 3.7 Two subagents with overlapping capability
- **Look for**: model-judgement across the full subagent list — flag pairs whose `description`s or system prompts are semantically near-duplicates.
- **Severity**: 🟡
- **Suggest**: either merge into one, or differentiate by naming the distinct trigger condition for each in their `description`.

### 3.8 Subagent missing output-format declaration
- **Look for**: subagent system prompt does not contain any of: "return", "respond with", "output", "format your answer", "JSON", "markdown", "structured".
- **Severity**: 🟡
- **Suggest**: append an "Output format:" section describing exactly what the parent agent should expect (e.g. "Return a bulleted list of findings, each with a source citation").

### 3.9 Subagent overrides the agent's model without rationale
- **Look for**: `subagent.model` differs from `agent.model`.
- **Severity**: ℹ️
- **Suggest**: surface the pair to the user — sometimes intentional (heavier model for the hard subtask, lighter for a cheap classifier), sometimes a leftover. Ask, don't auto-fix.

---

## Layer 4 — Corpora (apply per attached dataset)

For each `subagent` with non-null `datasetId`, the matching `dataset` and `datasetStatus`:

### 4.1 Corpus is not ready
- **Look for**: `dataset.status != "ready"` OR `datasetStatus.overall != "processed"`.
- **Severity**: 🔴
- **Suggest**: the corpus subagent will return empty results. Either (a) wait for processing to finish, (b) remove the attachment until it is, or (c) investigate the upload status (`datasetStatus.byStatus.error > 0` → partial ingestion).

### 4.2 No aiInstructions — boilerplate-only corpus subagent
- **Look for**: `dataset.aiInstructions == null` OR trimmed length 0.
- **Severity**: 🟡
- **Suggest**: write a `## How to use this corpus` section for the dataset (PATCH `/api/datasets/<id>`, body `{aiInstructions: "..."}`). Should cover: what's in the corpus, when to search it, how to interpret results, how to cite. ≤ 8000 chars.

### 4.3 Orphan corpus — not mentioned in the parent prompt
- **Look for**: `dataset.name` appears nowhere in the assembled parent system prompt (case-insensitive substring, also try the slug of the dataset name).
- **Severity**: 🟡
- **Suggest**: add to the parent's overall prompt or a step: "When the user asks about `<topic the corpus covers>`, search the `<dataset.name>` corpus."

### 4.4 Partial ingestion — some entries errored
- **Look for**: `datasetStatus.byStatus.error > 0`.
- **Severity**: 🟡
- **Suggest**: name the count ("N entries failed to process"). Tell the user to inspect the dataset detail page — does not block usage but may surprise users when queries return nothing for known content.

### 4.5 Corpus subagent name doesn't reflect the corpus
- **Look for**: corpus subagent (the one with non-null `datasetId`) has a name that doesn't include the dataset's name or an obvious abbreviation. Default name format from `attachDatasetToAgent` is `${dataset.name} Corpus`.
- **Severity**: 🟡
- **Suggest**: rename to `${dataset.name} Corpus` (or close variant) for orchestrator dispatch clarity.

---

## Layer 5 — Topology

### 5.1 Too many subagents
- **Look for**: `subagents.length > 7`.
- **Severity**: 🟡
- **Suggest**: identify candidates for merging (per check 3.7) or removal (per check 3.6). 5-7 is the comfortable upper bound for dispatcher cognitive load.

### 5.2 Prompt mentions specialists but none are wired
- **Look for**: `subagents.length == 0` AND the assembled prompt mentions any of: "specialist", "subagent", "expert", "delegate", "use the X tool", "ask the X".
- **Severity**: 🔴
- **Suggest**: either (a) add the subagents the prompt promises, or (b) rewrite the prompt to not promise delegation. The current state will leave the LLM looking for tools that don't exist.

### 5.3 Corpus attached but agent prompt is generic
- **Look for**: at least one corpus subagent exists AND the agent's overall prompt contains no domain-specific term that overlaps with the dataset's `name` or `description`.
- **Severity**: 🟡
- **Suggest**: the agent has a corpus but doesn't position itself as a domain expert. Either re-scope the prompt to the corpus's domain, or detach the corpus.

### 5.4 No starter prompts AND no description
- **Look for**: `agent.starterPrompts.length == 0` AND `agent.description` is empty/null.
- **Severity**: 🔴
- **Suggest**: a published agent with neither is unusable from the agent grid. Fill both per 1.2 and 1.3 — this is the worst onboarding state possible.

---

## Severity tally and verdict

After applying every check:

- Count 🔴 (`red`), 🟡 (`yellow`), 🟢 (no findings for this section), ℹ️ (info-only).
- Overall verdict emoji = 🔴 if `red > 0`, else 🟡 if `yellow > 0`, else 🟢.
- The verdict one-liner phrasing convention:
  - 🟢 → "ready to ship — minor polish optional"
  - 🟡 → "functional but degraded — fix the yellows before promoting"
  - 🔴 → "broken or unsafe — fix the reds first"

## Proposed-state mutations

- Every 🔴 and 🟡 finding contributes a mutation to proposed-state (the field is set to the rubric's `Suggest:` value, interpolated with the agent's content).
- ℹ️ findings are advisory — they appear in the report but do not mutate proposed-state.
- The user may overrule any mutation in the discussion loop (Step 8 of SKILL.md). When they do, remove that mutation from proposed-state; don't re-flag it on subsequent renders.
