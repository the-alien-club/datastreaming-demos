"use client"

import { useTranslations } from "next-intl"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface SelectMcpTypeFilterProps {
  value: string
  onValueChange: (v: string) => void
  options: string[]
}

export function SelectMcpTypeFilter({
  value,
  onValueChange,
  options,
}: SelectMcpTypeFilterProps) {
  const t = useTranslations("mcps")
  const tCommon = useTranslations("common")

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-44">
        <SelectValue placeholder={t("typeLabel")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          {t("typeLabel")}: {tCommon("filterAll")}
        </SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
