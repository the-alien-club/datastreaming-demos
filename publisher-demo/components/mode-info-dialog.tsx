"use client"

import type { Mode } from "@/hooks/use-mode"
import { Icon, type IconName } from "./icons"

/**
 * "How it works" dialog opened from the small info button on each
 * <ModeChip> in the desktop ConfigBar (and the mobile drawer). The diagram
 * SVGs are transcribed verbatim from rev-2 panel-mid.jsx:27-121.
 */

function DataFlowDiagram() {
  return (
    <svg
      className="mode-svg"
      viewBox="0 0 600 250"
      role="img"
      aria-label="Data flow architecture"
    >
      <defs>
        <marker
          id="ar"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--neutral-500)" />
        </marker>
        <marker
          id="arT"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--teal-400)" />
        </marker>
      </defs>

      <g className="nd">
        <rect x="20" y="86" width="150" height="78" rx="10" />
        <text className="t-h" x="95" y="116">
          Your AI app
        </text>
        <text className="t-s" x="95" y="136">
          Claude Desktop ·
        </text>
        <text className="t-s" x="95" y="151">
          Cursor · custom
        </text>
      </g>

      <line className="ln-t" x1="170" y1="125" x2="232" y2="125" markerEnd="url(#arT)" />
      <text className="t-m" x="201" y="115">
        MCP
      </text>

      <g className="nd nd-a">
        <rect x="234" y="78" width="146" height="94" rx="10" />
        <path
          className="glyph"
          d="M307 100c-7 11-10 24-10 44h5c0-16 2-28 5-34 3 6 5 18 5 34h5c0-20-3-33-10-44z"
        />
        <text className="t-h" x="307" y="150">
          Alien MCP
        </text>
        <text className="t-s" x="307" y="165">
          on your cluster
        </text>
      </g>

      <line className="ln" x1="380" y1="106" x2="448" y2="92" markerEnd="url(#ar)" />
      <line className="ln" x1="380" y1="144" x2="448" y2="170" markerEnd="url(#ar)" />

      <g className="nd nd-r">
        <rect x="450" y="62" width="130" height="58" rx="9" />
        <text className="t-h2" x="515" y="88">
          Datasources
        </text>
        <text className="t-s" x="515" y="105">
          documents
        </text>
      </g>
      <g className="nd nd-r">
        <rect x="450" y="146" width="130" height="58" rx="9" />
        <text className="t-h2" x="515" y="172">
          Proxied APIs
        </text>
        <text className="t-s" x="515" y="189">
          existing services
        </text>
      </g>
    </svg>
  )
}

function AgenticDiagram() {
  return (
    <svg
      className="mode-svg"
      viewBox="0 0 600 250"
      role="img"
      aria-label="Agentic harness architecture"
    >
      <defs>
        <marker
          id="ar2"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--neutral-500)" />
        </marker>
        <marker
          id="arT2"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--teal-400)" />
        </marker>
      </defs>

      <rect className="frame" x="14" y="14" width="372" height="222" rx="12" />
      <text className="t-frame" x="30" y="36">
        LangGraph deep agent
      </text>

      <g className="nd nd-a">
        <rect x="142" y="48" width="116" height="40" rx="9" />
        <text className="t-h2" x="200" y="72">
          Planner
        </text>
      </g>

      <line className="ln" x1="200" y1="88" x2="78" y2="120" markerEnd="url(#ar2)" />
      <line className="ln" x1="200" y1="88" x2="200" y2="120" markerEnd="url(#ar2)" />
      <line className="ln" x1="200" y1="88" x2="322" y2="120" markerEnd="url(#ar2)" />
      <g className="nd">
        <rect x="28" y="122" width="100" height="38" rx="8" />
        <text className="t-h2" x="78" y="145">
          Subagent
        </text>
      </g>
      <g className="nd">
        <rect x="150" y="122" width="100" height="38" rx="8" />
        <text className="t-h2" x="200" y="145">
          Subagent
        </text>
      </g>
      <g className="nd">
        <rect x="272" y="122" width="100" height="38" rx="8" />
        <text className="t-h2" x="322" y="145">
          Subagent
        </text>
      </g>

      <g className="nd nd-c">
        <rect x="142" y="180" width="116" height="38" rx="9" />
        <text className="t-h2" x="200" y="203">
          Critic
        </text>
      </g>
      <line className="ln" x1="128" y1="141" x2="148" y2="190" markerEnd="url(#ar2)" />
      <line className="ln" x1="200" y1="160" x2="200" y2="178" markerEnd="url(#ar2)" />
      <line className="ln" x1="272" y1="141" x2="252" y2="190" markerEnd="url(#ar2)" />
      <path className="ln-d" d="M258 199 C306 199 306 68 260 68" markerEnd="url(#ar2)" />

      <line className="ln-t" x1="386" y1="125" x2="430" y2="125" markerEnd="url(#arT2)" />
      <text className="t-m" x="408" y="115">
        MCP
      </text>
      <g className="nd nd-r">
        <rect x="432" y="70" width="150" height="48" rx="9" />
        <text className="t-h2" x="507" y="92">
          Datasources
        </text>
        <text className="t-s" x="507" y="108">
          on your cluster
        </text>
      </g>
      <g className="nd nd-r">
        <rect x="432" y="132" width="150" height="48" rx="9" />
        <text className="t-h2" x="507" y="154">
          Proxied APIs
        </text>
        <text className="t-s" x="507" y="170">
          existing services
        </text>
      </g>
    </svg>
  )
}

interface ModeInfo {
  icon: IconName
  name: string
  tagline: string
  Diagram: () => React.JSX.Element
  points: string[]
}

const MODE_INFO: Record<Mode, ModeInfo> = {
  dataflow: {
    icon: "plug",
    name: "Data flow",
    tagline: "Connect Alien data to your AI system.",
    Diagram: DataFlowDiagram,
    points: [
      "Your app calls one MCP endpoint",
      "Reads run in-place on your cluster",
      "Every call metered & attributed",
    ],
  },
  agentic: {
    icon: "network",
    name: "Agentic flow",
    tagline: "Create, use and export your AI harness.",
    Diagram: AgenticDiagram,
    points: [
      "Planner routes specialist subagents",
      "Critic loop checks the synthesis",
      "Same MCP tools — export when ready",
    ],
  },
}

export function ModeInfoDialog({
  modeKey,
  onClose,
}: {
  modeKey: Mode
  onClose: () => void
}) {
  const info = MODE_INFO[modeKey]
  if (!info) return null
  const { Diagram } = info
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="mode-modal-head">
          <span className="mode-modal-ic">
            <Icon name={info.icon} size={17} />
          </span>
          <div>
            <h3>{info.name}</h3>
            <p className="mode-modal-tag">{info.tagline}</p>
          </div>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="mode-diagram">
          <Diagram />
        </div>
        <div className="mode-points">
          {info.points.map((p, i) => (
            <span className="mode-point" key={i}>
              <Icon name="check" size={12} strokeWidth={2.4} />
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
