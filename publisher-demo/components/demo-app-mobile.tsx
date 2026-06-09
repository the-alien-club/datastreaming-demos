"use client"

import { useRef, useState } from "react"
import {
  EMPTY_STATE,
  MODEL,
  SUGGESTIONS,
  useOrchestratorState,
  type OrchestratorState,
} from "@/hooks/use-orchestrator-state"
import type { Mode } from "@/hooks/use-mode"
import { ModeChip } from "./config-bar"
import { Icon } from "./icons"
import { ModeInfoDialog } from "./mode-info-dialog"
import { Agent } from "./panels/agent"
import { Datasources } from "./panels/datasources"
import { ExternalApis } from "./panels/external-apis"
import { Observability } from "./panels/observability"
import { DsButton } from "./widgets"

const PAGES = ["data", "chat", "obs"] as const

/**
 * Configuration is a TOP drawer (designer's call, chat1.md:1731). Holds the
 * mode toggle so a user can switch runtimes without leaving the chat page.
 */
function ConfigDrawer({
  s,
  onClose,
}: {
  s: OrchestratorState
  onClose: () => void
}) {
  const [infoMode, setInfoMode] = useState<Mode | null>(null)
  return (
    <div className="m-drawer-overlay" onClick={onClose}>
      <div className="m-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="m-drawer-head">
          <span className="cfg-ic">
            <Icon name="gear" size={16} />
          </span>
          <span className="cfg-title">Configuration</span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="m-sheet-label">Access mode</div>
        <div className="m-mode-stack">
          <ModeChip
            active={s.mode === "dataflow"}
            icon="plug"
            name="Data flow"
            sub="Connect Alien data to your AI system"
            onClick={() => s.mode !== "dataflow" && s.setPendingMode("dataflow")}
            onInfo={() => setInfoMode("dataflow")}
          />
          <ModeChip
            active={s.mode === "agentic"}
            icon="network"
            name="Agentic flow"
            sub="Create, use and export your AI harness"
            onClick={() => s.mode !== "agentic" && s.setPendingMode("agentic")}
            onInfo={() => setInfoMode("agentic")}
          />
        </div>
        <div className="m-drawer-grab" />
        {infoMode && <ModeInfoDialog modeKey={infoMode} onClose={() => setInfoMode(null)} />}
      </div>
    </div>
  )
}

/**
 * Mobile shell — 3-page horizontal swipe pager (Data / Chat / Observability)
 * with a top configuration drawer. Pointer handling defers `setPointerCapture`
 * until horizontal drag intent is established so taps on inner buttons/
 * checkboxes/composer pass through unchanged.
 */
