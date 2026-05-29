import { Prisma } from "@/lib/generated/prisma/client"

// ─── Query shapes ──────────────────────────────────────────────────────────────
//
// Prisma v7 no longer ships `Prisma.validator` in the generated client.
// `satisfies` achieves the same goal: the object literal is constrained to a
// valid `SpecialistDefaultArgs` shape, literal types are preserved, and
// `SpecialistGetPayload<typeof shape>` derives an accurate TypeScript type.

// Plain specialist row. Used by policies and every query that returns a
// specialist record. No relations are included — the Specialist model has no
// outbound relations used by the application beyond the User FK.
export const specialistRow = {
  select: {
    id: true,
    userId: true,
    name: true,
    description: true,
    systemPrompt: true,
    model: true,
    mcpIds: true,
    isPublic: true,
    isForkable: true,
    createdAt: true,
    updatedAt: true,
  },
} satisfies Prisma.SpecialistDefaultArgs
export type Specialist = Prisma.SpecialistGetPayload<typeof specialistRow>
