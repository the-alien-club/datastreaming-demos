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
        {/* Canonical Alien glyph (mirrors public/assets/glyph.svg). Inlined
            rather than referenced via <image> so the .glyph CSS fill applies
            for theme consistency. Nested <svg> applies its own viewBox so the
            glyph's native coordinate system stays untouched. */}
        <svg x="296" y="91" width="22" height="32" viewBox="0 0 18.888603 27.114496">
          <g transform="translate(49.931157,-87.081504)">
            <rect
              className="glyph"
              x="-41.266052"
              y="96.143478"
              width="1.55575"
              height="12.430124"
            />
            <path
              className="glyph"
              d="m -32.550678,102.75277 c -0.404813,-2.06904 -0.896938,-4.074579 -1.4605,-5.963704 -0.53975,-1.881188 -1.164167,-3.577167 -1.857375,-5.045604 -0.685271,-1.471084 -1.441979,-2.640542 -2.248959,-3.476625 -0.769937,-0.796396 -1.55575,-1.185333 -2.405062,-1.185333 -0.775229,0 -1.505479,0.375708 -2.227792,1.145645 -0.764646,0.817563 -1.500187,1.952625 -2.185458,3.381375 -0.672042,1.423459 -1.309688,3.087688 -1.894417,4.947709 -0.563562,1.862666 -1.066271,3.857627 -1.494895,5.926667 -0.428625,2.05317 -0.783167,4.14337 -1.055688,6.21242 -0.251354,1.91293 -0.433917,3.76237 -0.550333,5.50068 h 1.561041 c 0.09525,-1.60866 0.248709,-3.31787 0.460375,-5.08529 0.251354,-1.9341 0.563563,-3.88144 0.928688,-5.78908 0.365125,-1.905 0.780521,-3.738564 1.23825,-5.445127 0.481541,-1.73302 0.992187,-3.291416 1.518708,-4.632854 0.534458,-1.359958 1.090083,-2.44475 1.656292,-3.230562 0.650875,-0.894292 1.338791,-1.344084 2.045229,-1.344084 0.732896,0 1.423458,0.455084 2.050521,1.349375 0.584729,0.801688 1.153583,1.899709 1.688041,3.259667 0.529167,1.346729 1.02923,2.905125 1.484313,4.632854 0.455083,1.719792 0.870479,3.563941 1.23825,5.479521 0.365125,1.905 0.674687,3.8391 0.926041,5.7494 0.232834,1.76212 0.396875,3.46075 0.494771,5.05618 h 1.598084 c -0.0979,-1.62983 -0.272521,-3.39725 -0.52123,-5.25727 -0.248708,-2.03464 -0.582083,-4.11427 -0.986895,-6.18596"
            />
          </g>
        </svg>
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