export function DemoAppMobile() {
  const s = useOrchestratorState()
  const [page, setPage] = useState(1) // 0 Data · 1 Chat · 2 Observability
  const [drawer, setDrawer] = useState(false)
  const [drag, setDrag] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const dragging = useRef(false)
  const captured = useRef<number | null>(null)

  function goto(p: number) {
    setPage(Math.max(0, Math.min(2, p)))
  }
  const tapData = () => goto(page === 0 ? 1 : 0)
  const tapObs = () => goto(page === 2 ? 1 : 2)

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    startX.current = e.clientX
    startY.current = e.clientY
    dragging.current = false
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (startX.current == null || startY.current == null) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current
    if (!dragging.current) {
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) + 4) {
        dragging.current = true
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
          captured.current = e.pointerId
        } catch {
          // setPointerCapture may throw on some Safari versions; non-critical.
        }
      } else {
        return
      }
    }
    let d = dx
    if ((page === 0 && dx > 0) || (page === 2 && dx < 0)) d = dx * 0.32
    setDrag(d)
  }
  function onUp(e: React.PointerEvent<HTMLDivElement>) {
    if (startX.current == null) return
    const w = wrapRef.current?.offsetWidth ?? 360
    if (dragging.current) {
      if (drag < -w * 0.2) goto(page + 1)
      else if (drag > w * 0.2) goto(page - 1)
    }
    if (captured.current != null) {
      try {
        e.currentTarget.releasePointerCapture(captured.current)
      } catch {}
      captured.current = null
    }
    startX.current = null
    startY.current = null
    dragging.current = false
    setDrag(0)
  }

  const trackStyle: React.CSSProperties = {
    transform: `translateX(calc(${-page * (100 / 3)}% + ${drag}px))`,
    transition: drag ? "none" : "transform .34s cubic-bezier(.3,.7,.2,1)",
  }

  return (
    <div className="m-app">
      <div className="m-titlebar">
        <img className="m-logo" src="/assets/logo-w.svg" alt="Alien" />
        <span className="tb-pill">
          <span className="pulse-dot" />
          Live demo
        </span>
        <span className="m-tb-spacer" />
        <button type="button" className="m-reset" onClick={s.reset} aria-label="Reset">
          <Icon name="reset" size={15} />
        </button>
      </div>

      <header className="m-bar">
        <button
          type="button"
          className={"m-side" + (page === 0 ? " on" : "")}
          onClick={tapData}
          aria-label="Data panel"
        >
          <Icon name="database" size={18} />
          <span>Data</span>
        </button>

        <button
          type="button"
          className={"m-config" + (s.config.isDirty ? " dirty" : "")}
          onClick={() => setDrawer(true)}
        >
          <span className="m-config-title">Configuration</span>
          <span className="m-config-sub">
            <Icon name={s.mode === "agentic" ? "network" : "plug"} size={11} />
            {s.mode === "agentic" ? "Agentic flow" : "Data flow"}
            <span className={"m-config-state" + (s.config.isDirty ? " dirty" : "")}>
              {s.config.isDirty ? "Unsaved" : "Synced"}
            </span>
          </span>
        </button>

        <button
          type="button"
          className={"m-side right" + (page === 2 ? " on" : "")}
          onClick={tapObs}
          aria-label="Observability panel"
        >
          <span className="m-side-eur">€{s.counters.royalties.toFixed(2)}</span>
          <span>Royalties</span>
        </button>
      </header>

      <div
        className="m-pager-wrap"
        ref={wrapRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="m-track" style={trackStyle}>
          <section className="m-page">
            <div className="m-stack">
              <div className={"m-data-head" + (s.config.isDirty ? " dirty" : "")}>
                <span className="cfg-counts2">
                  <Icon name="database" size={14} />
                  {s.dsClusterCount} datasources · {s.apiSelectedCount} APIs
                </span>
                {s.config.isDirty ? (
                  <button
                    type="button"
                    className="cfg-save"
                    onClick={s.onSaveConfig}
                    disabled={s.config.isSaving}
                  >
                    <Icon name="check" size={13} strokeWidth={2.4} />
                    {s.config.isSaving ? "Saving…" : "Save & restart"}
                  </button>
                ) : (
                  <span className="cfg-synced">
                    <span className="pulse-dot" />
                    Synced
                  </span>
                )}
              </div>
              <Datasources
                view={s.config.view}
                isLoading={s.config.isLoading}
                errorMessage={s.config.errorMessage}
                onToggleDataset={s.onToggleDataset}
                onToggleCluster={s.onToggleCluster}
              />
              <ExternalApis
                view={s.config.view}
                isLoading={s.config.isLoading}
                errorMessage={s.config.errorMessage}
                onToggle={s.onToggleConnector}
              />
            </div>
          </section>
          <section className="m-page">
            <Agent
              mode={s.mode}
              model={MODEL}
              messages={s.messages}
              timeline={s.timeline}
              railActive={s.railActive}
              input={s.input}
              pressed={s.pressed}
              suggestions={SUGGESTIONS[s.mode]}
              emptyState={EMPTY_STATE[s.mode]}
              onChip={s.onChip}
              onInput={s.setInput}
              onSend={() => {
                if (s.input.trim()) s.runAgent(s.input.trim())
              }}
            />
          </section>
          <section className="m-page">
            <Observability
              counters={s.counters}
              royHist={s.royHist}
              feed={s.feed}
              attribution={s.attribution}
              pulse={s.pulse}
              flash={s.feedFlash}
              sessionRoyalty={s.sessionRoyalty}
            />
          </section>
        </div>
      </div>

      <div className="m-dots">
        {PAGES.map((p, i) => (
          <button
            type="button"
            key={p}
            className={"m-dot" + (page === i ? " on" : "")}
            onClick={() => goto(i)}
            aria-label={p}
          />
        ))}
      </div>

      {drawer && <ConfigDrawer s={s} onClose={() => setDrawer(false)} />}

      {s.pendingMode && (
        <div className="modal-overlay" onClick={() => s.setPendingMode(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Switch to {s.pendingMode === "agentic" ? "Agentic flow" : "Data flow"}?</h3>
            <p>
              This restarts the session on a different runtime. You'll start a fresh chat with
              the same datasources, APIs, and tools — the agent's memory of this conversation
              won't carry over.
            </p>
            <div className="modal-btns">
              <DsButton variant="ghost" size="sm" onClick={() => s.setPendingMode(null)}>
                Cancel
              </DsButton>
              <DsButton
                variant="primary"
                size="sm"
                onClick={() => {
                  s.confirmSwitch()
                  setDrawer(false)
                }}
              >
                Switch and start new chat
              </DsButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
