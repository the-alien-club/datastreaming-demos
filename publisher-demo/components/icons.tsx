import type { CSSProperties } from "react"

const PATHS: Record<string, string[]> = {
  lock: [
    '<rect x="3.5" y="11" width="17" height="10.5" rx="2.2"/>',
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  ],
  globe: [
    '<circle cx="12" cy="12" r="9"/>',
    '<path d="M3 12h18"/>',
    '<path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18"/>',
  ],
  plug: [
    '<path d="M12 22v-4"/>',
    '<path d="M9 8V2"/>',
    '<path d="M15 8V2"/>',
    '<path d="M18 8v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  ],
  search: ['<circle cx="11" cy="11" r="7"/>', '<path d="m21 21-4.3-4.3"/>'],
  file: [
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>',
    '<path d="M14 2v6h6"/>',
    '<path d="M9 13h6M9 17h6"/>',
  ],
  zap: ['<path d="M13 2 4 13h7l-1 9 9-12h-7l1-8z"/>'],
  network: [
    '<rect x="9" y="2" width="6" height="6" rx="1.2"/>',
    '<rect x="2.5" y="16" width="6" height="6" rx="1.2"/>',
    '<rect x="15.5" y="16" width="6" height="6" rx="1.2"/>',
    '<path d="M12 8v3.5M5.5 16v-2.5h13V16"/>',
  ],
  info: ['<circle cx="12" cy="12" r="9"/>', '<path d="M12 16.5v-5M12 8h.01"/>'],
  chevR: ['<path d="m9 6 6 6-6 6"/>'],
  chevD: ['<path d="m6 9 6 6 6-6"/>'],
  send: ['<path d="M22 2 11 13"/>', '<path d="M22 2 15 22l-4-9-9-4 20-7z"/>'],
  plus: ['<path d="M12 5v14M5 12h14"/>'],
  check: ['<path d="M20 6 9 17l-5-5"/>'],
  activity: ['<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'],
  reset: ['<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/>', '<path d="M3 3v5h5"/>'],
  database: [
    '<ellipse cx="12" cy="5" rx="9" ry="3"/>',
    '<path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
    '<path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  ],
  sliders: [
    '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/>',
    '<path d="M1 14h6M9 8h6M17 16h6"/>',
  ],
  dot: ['<circle cx="12" cy="12" r="4"/>'],
  spark: ['<path d="m12 3 1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6 7 18.2l1.9-5.8L4 8.8h6.1z"/>'],
  cpu: [
    '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    '<path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  ],
  trendUp: ['<path d="M3 17 9 11l4 4 8-8"/>', '<path d="M21 7h-5M21 7v5"/>'],
  x: ['<path d="M18 6 6 18M6 6l12 12"/>'],
  gear: [
    '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/>',
    '<circle cx="12" cy="12" r="3"/>',
  ],
}

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 16,
  className = "",
  strokeWidth = 1.7,
  style,
}: {
  name: IconName | string
  size?: number
  className?: string
  strokeWidth?: number
  style?: CSSProperties
}) {
  const d = PATHS[name] ?? []
  return (
    <svg
      className={`icn ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static path strings
      dangerouslySetInnerHTML={{ __html: d.join("") }}
    />
  )
}
