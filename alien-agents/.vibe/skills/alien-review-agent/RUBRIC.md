# Alien Agent Review Rubric

Deterministic checklist for the alien-review-agent skill. Each check states:
- **Look for** — the mechanical condition. If true, flag.
- **Severity** — 🔴 high (likely breaks dispatch/safety/queryability), 🟡 medium (degrades quality but works), ℹ️ info (advisory; no proposed-state mutation)
- **Suggest** — a concrete fill-in template for the proposed replacement

Apply every check in this file in order. Skip checks whose precondition isn't met (e.g., corpus checks when no datasets are attached). Record findings as {field, severity, message, suggestion} tuples for the report and proposed-state.

The slugify helper: lowercase, NFKD strip-accents, non-alphanumeric → -, trim, max 40 chars.

---

## Layer 1 — Agent Core Fields

### 1.1 Name is generic or placeholder
- **Look for**: agent.name matches /^(agent|untitled|new agent|test|my agent)$/i OR length < 3
- **Severity**: 🟡
- **Suggest**: Verb-noun phrase derived from first sentence of systemPrompt (e.g., "Paper Summarizer", "Code Reviewer"). Max 60 chars.

### 1.2 Description is empty
- **Look for**: agent.description == null OR trimmed length 0
- **Severity**: 🟡
- **Suggest**: One-sentence summary from first 1-2 sentences of systemPrompt, ≤200 chars, no trailing period if noun phrase. Shown in agent grid and on share — empty descriptions hurt discoverability.

### 1.3 Starter prompts missing or sparse
- **Look for**: agent.starterPrompts.length < 3
- **Severity**: 🟡
- **Suggest**: 3-5 starter prompts, each phrased as first message a user would type. Derive from use cases the systemPrompt mentions. Each 1-500 chars.

### 1.4 System prompt is under-specified
- **Look for**: agent.systemPrompt trimmed length < 100 chars
- **Severity**: 🔴
- **Suggest**: Expand to at least: role declaration ("You are…"), the user it serves, kinds of questions it should and should not answer, output format. Aim for 300-800 chars minimum.

### 1.5 System prompt contains placeholder text
- **Look for**: Case-insensitive match against \b(todo|tbd|lorem ipsum|xxx|fixme|placeholder|<.*?>)\b in agent.systemPrompt
- **Severity**: 🔴
- **Suggest**: Replace each placeholder with concrete content matching surrounding context. Flag each with character offset.

### 1.6 System prompt does not declare a role
- **Look for**: agent.systemPrompt does not start (within first 200 chars) with "You are" or equivalent ("Your role is", "Act as", "I am" in 1st-person)
- **Severity**: 🟡
- **Suggest**: Prepend "You are <role>. <one-sentence scope>." derived from prompt's apparent purpose.

### 1.7 Model is default and prompt suggests heavier work
- **Look for**: agent.model == "gpt-4.1-mini" AND assembled prompt mentions: long document, complex reasoning, multi-step planning, deep research, code generation, math
- **Severity**: ℹ️
- **Suggest**: Surface to user: "Consider a stronger model (e.g., gpt-4.1 or equivalent) for tasks the prompt describes."

---

## Layer 2 — Assembled System Prompt + Steps

The assembled prompt = systemPrompt + "\n\n# Steps\n\n" + steps.map(...). All checks below run on the **assembled** string.

### 2.1 Assembled prompt near model context limit
- **Look for**: assembled length > 100000 chars (78% of 128k Zod cap)
- **Severity**: 🟡
- **Suggest**: Identify longest step/section. Propose factoring into corpus or subagent systemPrompt instead of inlining.

### 2.2 Step references subagent that doesn't exist
- **Look for**: Any step.prompt mentions name (capitalized noun phrase, or "ask the X specialist", "use the X subagent") where referenced name has no matching subagents[i].name (case-insensitive, slugify-equal)
- **Severity**: 🔴
- **Suggest**: Rename reference to match existing subagent OR add missing subagent.

