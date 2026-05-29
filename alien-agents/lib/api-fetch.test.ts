import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"

// `apiUrl` reads `process.env.NEXT_PUBLIC_BASE_PATH` at module import time.
// To exercise different basePaths in the same test run we reset the module
// cache between blocks.

describe("apiUrl with basePath = /agents", () => {
  let apiUrl: (path: string) => string
  const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH

  beforeEach(async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/agents"
    vi.resetModules()
    const mod = await import("./api-fetch")
    apiUrl = mod.apiUrl
  })

  afterEach(() => {
    if (originalBasePath === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH
    else process.env.NEXT_PUBLIC_BASE_PATH = originalBasePath
  })

  it("prepends basePath to API paths", () => {
    expect(apiUrl("/api/agents")).toBe("/agents/api/agents")
  })

  it("returns absolute URLs unchanged", () => {
    expect(apiUrl("https://example.com/api")).toBe("https://example.com/api")
    expect(apiUrl("http://example.com/api")).toBe("http://example.com/api")
  })

  it("returns protocol-relative URLs unchanged", () => {
    expect(apiUrl("//example.com/api")).toBe("//example.com/api")
  })

  it("throws for paths that don't start with /", () => {
    expect(() => apiUrl("api/agents")).toThrow(/must start with/)
  })
})

describe("apiUrl with empty basePath", () => {
  let apiUrl: (path: string) => string
  const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH

  beforeEach(async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = ""
    vi.resetModules()
    const mod = await import("./api-fetch")
    apiUrl = mod.apiUrl
  })

  afterEach(() => {
    if (originalBasePath === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH
    else process.env.NEXT_PUBLIC_BASE_PATH = originalBasePath
  })

  it("returns the path unchanged", () => {
    expect(apiUrl("/api/foo")).toBe("/api/foo")
  })
})
