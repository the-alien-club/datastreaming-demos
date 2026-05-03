import { Link } from "@/i18n/routing"
import { useFormatter, useTranslations } from "next-intl"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BrainCircuit, Settings } from "lucide-react"
import { PrivacyBadge } from "@/components/privacy-badge"
import { PublishCardAction } from "@/components/publish-card-action"
import { DeleteCardAction } from "@/components/delete-card-action"
import { DEFAULT_MODEL_SLUG } from "@/lib/constants"

export type SpecialistCardData = {
  id: string
  name: string
  description: string | null
  model: string | null
  mcpIds: string | null
  isPublic: boolean
  userId: string
  createdAt: Date | null
}

/**
 * Single source of truth for specialist card UI. `editable=true` adds the
 * owner action footer; otherwise the card has no footer (read-only library
 * view).
 */
export function SpecialistCard({
  specialist,
  mcpNames,
  authorName,
  editable = false,
}: {
  specialist: SpecialistCardData
  mcpNames: Map<string, string>
  authorName: string
  editable?: boolean
}) {
  const t = useTranslations("specialists")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const mcpIds: string[] = specialist.mcpIds ? JSON.parse(specialist.mcpIds) : []
  const createdAt = specialist.createdAt
    ? format.dateTime(new Date(specialist.createdAt), { dateStyle: "medium" })
    : "—"

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-wrap grow w-full">{specialist.name}</span>
          <PrivacyBadge isPublic={specialist.isPublic} />
        </CardTitle>
        {specialist.description && (
          <CardDescription className="line-clamp-2 text-sm">
            {specialist.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col flex-1 justify-end gap-2">
        <Badge variant="secondary" className="text-xs">
          {specialist.model ?? DEFAULT_MODEL_SLUG}
        </Badge>
        <div className="flex flex-wrap gap-1 ">
          {mcpIds.map((mcpId) => (
            <Badge key={mcpId} variant="outline" className="text-xs">
              {mcpNames.get(mcpId) ?? mcpId}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="pt-2 gap-2 flex-wrap">
        <div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="text-wrap font-bold">{tCommon("createdBy", { name: authorName })}</span>
          <span className="shrink-0">{t("created", { date: createdAt })}</span>
        </div>
        {editable && (
          <div className="flex w-full justify-between gap-2">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <Link href={`/specialists/${specialist.id}`}>
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                {tCommon("edit")}
              </Link>
            </Button>
            <PublishCardAction
              resource="specialist"
              endpoint={`/api/specialists/${specialist.id}`}
              isPublic={specialist.isPublic}
            />
            <DeleteCardAction
              resource="specialist"
              name={specialist.name}
              endpoint={`/api/specialists/${specialist.id}`}
            />
          </div>
        )}
      </CardFooter>
    </Card>
  )
}
