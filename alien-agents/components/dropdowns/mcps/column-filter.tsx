"use client"

import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"

interface DropdownMcpColumnFilterProps {
  value: string[]
  onChange: (next: string[]) => void
  options: string[]
}

export function DropdownMcpColumnFilter({
  value,
  onChange,
  options,
}: DropdownMcpColumnFilterProps) {
  const t = useTranslations("mcps")

  function toggle(cat: string, checked: boolean) {
    if (checked) onChange(Array.from(new Set([...value, cat])))
    else onChange(value.filter((c) => c !== cat))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          {t("categoriesLabel")}
          {value.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5">
              {value.length}
            </Badge>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto w-64">
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
  )
}
