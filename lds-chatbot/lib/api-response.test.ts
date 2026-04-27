import { describe, expect, it } from "vitest"
import {
  badRequest,
  conflict,
  err,
  notFound,
  ok,
  unauthorized,
  unprocessable,
} from "./api-response"

async function readJson(r: Response): Promise<unknown> {
  return await r.json()
}

describe("ok", () => {
  it("returns 200 with the bare body by default", async () => {
    const r = ok({ id: 1, name: "x" })
    expect(r.status).toBe(200)
    expect(await readJson(r)).toEqual({ id: 1, name: "x" })
  })

  it("accepts a numeric status as the second arg", async () => {
    const r = ok({ id: 1 }, 201)
    expect(r.status).toBe(201)
  })

  it("accepts a ResponseInit object", async () => {
    const r = ok({ id: 1 }, { status: 202, headers: { "x-test": "1" } })
    expect(r.status).toBe(202)
    expect(r.headers.get("x-test")).toBe("1")
  })
})

describe("err helpers", () => {
  it("err returns { error: <message> } at the requested status", async () => {
    const r = err("nope", 418)
    expect(r.status).toBe(418)
    expect(await readJson(r)).toEqual({ error: "nope" })
  })

  it("err attaches issues when provided", async () => {
    const r = err("bad", 422, { fieldErrors: { name: ["required"] } })
    expect(await readJson(r)).toEqual({
      error: "bad",
      issues: { fieldErrors: { name: ["required"] } },
    })
  })

  it("typed helpers map to the right status codes", () => {
    expect(unauthorized().status).toBe(401)
    expect(notFound().status).toBe(404)
    expect(badRequest().status).toBe(400)
    expect(unprocessable("nope").status).toBe(422)
    expect(conflict("dup").status).toBe(409)
  })
})