### 2.3 Steps contradict overall prompt
- **Look for**: Model judgement — step says "do X" while systemPrompt says "never do X"
- **Severity**: 🟡
- **Suggest**: Name contradiction explicitly ("Overall forbids <x>, but Step <n> requires it"). Propose resolution aligning with prompt's role.

### 2.4 Steps duplicate overall prompt
- **Look for**: systemPrompt already contains numbered list ("1. … 2. … 3. …") covering same ground as steps[]
- **Severity**: 🟡
- **Suggest**: Remove inline list from systemPrompt and keep steps[] OR clear steps[] and keep inline list. Pick whichever is shorter.

### 2.5 Step is under-specified
- **Look for**: any step.prompt trimmed length < 20 chars
- **Severity**: 🟡
- **Suggest**: Expand to describe input, action, expected output. Minimum ~80 chars.

### 2.6 Step name is generic
- **Look for**: step.name matches /^step \d+$/i OR in {"Start","Do it","Process","Next"}
- **Severity**: 🟡
- **Suggest**: Rename to verb-object phrase ("Extract key findings", "Validate input", "Synthesize answer")

---

## Layer 3 — Specialist Subagents

Apply per subagent in subagents[]:

### 3.1 Name slugifies to generic or numeric token
- **Look for**: slugify(subagent.name) in {"helper","assistant","specialist","tool","agent","subagent","worker"} OR slug consists only of digits OR slugify(subagent.name) is empty
- **Severity**: 🔴 (digit/empty), 🟡 (generic word)
- **Suggest**: Rename to domain-specific noun phrase. The slugified name becomes the task() tool name the orchestrator sees.

### 3.2 Description is empty
- **Look for**: subagent.description == null OR trimmed length < 10
- **Severity**: 🔴
- **Suggest**: Write 1-2 sentences: "Use this specialist when <trigger condition>. It can <capabilities>." The LLM reads this at dispatch time.

### 3.3 System prompt is under-specified
- **Look for**: trimmed length < 100 chars
- **Severity**: 🔴
- **Suggest**: Expand to role + scope + tool-usage instructions + output format. Minimum viable is ~300 chars.

### 3.4 Capability/wiring mismatch
- **Look for**: subagent.mcpIds (parsed) is empty AND systemPrompt contains any of: search, look up, fetch, retrieve, browse, query, find documents, find papers, recherche
- **Severity**: 🔴
- **Suggest**: Name the verb in finding ("Prompt says 'search the web' but no MCP wired"). Propose: wire correct MCP from catalog OR reword prompt to not promise unimplemented capabilities.

### 3.5 mcpId references MCP not in catalog
- **Look for**: Any id in subagent.mcpIds (parsed) missing from GET /api/mcps response
- **Severity**: 🔴
- **Suggest**: Name the broken id. Next workflow rebuild fails in buildAgentWorkflow (throws Unknown MCP ID). Remove id from mcpIds[] OR recreate the MCP entry.

### 3.6 Orphan dispatch surface
- **Look for**: slugified subagent name appears nowhere in assembled parent systemPrompt (case-insensitive substring across both slug and original name with whitespace collapsed)
- **Severity**: 🟡
- **Suggest**: Add sentence to parent's systemPrompt or step: "For <task type> questions, delegate to the <subagent-name> specialist."

### 3.7 Two subagents with overlapping capability
- **Look for**: Model judgement across full subagent list — flag pairs with semantically near-duplicate descriptions or systemPrompts
- **Severity**: 🟡
- **Suggest**: Merge into one OR differentiate by naming distinct trigger condition for each in description.

### 3.8 Subagent missing output-format declaration
- **Look for**: systemPrompt does not contain any of: return, respond with, output, format your answer, JSON, markdown, structured
- **Severity**: 🟡
- **Suggest**: Append "Output format:" section describing exactly what parent agent should expect.

### 3.9 Subagent overrides agent model without rationale
- **Look for**: subagent.model != agent.model
- **Severity**: ℹ️
- **Suggest**: Surface pair to user — sometimes intentional (heavier model for hard subtask, lighter for cheap classifier), sometimes leftover. Ask, don't auto-fix.

