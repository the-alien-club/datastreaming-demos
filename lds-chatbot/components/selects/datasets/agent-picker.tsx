"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AgentOption {
  id: string
  name: string
}

interface SelectDatasetAgentPickerProps {
  value: string
  onValueChange: (v: string) => void
  agents: AgentOption[]
  placeholder: string
  id?: string
}

export function SelectDatasetAgentPicker({
  value,
  onValueChange,
  agents,
  placeholder,
  id,
}: SelectDatasetAgentPickerProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            {agent.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
