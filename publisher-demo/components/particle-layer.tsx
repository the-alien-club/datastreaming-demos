"use client"

import { useEffect, useRef } from "react"
import { useDemoEventListener } from "@/hooks/use-demo-events"

/**
 * Subtle particle layer. On every `tool-call` we emit a burst from the source
 * row/panel anchor → Agent panel anchor (data flowing IN). On every successful
 * `tool-result` we emit a second burst from Agent → Royalties counter anchor
 * (settlement flowing OUT). Errors emit nothing — silent failure.
 *
 * Anchors are resolved per emission via `[data-particle-anchor]` queries so
 * row collapse / page swipe / resize don't strand stale coordinates.
 *
 * Mobile (≤720px): source/target anchors are swapped for screen-edge points
 * so the animation doubles as a swipe-discoverability cue while the data /
 * observability pages are off-screen.
 *
 * Implementation notes
 *   • Single Canvas2D, fixed/pointer-events:none/z-index 50 — above panels,
 *     below modals (100) and drawer (90).
 *   • RAF loop runs only while particles exist; idle teardown when empty.
 *   • Hard cap (MAX_ALIVE) trims oldest particles when overshot.
 *   • prefers-reduced-motion = no-op (still subscribes, just doesn't emit).
 *   • SSR-safe: all canvas / window access lives inside useEffect.
 */

type Point = { x: number; y: number }
type Particle = {
  // Quadratic bezier endpoints + control. We compute curve(t) on every frame.
  p0: Point
  p1: Point
  cp: Point
  bornAt: number
  durationMs: number
  // Fractional delay so a burst staggers instead of releasing as a wall.
  startOffsetMs: number
  // RGB triplet baked at emission (read from CSS vars).
  r: number
  g: number
  b: number
  // Particle base radius (logical px before DPR scale).
  radius: number
}

const MAX_ALIVE = 64
const DESKTOP_BURST = 9
const MOBILE_BURST = 7

function isReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function isMobile(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches
}

/** Read a CSS variable from the document root and return `{r,g,b}`. Accepts
 *  `hsl(...)` / `#rrggbb` / `rgb(...)`. Falls back to teal on parse failure. */
function readCssRgb(varName: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof window === "undefined") return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw) return fallback
  // Cheap parser: paint into a throwaway canvas pixel and read it back.
  const cnv = document.createElement("canvas")
  cnv.width = cnv.height = 1
  const ctx = cnv.getContext("2d")
  if (!ctx) return fallback
  ctx.fillStyle = raw
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

/** Resolve a logical anchor name to a viewport point. Returns null if missing
 *  AND no fallback rule applies (caller should drop the emission). */
function resolveAnchor(name: string, mobile: boolean): Point | null {
  // Mobile edge anchors are derived from the .m-app rect; they don't exist
  // as DOM nodes.
  if (mobile) {
    const root = document.querySelector(".m-app") as HTMLElement | null
    if (!root) return null
    const r = root.getBoundingClientRect()
    const yMid = r.top + r.height * 0.55
    if (name === "edge:left") return { x: r.left + 24, y: yMid }
    if (name === "edge:right") return { x: r.right - 24, y: yMid }
    if (name === "edge:center") return { x: r.left + r.width / 2, y: yMid }
  }
  const node = document.querySelector(`[data-particle-anchor="${cssEscape(name)}"]`) as HTMLElement | null
  if (!node) return null
  const r = node.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** CSS.escape polyfill — attribution keys may contain `:` and digits which
 *  are already safe, but this guards against future label changes. */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s)
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
}

/** Pick the source anchor on desktop: try the specific attribution key first
 *  (cluster/dataset/connector row), then the panel-level fallback. */
function pickDesktopSource(attributionKey: string, kind: "dataset" | "api"): string {
  return attributionKey || (kind === "api" ? "panel:apis" : "panel:datasources")
}

function makeParticle(p0: Point, p1: Point, rgb: [number, number, number], now: number, opts: { staggerMs: number; durationMs: number; radius: number }): Particle {
  // Control point: midpoint pushed perpendicular to the segment with random
  // sign + magnitude. Gives each particle its own gentle curve.
  const mx = (p0.x + p1.x) / 2
  const my = (p0.y + p1.y) / 2
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  // Perpendicular unit vector.
  const nx = -dy / len
  const ny = dx / len
  const sway = (Math.random() - 0.5) * Math.min(180, len * 0.45)
  return {
    p0,
    p1,
    cp: { x: mx + nx * sway, y: my + ny * sway },
    bornAt: now,
    durationMs: opts.durationMs,
    startOffsetMs: opts.staggerMs,
    r: rgb[0],
    g: rgb[1],
    b: rgb[2],
    radius: opts.radius,
  }
}

/** Quadratic bezier sample. */
function curve(p0: Point, cp: Point, p1: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y,
  }
}

