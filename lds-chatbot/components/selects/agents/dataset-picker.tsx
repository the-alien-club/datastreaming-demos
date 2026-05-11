"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DatasetOption {
  id: string
  name: string
}

interface SelectAgentDatasetPickerProps {
  value: string
  onValueChange: (v: string) => void
  datasets: DatasetOption[]
  placeholder: string
  id?: string
}

export function SelectAgentDatasetPicker({
  value,
  onValueChange,
  datasets,
  placeholder,
  id,
}: SelectAgentDatasetPickerProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {datasets.map((dataset) => (
          <SelectItem key={dataset.id} value={dataset.id}>
            {dataset.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
