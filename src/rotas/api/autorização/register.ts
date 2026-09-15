import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"

import {
  accountCount,
  createAdmin,
  createSession,
  hashPassword,
  isEmail,
  normalizeAccount,
  passwordProblem,
  recordAttempt,
  sessionCookie,
} from "#/lib/auth.server.ts"

const SESSION_SECONDS = 7 * 24 * 60 * 60

function failure(status: number, code: string, message: string) {
  return Response.json(
    { code, message },
    { status, headers: { "Cache-Control": "no-store" } },
  )
}

/**
 * Cadastro fechado: existe uma única credencial de administrador e ela só pode
 * ser criada enquanto nenhuma conta existir. Depois disso, a porta se fecha.
 */
export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown
        try {
          payload = await request.json()
        } catch {
          return failure(400, "INVALID_INPUT", "Pedido ilegível.")
        }

        const body = (payload ?? {}) as { account?: unknown; password?: unknown }
        if (typeof body.account !== "string" || typeof body.password !== "string") {
          return failure(400, "INVALID_INPUT", "Informe conta e senha.")
        }

        const account = normalizeAccount(body.account)
        if (!isEmail(account)) {
          return failure(400, "INVALID_INPUT", "Use um e-mail válido como conta.")
        }
        const problem = passwordProblem(body.password)
        if (problem) return failure(400, "INVALID_INPUT", problem)

        if ((await accountCount()) > 0) {
          await recordAttempt({
            kind: "restricted_denied",
            account,
            area: "cadastro",
            detail: "Tentativa de criar conta com o cadastro já fechado.",
          })
          return failure(
            403,
            "REGISTRATION_CLOSED",
            "Já existe uma credencial de administrador.",
          )
        }

        const passwordHash = await hashPassword(body.password)
        const user = await createAdmin(account, passwordHash)
        const token = await createSession(user.id)
        await recordAttempt({
          kind: "login_ok",
          account,
          detail: "Credencial de administrador criada.",
        })

        return Response.json(
          { user: { id: user.id, email: user.email, displayName: user.displayName } },
          {
            status: 201,
            headers: {
              "Cache-Control": "no-store",
              "Set-Cookie": sessionCookie(token, SESSION_SECONDS),
            },
          },
        )
      },
    },
  },
})
