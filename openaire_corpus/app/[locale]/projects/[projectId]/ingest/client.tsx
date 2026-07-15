"use client"

// app/[locale]/projects/[projectId]/ingest/client.tsx
// Ingestion step client component. Owns ingest job lifecycle state: submit,
// poll, cancel. Renders the pipeline card only while a job is active.
// No corpus mutation — ingest reads the corpus state set by the Corpus step.
// Every resolved corpus document is ingestable, so there is no confirmation gate.

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  useIngestStatus,
  useSubmitIngest,
  useCancelIngest,
  useRetryFailedIngest,
} from "@/hooks/api/ingest"
import { CardIngestSummary } from "@/components/cards/ingest/summary"
import { CardIngestQueueStatus } from "@/components/cards/ingest/queue-status"
import { CardComeBackLater } from "@/components/cards/ingest/come-back-later"
import { CardIngestCompletion } from "@/components/cards/ingest/completion"
import { CardIngestRetryFailed } from "@/components/cards/ingest/retry-failed"
import { CardIngestJobHistory } from "@/components/cards/ingest/job-history"
import { INGEST_STATUS } from "@/models/ingest/schema"
import { WorkspaceHeader } from "@/components/layouts/workspace/header"
import { DialogIngestConfirmCancel } from "@/components/dialogs/ingest/confirm-cancel"
import type { IngestJobView } from "@/models/ingest/types"

interface Props {
  projectId: string
  initialUser: { name?: string; email: string }
  headVersionSeq: number
  ingestedVersionSeq: number | null
  deltaPreview: {
    added: number
    removed: number
  }
  activeJobId: string | null
  initialRecentJobs: IngestJobView[]
}

export function IngestClient({
  projectId,
  initialUser,
  headVersionSeq,
  ingestedVersionSeq,
  deltaPreview,
  activeJobId: initialActiveJobId,
  initialRecentJobs,
}: Props) {
  const [activeJobId, setActiveJobId] = useState<string | null>(
    initialActiveJobId,
  )
  const [showCancel, setShowCancel] = useState(false)

  const router = useRouter()
  const submitMutation = useSubmitIngest(projectId)
  const cancelMutation = useCancelIngest(projectId)
  const retryMutation = useRetryFailedIngest(projectId)
  const status = useIngestStatus(activeJobId)

  // The delta panel, ingested-version label, and job history are server-rendered
  // props. When a job goes terminal those props are stale, so re-run the server
  // component once on the live→terminal transition. router.refresh() preserves
  // client state. Guarded by a ref so it fires exactly once per job.
  const wasLiveRef = useRef(Boolean(initialActiveJobId))
  useEffect(() => {
    const s = status.data?.status
    if (!s) return
    if (s === INGEST_STATUS.QUEUED || s === INGEST_STATUS.RUNNING) {
      wasLiveRef.current = true
    } else if (wasLiveRef.current) {
      wasLiveRef.current = false
      router.refresh()
    }
  }, [status.data?.status, router])

  const onSubmit = async () => {
    const job = await submitMutation.mutateAsync({})
    setActiveJobId(job.id)
  }

  const onRetryFailed = async () => {
    if (!activeJobId) return
    const job = await retryMutation.mutateAsync(activeJobId)
    setActiveJobId(job.id)
  }

  const onCancel = () => setShowCancel(true)

  const confirmCancel = async () => {
    if (activeJobId) await cancelMutation.mutateAsync(activeJobId)
    setShowCancel(false)
  }

  return (
    <div className="flex flex-col h-screen">
      <WorkspaceHeader user={initialUser} projectId={projectId} />

      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full overflow-auto *:shrink-0">
        <CardIngestSummary
          headSeq={headVersionSeq}
          ingestedSeq={ingestedVersionSeq}
          delta={deltaPreview}
          activeJob={status.data ?? null}
          onSubmit={() => void onSubmit()}
          isSubmitting={submitMutation.isPending}
        />

        {activeJobId && status.data && (
          <>
            {/* Done: hand off to Research. Partial: the successes ARE indexed,
                so also offer the success CTA, plus a retry for the failed docs. */}
            {(status.data.status === INGEST_STATUS.DONE ||
              status.data.status === INGEST_STATUS.PARTIAL) && (
              <CardIngestCompletion projectId={projectId} />
            )}

            {(status.data.status === INGEST_STATUS.QUEUED ||
              status.data.status === INGEST_STATUS.RUNNING) && (
              <>
                <CardComeBackLater />
                <CardIngestQueueStatus job={status.data} onCancel={onCancel} />
              </>
            )}

            {(status.data.status === INGEST_STATUS.FAILED ||
              status.data.status === INGEST_STATUS.PARTIAL) && (
              <CardIngestRetryFailed
                error={status.data.error}
                onRetry={() => void onRetryFailed()}
                isRetrying={retryMutation.isPending}
              />
            )}
          </>
        )}

        <CardIngestJobHistory projectId={projectId} jobs={initialRecentJobs} />
      </div>

      <DialogIngestConfirmCancel
        open={showCancel}
        onOpenChange={setShowCancel}
        onConfirm={() => void confirmCancel()}
        isPending={cancelMutation.isPending}
      />
    </div>
  )
}
