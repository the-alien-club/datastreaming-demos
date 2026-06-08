"use client"

import { type ReactNode, useEffect, useRef, useState } from "react"
import { Icon } from "./icons"

function RollingDigit({ char }: { char: string }) {
  const [roll, setRoll] = useState(false)
  const prev = useRef(char)
  useEffect(() => {
    if (prev.current !== char) {
      setRoll(false)
      const r = requestAnimationFrame(() => setRoll(true))
      const id = setTimeout(() => setRoll(false), 300)
      prev.current = char
      return () => {
        cancelAnimationFrame(r)
        clearTimeout(id)
      }
    }
  }, [char])
  return (
    <span className={`odo${roll ? " rolling" : ""}`}>
      <span className="roll" key={char}>
        {char}
      </span>
    </span>
  )
}

export function RollingText({ text }: { text: string | number }) {
  return (
    <span className="num">
      {[...String(text)].map((c, i) =>
        /\d/.test(c) ? <RollingDigit key={i} char={c} /> : <span key={i}>{c}</span>,
      )}
    </span>
  )
}

export function BumpNum({ display }: { display: string }) {
  const [bump, setBump] = useState(false)
  const prev = useRef(display)
  useEffect(() => {
    if (prev.current !== display) {
      setBump(false)
      const r = requestAnimationFrame(() => setBump(true))
      const id = setTimeout(() => setBump(false), 320)
      prev.current = display
      return () => {
        cancelAnimationFrame(r)
        clearTimeout(id)
      }
    }
  }, [display])
  return <span className={`num${bump ? " bump" : ""}`}>{display}</span>
}

export function Sparkline({ values, fresh }: { values: number[]; fresh?: boolean }) {
  const max = Math.max(4, ...values)
  return (
    <div className="sparkline">
      {values.map((v, i) => {
        const last = i === values.length - 1
        const cls = `bar${v === 0 ? " empty" : ""}${last && fresh && v > 0 ? " fresh" : ""}`
        return (
          <div
            key={(fresh ? "f" : "n") + i}
            className={cls}
            style={{ height: `${Math.max(2, (v / max) * 18)}px` }}
          />
        )
      })}
    </div>
  )
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-btn">
      <Icon name="info" size={14} />
      <span className="tip">{text}</span>
    </span>
  )
}

export function StatusDot({ status }: { status: string }) {
  return <span className={`status-dot ${status}`} title={status} />
}

export function AuthBadge({ auth }: { auth: string }) {
  return (
    <span className="ds-badge ds-badge--success ds-badge--sm">
      <Icon name="check" size={9} strokeWidth={2.6} />
      {auth}
    </span>
  )
}

export function DsButton({
  variant = "primary",
  size = "default",
  onClick,
  children,
  className = "",
}: {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link"
  size?: "default" | "sm" | "lg" | "icon"
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  const classes = [
    "ds-btn",
    `ds-btn--${variant}`,
    size !== "default" ? `ds-btn--${size}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ")
  return (
    <button type="button" className={classes} onClick={onClick}>
      {children}
    </button>
  )
}
