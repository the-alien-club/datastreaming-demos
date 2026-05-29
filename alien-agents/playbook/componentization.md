# Component Extraction Rule

## Rule

Every compound UI primitive must be extracted into a dedicated named component file. No raw `<Dialog>`, `<Card>`, `<Sheet>`, `<AlertDialog>`, `<Drawer>`, `<Popover>`, `<DropdownMenu>`, `<Select>`, `<Tooltip>`, `<HoverCard>`, `<Tabs>`, or `<Accordion>` tags may appear inline in page files or other feature components.

## File Structure

```
components/[type]/[feature]/name.tsx
```

- **type**: the root UI primitive being wrapped, plural and lowercase
  - `dialogs/`, `cards/`, `sheets/`, `drawers/`, `popovers/`, `dropdowns/`, `selects/`, `tooltips/`, `alerts/`, `tabs/`, `accordions/`
- **feature**: the domain/feature area, lowercase kebab-case
  - `agents/`, `datasets/`, `pipelines/`, `chat/`, `settings/`, `auth/`, etc.
- **name**: the specific variant or action, lowercase kebab-case
  - `create.tsx`, `edit.tsx`, `delete.tsx`, `summary.tsx`, `details.tsx`

## Component Naming

PascalCase concatenation of **type (singular) + feature (PascalCase) + name (PascalCase)**:

| File path | Component name |
|---|---|
| `components/dialogs/agents/create.tsx` | `DialogAgentCreate` |
| `components/cards/datasets/summary.tsx` | `CardDatasetSummary` |
| `components/sheets/settings/preferences.tsx` | `SheetSettingsPreferences` |
| `components/alerts/pipelines/delete-confirm.tsx` | `AlertDialogPipelineDeleteConfirm` |
| `components/dropdowns/chat/message-actions.tsx` | `DropdownChatMessageActions` |

## Usage in Pages and Parent Components

Pages and parent components import and use the named component. They never compose the primitive inline.

**Correct:**
```tsx
<DialogAgentCreate open={open} onOpenChange={setOpen} />
```

**Forbidden:**
```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    ...
  </DialogContent>
</Dialog>
```

## Implementation Checklist

When extracting a component:

1. Create the file at the correct path following the convention above
2. Name the exported component following the naming convention
3. Accept the minimal props needed: `open`, `onOpenChange`, data props, callbacks
4. Move all internal state (form state, loading, errors) inside the new component
5. Replace every inline usage with the new named component import
6. Delete the inline primitive usage — leave no `<Dialog>` orphans behind

## Scope

This rule applies to all files under:
- `app/` (pages, layouts, route components)
- `components/` (any component that currently embeds primitives inline)

Shared primitives from `components/ui/` (shadcn-generated) are exempt — they ARE the primitives. The rule governs their consumers, not their definitions.
