# Forms Rule

## Rule

Every form must use **react-hook-form** with a **Zod schema** and the shadcn `Form` component system. No form may use uncontrolled inputs, manual `useState` per field, or ad-hoc validation logic.

## Setup (one-time)

If `components/ui/form.tsx` does not exist, add the shadcn form primitive:

```bash
npx shadcn@latest add form
```

This installs the `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, and `FormMessage` wrappers around react-hook-form.

## File Structure

```
components/forms/[feature]/name.tsx
```

- **feature**: domain area — `agents/`, `datasets/`, `specialists/`, `auth/`, etc.
- **name**: the action — `create.tsx`, `edit.tsx`, `settings.tsx`

Export name: `Form` + feature (PascalCase) + name (PascalCase)

| File path | Export name |
|---|---|
| `components/forms/agents/create.tsx` | `FormAgentCreate` |
| `components/forms/specialists/edit.tsx` | `FormSpecialistEdit` |
| `components/forms/auth/sign-in.tsx` | `FormAuthSignIn` |

## Required Structure

Every form file must follow this structure exactly:

```tsx
// 1. Zod schema — co-located, not imported from elsewhere
const agentCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  model: z.string().min(1, "Model is required"),
  instructions: z.string().optional(),
})

// 2. Inferred type — always use z.infer, never write the type manually
type FormAgentCreateData = z.infer<typeof agentCreateSchema>

// 3. Props — onSubmit is async and accepts the typed form data
type FormAgentCreateProps = {
  onSubmit: (data: FormAgentCreateData) => Promise<void>
  // any initial data (e.g. for edit forms)
}

// 4. Component — manages its own loading state
export function FormAgentCreate({ onSubmit }: FormAgentCreateProps) {
  const form = useForm<FormAgentCreateData>({
    resolver: zodResolver(agentCreateSchema),
    defaultValues: { name: "", model: "", instructions: "" },
  })

  const handleSubmit = async (data: FormAgentCreateData) => {
    await onSubmit(data)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="My agent" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* ... */}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : "Create"}
        </Button>
      </form>
    </Form>
  )
}
```

## Rules

### Schema
- **Always** co-locate the Zod schema in the form file — never import a schema from another file
- **Always** use `z.infer<typeof schema>` for the data type — never write the type manually
- **Always** provide meaningful validation messages in the schema, not in the render logic

### Form state
- **Use** `form.formState.isSubmitting` for loading state — do NOT add a separate `useState<boolean>` for loading
- **Use** `form.reset()` to clear the form after successful submission when appropriate
- **Never** duplicate validation in `handleSubmit` — the schema handles it

### Fields
- **Every** field must be wrapped in `FormField` → `FormItem` → `FormLabel` + `FormControl` + `FormMessage`
- **Never** use uncontrolled `<input>` directly — always spread `{...field}` from `FormField`'s render prop
- `FormMessage` automatically renders the Zod validation error — do NOT add manual error display alongside it

### Props
- The form component receives `onSubmit: (data: T) => Promise<void>` — it does NOT call APIs directly
- The caller (page or dialog) is responsible for the API call, toast feedback, and navigation
- This makes forms independently testable and reusable across dialogs and pages

### Loading / disabled state
- Use `form.formState.isSubmitting` on the submit button
- Pass `disabled={form.formState.isSubmitting}` to any field that should lock during submission

## Anti-Patterns (FORBIDDEN)

```tsx
// ❌ Manual state per field
const [name, setName] = useState("")
const [model, setModel] = useState("")

// ❌ Manual validation in handleSubmit
if (!name) { setError("Name required"); return }

// ❌ Separate loading state
const [loading, setLoading] = useState(false)

// ❌ Schema defined elsewhere and imported
import { agentSchema } from "@/lib/schemas"

// ❌ Uncontrolled input without FormField
<input value={name} onChange={e => setName(e.target.value)} />

// ❌ Form component calling the API directly
const handleSubmit = async (data) => {
  await fetch("/api/agents", { method: "POST", body: JSON.stringify(data) })
}
```

## Where Forms Live

A form component is always rendered inside a named dialog or page:

```tsx
// components/dialogs/agents/create.tsx
export function DialogAgentCreate({ open, onOpenChange }) {
  const handleSubmit = async (data) => {
    await createAgent(data)
    toast.success("Agent created")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <FormAgentCreate onSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  )
}
```

The form has no knowledge of the dialog. The dialog has no knowledge of form internals.
