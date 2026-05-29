# Page Structure Rule

## Rule

A page file is a layout skeleton. It uses `div` only to establish spacing and grid structure. All UI content lives in named components that are built on shadcn primitives.

A component that would be built from raw `div`s to create a visual structure (box, panel, section, header+body, list item) must instead use the appropriate shadcn primitive as its base and be extracted following the componentization rule.

## What a Page Should Look Like

```tsx
// app/[locale]/(app)/datasets/page.tsx
export default function DatasetsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <CardDatasetsSummary />
      <LayoutDatasetsReadonlyGrid />
    </div>
  )
}
```

The page has no visual logic. It only answers: "what components go here and how are they spaced?"

## The shadcn Primitive → Use Case Map

When you are about to reach for a `div`, ask which shadcn primitive fits:

| You want to build... | Use |
|---|---|
| A box with a header, body, and optional footer | `Card` → extract as `CardFeatureName` |
| A modal / confirmation / form overlay | `Dialog` or `AlertDialog` → extract |
| A slide-in panel | `Sheet` → extract |
| A floating action menu | `DropdownMenu` → extract |
| A floating info panel | `Popover` or `HoverCard` → extract |
| A tabbed section | `Tabs` → extract |
| An expandable section | `Accordion` → extract |
| A contextual hint on an icon | `Tooltip` → extract |
| A notification / status banner | `Alert` (shadcn) → extract |
| A multi-step flow | `Wizard` / `Step` (existing ui) → extract |

If no shadcn primitive fits, `div` is acceptable — but that is the exception, not the default.

## What This Forbids

### Raw div panels masquerading as cards
```tsx
// ❌ Forbidden — this IS a Card, write it as one
<div className="border rounded-lg p-4">
  <div className="font-semibold text-lg">Dataset Overview</div>
  <div className="text-muted-foreground mt-2">{description}</div>
</div>

// ✅ Correct
<CardDatasetOverview dataset={dataset} />
// → components/cards/datasets/overview.tsx → CardDatasetOverview
//   built with <Card><CardHeader>...<CardContent>...
```

### Div-based overlays and panels
```tsx
// ❌ Forbidden — this IS a Sheet
<div className={cn("fixed inset-y-0 right-0 w-80", open && "translate-x-0")}>
  ...
</div>

// ✅ Correct — extract it as SheetFeatureName
```

### Div wrappers with borders/shadows that are really Cards
```tsx
// ❌ Forbidden
<div className="rounded-xl border shadow-sm p-6 space-y-4">
  <h2>Settings</h2>
  ...
</div>

// ✅ Correct
<CardSettingsSection>...</CardSettingsSection>
```

## The Two-Layer Rule

Every non-trivial page decomposes into exactly two layers:

**Layer 1 — Page**: layout only (`div` + spacing/grid classes). No visual chrome. No business logic.

**Layer 2 — Components**: shadcn-based named components that own their visual structure. No raw layout divs at the top level of their return — only the shadcn primitive.

```
Page
 └─ div (spacing / grid)
     ├─ CardFeatureSummary       ← Card
     ├─ LayoutFeatureGrid        ← layout component (ul/table, not a shadcn primitive but not a div panel)
     └─ DialogFeatureCreate      ← Dialog (conditionally rendered)
```

## Inside a shadcn Primitive: Use Its Sub-Components

Once you are inside a shadcn primitive, you use **its own sub-components** to structure the content. Never use raw `div`s to fake structure that shadcn already provides.

```tsx
// ❌ Forbidden — raw divs inside a Card
<Card>
  <div className="font-semibold p-4">Header</div>
  <div className="p-4">Body content</div>
  <div className="p-4 border-t">Footer</div>
</Card>

// ✅ Correct — use Card's own anatomy
<Card>
  <CardHeader>
    <CardTitle>Header</CardTitle>
    <CardDescription>Subtitle if needed</CardDescription>
  </CardHeader>
  <CardContent>Body content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>
```

The same principle applies to every primitive:

| Primitive | Use its sub-components |
|---|---|
| `Dialog` | `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogContent`, `DialogFooter` |
| `Card` | `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| `Sheet` | `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetContent`, `SheetFooter` |
| `AlertDialog` | `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel` |
| `Tabs` | `TabsList`, `TabsTrigger`, `TabsContent` |
| `Accordion` | `AccordionItem`, `AccordionTrigger`, `AccordionContent` |

Inside `CardContent` or `DialogContent`, `div` is fine for spacing — but not to replace the primitive's own structural slots.

---

## div Is Still Valid For

- Column / row flex containers that purely handle spacing: `<div className="flex gap-4">`
- Grid wrappers: `<div className="grid grid-cols-3 gap-4">`
- Page-level padding/max-width containers: `<div className="max-w-5xl mx-auto px-6">`
- Inline layout within a component (e.g. icon + label side by side inside a Card)

The test: **if the div has a border, shadow, background, or rounded corners — it should be a shadcn primitive.**