---

## Layer 4 — Corpora

Apply per subagent with non-null datasetId, with matching dataset and datasetStatus:

### 4.1 Corpus is not ready
- **Look for**: dataset.status != "ready" OR datasetStatus.overall != "processed"
- **Severity**: 🔴
- **Suggest**: Corpus subagent returns empty results. Either: wait for processing, remove attachment until ready, or investigate upload status (datasetStatus.byStatus.error > 0 → partial ingestion).

### 4.2 No aiInstructions
- **Look for**: dataset.aiInstructions == null OR trimmed length 0
- **Severity**: 🟡
- **Suggest**: Write "## How to use this corpus" for dataset (PATCH /api/datasets/<id>): what's in corpus, when to search it, how to interpret results, how to cite. ≤8000 chars.

### 4.3 Orphan corpus
- **Look for**: dataset.name appears nowhere in assembled parent systemPrompt (case-insensitive substring, also try slug of dataset name)
- **Severity**: 🟡
- **Suggest**: Add to parent's systemPrompt or step: "When user asks about <topic the corpus covers>, search the <dataset.name> corpus."

### 4.4 Partial ingestion
- **Look for**: datasetStatus.byStatus.error > 0
- **Severity**: 🟡
- **Suggest**: Name count ("N entries failed to process"). Tell user to inspect dataset detail page — doesn't block usage but may surprise users.

### 4.5 Corpus subagent name doesn't reflect corpus
- **Look for**: Corpus subagent name doesn't include dataset.name or obvious abbreviation. Default from attachDatasetToAgent is "${dataset.name} Corpus"
- **Severity**: 🟡
- **Suggest**: Rename to "${dataset.name} Corpus" for orchestrator dispatch clarity.

---

## Layer 5 — Topology

### 5.1 Too many subagents
- **Look for**: subagents.length > 7
- **Severity**: 🟡
- **Suggest**: Identify candidates for merging (per 3.7) or removal (per 3.6). 5-7 is comfortable upper bound for dispatcher cognitive load.

### 5.2 Prompt mentions specialists but none wired
- **Look for**: subagents.length == 0 AND assembled prompt mentions: specialist, subagent, expert, delegate, use the X tool, ask the X
- **Severity**: 🔴
- **Suggest**: Either add subagents the prompt promises OR rewrite prompt to not promise delegation. Current state leaves LLM looking for tools that don't exist.

### 5.3 Corpus attached but agent prompt is generic
- **Look for**: At least one corpus subagent exists AND agent systemPrompt contains no domain-specific term overlapping with dataset.name or description
- **Severity**: 🟡
- **Suggest**: Re-scope prompt to corpus domain OR detach corpus.

### 5.4 No starter prompts AND no description
- **Look for**: agent.starterPrompts.length == 0 AND agent.description empty/null
- **Severity**: 🔴
- **Suggest**: Published agent with neither is unusable from agent grid. Fill both per 1.2 and 1.3 — worst onboarding state possible.

---

## Severity Tally and Verdict

After applying every check:
- Count 🔴 (red), 🟡 (yellow), 🟢 (green/pass), ℹ️ (info)
- Overall verdict emoji = 🔴 if red > 0, else 🟡 if yellow > 0, else 🟢
- Verdict one-liner phrasing:
  - 🟢 → "ready to ship — minor polish optional"
  - 🟡 → "functional but degraded — fix the yellows before promoting"
  - 🔴 → "broken or unsafe — fix the reds first"

---

## Proposed-State Mutations

- Every 🔴 and 🟡 finding contributes a mutation to proposed-state (field is set to rubric's Suggest value, interpolated with agent's content)
- ℹ️ findings are advisory — appear in report but do NOT mutate proposed-state
- User may overrule any mutation in discussion loop (Step 8). When they do, remove that mutation from proposed-state; don't re-flag it on subsequent renders.
