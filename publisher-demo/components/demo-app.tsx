"use client"

import { EMPTY_STATE, MODEL, useOrchestratorState } from "@/hooks/use-orchestrator-state"
import { ConfigBar } from "./config-bar"
import { Icon } from "./icons"
import { Agent } from "./panels/agent"
import { Datasources } from "./panels/datasources"
import { ExternalApis } from "./panels/external-apis"
import { Observability } from "./panels/observability"
import { DsButton } from "./widgets"

/**
 * Desktop shell. State lives in `useOrchestratorState()` so the mobile shell
 * can share it without re-mounting panel components.
 */
export function DemoApp() {
  const s = useOrchestratorState()

  return (
    <div className="app">
      <div className="titlebar">
        <img className="logo" src="/assets/logo-w.svg" alt="Alien" />
        <span className="tb-pill">
          <span className="pulse-dot" />
          Live demo
        </span>
        <span className="tb-spacer" />
        {s.config.errorMessage && (
          <span
            className="tb-pill"
            style={{ color: "var(--destructive)", borderColor: "var(--destructive)" }}
            title={s.config.errorMessage}
          >
            <span className="pulse-dot" style={{ background: "var(--destructive)" }} />
            backend disconnected
          </span>
        )}
        <DsButton variant="ghost" size="sm" onClick={s.reset}>
          <Icon name="reset" size={14} />
          Reset
        </DsButton>
      </div>

      <div className="substrip">
        <h1>
          <span className="muted">Your data. Your APIs.</span>{" "}
          <span className="accent">Agent-ready.</span>{" "}
          <span className="muted">Royalty-bearing.</span>
        </h1>
      </div>

      <ConfigBar
        dsCount={s.dsClusterCount}
        apiCount={s.apiSelectedCount}
        dirty={s.config.isDirty}
        isSaving={s.config.isSaving}
        pulseKey={s.cfgPulse}
        mode={s.mode}
        onSave={s.onSaveConfig}
        onRequestSwitch={s.onRequestSwitch}
      />

      <div className="grid">
        <div className="left-col">
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
        <Agent
          mode={s.mode}
          model={MODEL}
          messages={s.messages}
          timeline={s.timeline}
          railActive={s.railActive}
          input={s.input}
          pressed={s.pressed}
          suggestions={s.suggestions}
          suggestionsStatus={s.suggestionsStatus}
          emptyState={EMPTY_STATE[s.mode]}
          onChip={s.onChip}
          onInput={s.setInput}
          onSend={() => {
            if (s.input.trim()) s.runAgent(s.input.trim())
          }}
        />
        <Observability
          counters={s.counters}
          royHist={s.royHist}
          feed={s.feed}
          attribution={s.attribution}
          pulse={s.pulse}
          flash={s.feedFlash}
          sessionRoyalty={s.sessionRoyalty}
        />
      </div>

      {s.pendingMode && (
        <div className="modal-overlay" onClick={() => s.setPendingMode(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Switch to {s.pendingMode === "agentic" ? "Agentic flow" : "Data flow"}?</h3>
            <p>
              This restarts the session on a different runtime. You'll start a fresh chat with the
              same datasources, APIs, and tools — the agent's memory of this conversation won't
              carry over.
            </p>
            <div className="modal-btns">
              <DsButton variant="ghost" size="sm" onClick={() => s.setPendingMode(null)}>
                Cancel
              </DsButton>
              <DsButton variant="primary" size="sm" onClick={s.confirmSwitch}>
                Switch and start new chat
              </DsButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
