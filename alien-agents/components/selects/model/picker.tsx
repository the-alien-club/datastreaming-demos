"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type PublicAIModel, providerLabelFromModel } from "@/lib/platform/client"

interface SelectModelPickerProps {
  value: string
  onValueChange: (v: string) => void
  id?: string
  models: PublicAIModel[]
  placeholder?: string
}

export function SelectModelPicker({
  value,
  onValueChange,
  id,
  models,
  placeholder,
}: SelectModelPickerProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {Array.from(new Map(models.map((m) => [m.slug, m])).values()).map((m) => (
          <SelectItem key={m.slug} value={m.slug}>
            <span>{m.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {providerLabelFromModel(m)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
