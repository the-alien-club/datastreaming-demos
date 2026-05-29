"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface SelectMcpTypePickerProps {
  value: string | undefined
  onValueChange: (v: string) => void
  options: readonly string[]
  disabled?: boolean
}

export function SelectMcpTypePicker({
  value,
  onValueChange,
  options,
  disabled,
}: SelectMcpTypePickerProps) {
  return (
    <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
