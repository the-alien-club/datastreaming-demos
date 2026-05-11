"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, X } from "lucide-react"

interface DropdownCategoriesSelectProps {
  value: string[]
  onChange: (next: string[]) => void
  options: readonly string[]
  placeholder: string
  disabled?: boolean
}

export function DropdownCategoriesSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: DropdownCategoriesSelectProps) {
  function toggle(category: string, checked: boolean) {
    if (checked) onChange(Array.from(new Set([...value, category])))
    else onChange(value.filter((c) => c !== category))
  }

  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={value.length === 0 ? "text-muted-foreground" : ""}>
              {value.length === 0 ? placeholder : `${value.length} sélectionnée(s)`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-(--radix-dropdown-menu-trigger-width) max-h-72 overflow-y-auto"
        >
          {options.map((cat) => (
            <DropdownMenuCheckboxItem
              key={cat}
              checked={value.includes(cat)}
              onCheckedChange={(checked) => toggle(cat, checked === true)}
              onSelect={(e) => e.preventDefault()}
            >
              {cat}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((cat) => (
            <Badge
              key={cat}
              variant="outline"
              className="gap-1 pr-1 border-primary/30 bg-primary/5 text-primary"
            >
              {cat}
              <button
                type="button"
                onClick={() => onChange(value.filter((c) => c !== cat))}
                disabled={disabled}
                className="hover:bg-primary/15 rounded-sm p-0.5 disabled:opacity-50"
                aria-label={`Remove ${cat}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
