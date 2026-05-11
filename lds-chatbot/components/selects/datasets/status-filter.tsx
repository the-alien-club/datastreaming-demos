"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTranslations } from "next-intl"
import { DATASET_STATUS } from "@/lib/db/schema"

interface SelectDatasetStatusFilterProps {
  value: string
  onValueChange: (v: string) => void
}

export function SelectDatasetStatusFilter({
  value,
  onValueChange,
}: SelectDatasetStatusFilterProps) {
  const tCommon = useTranslations("common")

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{tCommon("filterAll")}</SelectItem>
        <SelectItem value={DATASET_STATUS.Ready}>{DATASET_STATUS.Ready}</SelectItem>
        <SelectItem value={DATASET_STATUS.Processing}>{DATASET_STATUS.Processing}</SelectItem>
        <SelectItem value={DATASET_STATUS.Pending}>{DATASET_STATUS.Pending}</SelectItem>
        <SelectItem value={DATASET_STATUS.Error}>{DATASET_STATUS.Error}</SelectItem>
      </SelectContent>
    </Select>
  )
}
