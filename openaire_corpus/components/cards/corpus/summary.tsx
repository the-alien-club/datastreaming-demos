"use client"

// components/cards/corpus/summary.tsx
// The corpus comprehension summary: four always-visible stat tiles
// (Total records / Open-access rate / With abstracts / Peer-reviewed) mirroring
// the OpenAIRE design prototype grid. Rates are computed over RESOLVED documents
// (access.resolved is the denominator); null-heavy fields never inflate a rate.
// Client component: receives live corpus state after TanStack Query revalidates.

import { useTranslations } from "next-intl"
import { CardSharedStat } from "@/components/cards/shared/stat"
import type { CorpusSnapshot } from "@/models/corpus/schema"

interface Props {
  corpus: CorpusSnapshot
}

/** Percentage of `n` over `total`, rounded; "—" when the denominator is 0. */
function pct(n: number, total: number): string {
  if (total <= 0) return "—"
  return `${Math.round((n / total) * 100)}%`
}

export function CardCorpusSummary({ corpus }: Props) {
  const t = useTranslations("corpus.summary")

  const { access } = corpus
  const resolved = access.resolved

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <CardSharedStat
        label={t("records")}
        value={corpus.total.toLocaleString("en-US")}
        sub={
          corpus.pendingCount > 0
            ? t("pendingSub", { count: corpus.pendingCount })
            : t("recordsSub")
        }
      />
      <CardSharedStat
        label={t("openAccess")}
        value={pct(access.open, resolved)}
        sub={t("openAccessSub", { open: access.open, total: resolved })}
      />
      <CardSharedStat
        label={t("withAbstracts")}
        value={access.withAbstract.toLocaleString("en-US")}
        sub={t("withAbstractsSub", { total: resolved })}
      />
      <CardSharedStat
        label={t("peerReviewed")}
        value={access.peerReviewed.toLocaleString("en-US")}
        sub={t("peerReviewedSub", { total: resolved })}
      />
    </div>
  )
}
