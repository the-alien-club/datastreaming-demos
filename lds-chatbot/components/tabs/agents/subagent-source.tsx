"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

interface TabsAgentSubagentSourceProps {
  value: "library" | "new"
  onValueChange: (v: "library" | "new") => void
  libraryCount: number
  libraryLabel: string
  newLabel: string
  children: React.ReactNode
}

export function TabsAgentSubagentSource({
  value,
  onValueChange,
  libraryCount,
  libraryLabel,
  newLabel,
  children,
}: TabsAgentSubagentSourceProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as "library" | "new")}>
      <TabsList className="w-full">
        <TabsTrigger value="library" className="flex-1">
          {libraryLabel}
          {libraryCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
              {libraryCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="new" className="flex-1">
          {newLabel}
        </TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  )
}
