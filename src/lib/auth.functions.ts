import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  accessSummary,
  accountCount,
  getCurrentUser,
  listAccessLog,
  noteRestrictedAccess,
  type AccessEntry,
  type AccessSummary,
  type AuthUser,
} from "./auth.server.ts"

/**
 * Ponte RPC entre a interface e o servidor de autenticação. Este arquivo é
 * isomórfico de propósito: só ele pode ser importado pelo navegador.
 */
export type { AccessEntry, AccessSummary, AuthUser } from "./auth.server.ts"

export const getAuthState = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ user: AuthUser | null; hasAccount: boolean }> => {
    const [user, accounts] = await Promise.all([getCurrentUser(), accountCount()])
    return { user, hasAccount: accounts > 0 }
  },
)

/** Usuário da sessão atual para o contexto de rotas. Nunca lança. */
export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthUser | null> => getCurrentUser(),
)

export const getAccessLog = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    authorized: boolean
    entries: AccessEntry[]
    summary: AccessSummary
  }> => {
    const user = await getCurrentUser()
    if (!user) {
      await noteRestrictedAccess("vigilância")
      return {
        authorized: false,
        entries: [],
        summary: { total: 0, failed: 0, blocked: 0, denied: 0, windowHours: 24 },
      }
    }
    const [entries, summary] = await Promise.all([listAccessLog(), accessSummary()])
    return { authorized: true, entries, summary }
  },
)

export const noteAreaAttempt = createServerFn({ method: "POST" })
  .validator(z.object({ area: z.string().min(1).max(60) }))
  .handler(async ({ data }): Promise<{ allowed: boolean }> => ({
    allowed: await noteRestrictedAccess(data.area),
  }))
