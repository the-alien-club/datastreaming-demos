import type { PolicyUser } from "@/lib/bouncer"
import type { ConversationSelect } from "./schema"

export class ConversationPolicy {
  constructor(private user: PolicyUser) {}

  /**
   * Admin bypass — returning `true` short-circuits every action method.
   * Returns `undefined` to fall through to the specific action check.
   */
  before(_user: PolicyUser): boolean | undefined {
    return undefined
  }

  /**
   * Only the owner may view a conversation.
   */
  view(conversation: ConversationSelect): boolean {
    return conversation.userId === this.user.id
  }

  /**
   * Only the owner may delete a conversation.
   */
  delete(conversation: ConversationSelect): boolean {
    return conversation.userId === this.user.id
  }
}
