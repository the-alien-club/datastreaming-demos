"use client"

import { useState } from "react"
import type { Mode } from "@/hooks/use-mode"
import { Icon, type IconName } from "./icons"
import { ModeInfoDialog } from "./mode-info-dialog"
import { InfoTip } from "./widgets"

/**
 * Compact mode-toggle card used in the desktop ConfigBar AND inside the
 * mobile Configuration drawer. Click toggles, the embedded info-button opens
 * a `<ModeInfoDialog>` with the schematic diagram.
 */
export function ModeChip({
  active,
  icon,
  name,
  sub,
  onClick,
  onInfo,
}: {
  active: boolean
  icon: IconName
  name: string
  sub: string
  onClick: () => void
  onInfo: () => void
}) {
  return (
    <button
      type="button"
      className={"mode-chip-card" + (active ? " active" : "")}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="mode-ic">
        <Icon name={icon} size={16} />
      </span>
      <span className="mcc-text">
        <span className="mcc-name">{name}</span>
        <span className="mcc-sub">{sub}</span>
      </span>
      <span className="mcc-right">
        <span className="mcc-active">
          <span className="pulse-dot" />
          Active
        </span>
        <span
          className="mcc-info"
          role="button"
          tabIndex={0}
          aria-label={`How ${name} works`}
          onClick={(e) => {
            e.stopPropagation()
            onInfo()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation()
              e.preventDefault()
              onInfo()
            }
          }}
        >
          <Icon name="info" size={15} />
        </span>
      </span>
    </button>
  )
}

/**
 * Full-width top strip with the access-mode toggle on the left and the MCP
 * configuration counts + Save on the right. Replaces both the rev-1
 * <ConfigChip> and the rev-1 <AccessMode> panel.
 */
export function ConfigBar({
  dsCount,
  apiCount,
  dirty,
  isSaving,
  pulseKey,
  mode,
  onSave,
  onRequestSwitch,
}: {
  dsCount: number
  apiCount: number
  dirty: boolean
  isSaving: boolean
  pulseKey: number
  mode: Mode
  onSave: () => void
  onRequestSwitch: (target: Mode) => void
}) {
  const [infoMode, setInfoMode] = useState<Mode | null>(null)
  return (
    <div className={"config-bar" + (dirty ? " dirty" : "")} key={`cfg${pulseKey}`}>
      <div className="cfg-modes">
        <div className="cfg-modes-label">
          <span>Access mode</span>
          <InfoTip text="How agents use your MCP Configuration. Switching restarts the session — context does not transfer between runtimes." />
        </div>
        <div className="mode-toggle">
          <ModeChip
            active={mode === "dataflow"}
            icon="plug"
            name="Data flow"
            sub="Connect Alien data to your AI system"
            onClick={() => mode !== "dataflow" && onRequestSwitch("dataflow")}
            onInfo={() => setInfoMode("dataflow")}
          />
          <ModeChip
            active={mode === "agentic"}
            icon="network"
            name="Agentic flow"
            sub="Create, use and export your AI harness"
            onClick={() => mode !== "agentic" && onRequestSwitch("agentic")}
            onInfo={() => setInfoMode("agentic")}
          />
        </div>
      </div>
      <div className="cfg-divider" />
      <div className="cfg-config">
        <div className="cfg-modes-label">
          <span>MCP configuration</span>
          <InfoTip text="One shared set of datasources and proxied APIs — used by both access modes." />
        </div>
        <div className="cfg-config-body">
          <span className="cfg-counts">
            <Icon name="database" size={15} />
            {dsCount} datasources · {apiCount} APIs
          </span>
          {dirty ? (
            <button
              type="button"
              className="cfg-save"
              onClick={onSave}
              disabled={isSaving}
            >
              <Icon name="check" size={13} strokeWidth={2.4} />
              {isSaving ? "Saving…" : "Save & restart"}
            </button>
          ) : (
            <span className="cfg-synced">
              <span className="pulse-dot" />
              Synced
            </span>
          )}
        </div>
      </div>
      {infoMode && <ModeInfoDialog modeKey={infoMode} onClose={() => setInfoMode(null)} />}
    </div>
  )
}
