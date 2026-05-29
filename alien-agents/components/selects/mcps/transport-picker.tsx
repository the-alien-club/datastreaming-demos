"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MCP_TRANSPORT } from "@/lib/constants"

interface SelectMcpTransportPickerProps {
  value: string
  onValueChange: (v: string) => void
  disabled?: boolean
}

export function SelectMcpTransportPicker({
  value,
  onValueChange,
  disabled,
}: SelectMcpTransportPickerProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={MCP_TRANSPORT.StreamableHttp}>
          {MCP_TRANSPORT.StreamableHttp}
        </SelectItem>
        <SelectItem value={MCP_TRANSPORT.Sse}>{MCP_TRANSPORT.Sse}</SelectItem>
        <SelectItem value={MCP_TRANSPORT.Stdio}>{MCP_TRANSPORT.Stdio}</SelectItem>
      </SelectContent>
    </Select>
  )
}
