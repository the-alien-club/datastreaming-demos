"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useTranslations } from "next-intl"

interface TabsAgentKnowledgeModeProps {
  value: string
  onValueChange: (v: string) => void
  existingContent: React.ReactNode
  uploadContent: React.ReactNode
}

export function TabsAgentKnowledgeMode({
  value,
  onValueChange,
  existingContent,
  uploadContent,
}: TabsAgentKnowledgeModeProps) {
  const t = useTranslations("wizard.steps.knowledge")

  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList>
        <TabsTrigger value="existing">{t("knowledgeExisting")}</TabsTrigger>
        <TabsTrigger value="upload">{t("knowledgeUpload")}</TabsTrigger>
      </TabsList>
      <TabsContent value="existing">{existingContent}</TabsContent>
      <TabsContent value="upload">{uploadContent}</TabsContent>
    </Tabs>
  )
}
