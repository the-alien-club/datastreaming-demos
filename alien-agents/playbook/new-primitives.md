# New UI Primitive Rule

## Rule

Do not create a new UI primitive unless all five gates below pass. Failing any single gate means you do not create a primitive — you either use what exists, add a variant to an existing component, or extract a named feature component instead.

---

## The Five Gates (all must pass)

### Gate 1 — Not in shadcn
Check https://ui.shadcn.com/docs/components before doing anything else. If it exists in shadcn, install it with `npx shadcn@latest add <name>`. Stop here.

### Gate 2 — Not composable from existing primitives
Can you build this by composing existing shadcn components (`Card`, `Dialog`, `Popover`, `Tabs`, etc.)? If yes, compose and extract a named feature component following the componentization rule. Stop here.

### Gate 3 — Behaviorally novel, not just visually different
A new primitive must encapsulate **interaction logic or accessibility behaviour** that does not exist yet. A new visual style (different border, different spacing, different color) never qualifies — that is a Tailwind variant or a `className` prop. Ask: *if I strip all the CSS, does this component still do something unique?* If no, stop here.

### Gate 4 — Truly domain-agnostic
The component must have zero feature vocabulary. No "agent", "dataset", "specialist", "mcp" — nothing domain-specific. Its name, props, and internals must be expressible in pure UI language. If you cannot describe it without mentioning the feature that needs it, it is a feature component, not a primitive. Stop here.

### Gate 5 — Used across 3+ unrelated feature areas
One feature needing it is not enough. Two is not enough. If you can only point to agents, that is a feature component. A primitive must earn its place in `components/ui/` by serving agents AND datasets AND auth AND anything else that comes next — without modification.

---

## Where It Lives

A primitive that passes all five gates lives in:

```
components/ui/name.tsx
```

No subdirectory. No feature folder. This is the same place shadcn components live. It follows the same conventions: named exports, `cn()` for class merging, forwarded refs where appropriate.

It does **not** follow the `components/[type]/[feature]/name.tsx` convention — because it has no feature. It IS the type.

---

## Examples

### Legitimate primitives (already in this codebase)
- `components/ui/wizard.tsx` — multi-step flow with step management state; not in shadcn; behaviorally novel; domain-agnostic; used in agent creation and could be used anywhere
- `components/ui/step.tsx` — step state + accessibility; pairs with wizard; same justification
- `components/ui/input-group.tsx` — input with prefix/suffix slots; not in shadcn; structurally novel

### Rejected — should be a variant instead
```tsx
// ❌ "I need a danger button" → add a variant to Button
const DangerButton = () => <button className="bg-red-500 ...">

// ✅ Use the existing Button with a variant
<Button variant="destructive">
```

### Rejected — should be a named feature component
```tsx
// ❌ "I need a status badge for datasets" → domain vocabulary → feature component
components/ui/dataset-status-badge.tsx

// ✅ Extract it as a feature component
components/badges/datasets/status.tsx → BadgeDatasetStatus
```

### Rejected — composable from existing primitives
```tsx
// ❌ "I need a card with a collapsible body"
// Composable from Card + Collapsible (both exist in shadcn)
// → extract as CardFeatureCollapsible following componentization rule
```

---

## The Summary Test

Before creating a new primitive, answer these four questions out loud:

1. Is it in shadcn? → install it
2. Can I compose it from what exists? → compose and extract
3. Does it do something new without CSS? → if no, it's a variant
4. Does it mention any feature domain? → if yes, it's a feature component

Only if all four answers are "no" do you build a new primitive.