/** Ease-in-out cubic — gentle launch and arrival. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
}

export function ParticleLayer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number | null>(null)
  const dprRef = useRef<number>(1)

  // Mount: size the canvas, attach resize observer.
  useEffect(() => {
    const cnv = canvasRef.current
    if (!cnv) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      dprRef.current = dpr
      const w = window.innerWidth
      const h = window.innerHeight
      cnv.width = Math.floor(w * dpr)
      cnv.height = Math.floor(h * dpr)
      cnv.style.width = `${w}px`
      cnv.style.height = `${h}px`
    }
    resize()
    window.addEventListener("resize", resize)
    return () => {
      window.removeEventListener("resize", resize)
    }
  }, [])

  // Animation loop. Starts on demand; ends itself when no particles remain.
  const ensureLoop = () => {
    if (rafRef.current != null) return
    const cnv = canvasRef.current
    if (!cnv) return
    const ctx = cnv.getContext("2d")
    if (!ctx) return
    const step = () => {
      const dpr = dprRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cnv.width / dpr, cnv.height / dpr)
      const now = performance.now()
      const alive: Particle[] = []
      for (const p of particlesRef.current) {
        const tRaw = (now - p.bornAt - p.startOffsetMs) / p.durationMs
        if (tRaw >= 1) continue
        if (tRaw < 0) {
          alive.push(p)
          continue
        }
        const t = easeInOut(tRaw)
        const pos = curve(p.p0, p.cp, p.p1, t)
        // Alpha fades in over the first 15% and out over the last 30% for a
        // soft tail. Peak alpha 0.75 keeps the layer subtle.
        const fadeIn = Math.min(1, tRaw / 0.15)
        const fadeOut = 1 - Math.max(0, (tRaw - 0.7) / 0.3)
        const alpha = 0.75 * fadeIn * fadeOut
        // Glow + core.
        ctx.shadowColor = `rgba(${p.r},${p.g},${p.b},${alpha})`
        ctx.shadowBlur = 8
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, p.radius, 0, Math.PI * 2)
        ctx.fill()
        alive.push(p)
      }
      ctx.shadowBlur = 0
      particlesRef.current = alive
      if (alive.length === 0) {
        rafRef.current = null
        return
      }
      rafRef.current = window.requestAnimationFrame(step)
    }
    rafRef.current = window.requestAnimationFrame(step)
  }

  const emit = (
    from: Point | null,
    to: Point | null,
    rgb: [number, number, number],
    burst: number,
    durationMs: number,
  ) => {
    if (!from || !to) return
    if (isReducedMotion()) return
    const now = performance.now()
    for (let i = 0; i < burst; i++) {
      // Particles share endpoints but each gets its own control point + delay
      // for a staggered, slightly chaotic stream.
      const p = makeParticle(from, to, rgb, now, {
        staggerMs: i * 35,
        durationMs,
        radius: 1.4 + Math.random() * 0.8,
      })
      particlesRef.current.push(p)
    }
    if (particlesRef.current.length > MAX_ALIVE) {
      particlesRef.current.splice(0, particlesRef.current.length - MAX_ALIVE)
    }
    ensureLoop()
  }

  /** Resolve an anchor that may not exist *yet* — when `tool-call` fires
   *  React has scheduled the ToolCard but hasn't flushed it to the DOM
   *  on this microtask. Try now, then on each of the next few animation
   *  frames; give up after maxFrames and let `fallback` take over. */
  const resolveAnchorDeferred = (
    name: string,
    fallback: string,
    mobile: boolean,
    maxFrames: number,
    cb: (point: Point | null) => void,
  ) => {
    const tryOnce = (framesLeft: number) => {
      const hit = resolveAnchor(name, mobile)
      if (hit) {
        cb(hit)
        return
      }
      if (framesLeft <= 0) {
        cb(resolveAnchor(fallback, mobile))
        return
      }
      window.requestAnimationFrame(() => tryOnce(framesLeft - 1))
    }
    tryOnce(maxFrames)
  }

  // tool-call → outflow from source row to the specific tool card.
  useDemoEventListener("tool-call", (e) => {
    const mobile = isMobile()
    const burst = mobile ? MOBILE_BURST : DESKTOP_BURST
    const from = mobile
      ? resolveAnchor("edge:left", true)
      : resolveAnchor(pickDesktopSource(e.attributionKey, e.kind), false)
    const rgb = readCssRgb("--teal-300", [125, 211, 192])
    if (mobile) {
      const to = resolveAnchor("edge:center", true)
      emit(from, to, rgb, burst, 820)
      return
    }
    // Target the specific tool card by toolUseId — fall back to the agent
    // panel center if the card hasn't rendered after a few frames.
    const target = e.toolUseId ? `tool:${e.toolUseId}` : "agent"
    resolveAnchorDeferred(target, "agent", false, 3, (to) => emit(from, to, rgb, burst, 820))
  })

  // tool-result → inflow from the specific tool card to royalties. Drop errors.
  useDemoEventListener("tool-result", (e) => {
    if (e.isError) return
    // brick: settles are backend reconciliations that fire AFTER the per-call
    // result already triggered the animation. Don't double-emit.
    if (e.toolUseId?.startsWith("brick:")) return
    const mobile = isMobile()
    const burst = mobile ? MOBILE_BURST : DESKTOP_BURST
    const rgb = readCssRgb("--teal-100", [186, 230, 220])
    if (mobile) {
      const from = resolveAnchor("edge:center", true)
      const to = resolveAnchor("edge:right", true)
      emit(from, to, rgb, burst, 880)
      return
    }
    const to = resolveAnchor("royalties", false)
    const sourceAnchor = e.toolUseId ? `tool:${e.toolUseId}` : "agent"
    resolveAnchorDeferred(sourceAnchor, "agent", false, 3, (from) =>
      emit(from, to, rgb, burst, 880),
    )
  })

  // Reset: fade by truncating birth times so all particles complete fast.
  useDemoEventListener("reset-chat", () => {
    const now = performance.now()
    for (const p of particlesRef.current) {
      // Force remaining lifetime to ≤ 180ms.
      const elapsed = now - p.bornAt - p.startOffsetMs
      const remaining = p.durationMs - Math.max(0, elapsed)
      if (remaining > 180) {
        p.durationMs = Math.max(0, elapsed) + 180
      }
    }
  })

  // Teardown: cancel RAF on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 50,
      }}
    />
  )
}
