import type { PolicyUser } from "@/lib/bouncer"
import type { DatasetSelect } from "./schema"

export class DatasetPolicy {
  constructor(private user: PolicyUser) {}

  /**
   * Admin bypass — returning `true` short-circuits all action checks.
   * Returning `undefined` falls through to the specific action method.
   *
   * better-auth does not expose an `isAdmin` field by default; if a custom
   * session extension adds it, cast `this.user` to the extended type here.
   * For now this always falls through.
   */
  before(_user: PolicyUser): boolean | undefined {
    return undefined
  }

  view(dataset: DatasetSelect): boolean {
    return dataset.userId === this.user.id || dataset.isPublic
  }

  /** Any authenticated user may create a dataset. */
  create(): boolean {
    return true
  }

  edit(dataset: DatasetSelect): boolean {
    return dataset.userId === this.user.id
  }

  delete(dataset: DatasetSelect): boolean {
    return dataset.userId === this.user.id
  }

  /**
   * Custom action: determines whether the user may attach this dataset to an
   * agent. Only the dataset owner may trigger the corpus-subagent orchestration.
   */
  attach(dataset: DatasetSelect): boolean {
    return dataset.userId === this.user.id
  }
}
