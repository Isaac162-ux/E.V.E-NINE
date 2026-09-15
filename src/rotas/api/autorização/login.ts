import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"

import {
  createSession,
  findUserByAccount,
  isEmail,
  loginThrottled,
  normalizeAccount,
  recordAttempt,
  sessionCookie,
  verifyPassword,
} from "#/lib/auth.server.ts"

const SESSION_SECONDS = 7 * 24 * 60 * 60

/** Hash de forma válida usado só para igualar o custo quando a conta não existe. */
const DUMMY_HASH = `pbkdf2-sha256$150000$AAAAAAAAAAAAAAAAAAAAAA$${"A".repeat(43)}`

function failure(status: number, code: string, message: string) {
  return Response.json(
    { code, message },
    { status, headers: { "Cache-Control": "no-store" } },
  )
}

/**
 * Entrada do administrador. Conta desconhecida e senha errada respondem
 * exatamente a mesma coisa, e cada tentativa entra no registro de acessos.
 */
export const Route = createFileRoute("/api/auth/login")({
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
        const password = body.password

        if (await loginThrottled(account)) {
          await recordAttempt({
            kind: "login_blocked",
            account,
            detail: "Excesso de tentativas na janela de vigilância.",
          })
          return failure(
            429,
            "TOO_MANY_ATTEMPTS",
            "Muitas tentativas. Aguarde alguns minutos.",
          )
        }

        const user = isEmail(account) ? await findUserByAccount(account) : null
        const valid =
          (await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)) &&
          Boolean(user) &&
          user?.status === "active"

        if (!valid || !user) {
          await recordAttempt({
            kind: "login_failed",
            account,
            detail: "Credenciais inválidas.",
          })
          return failure(401, "INVALID_CREDENTIALS", "Conta ou senha incorretos.")
        }

        const token = await createSession(user.id)
        await recordAttempt({
          kind: "login_ok",
          account,
          detail: "Entrada autorizada.",
        })

        const headers = new Headers({
          "Cache-Control": "no-store",
          "Set-Cookie": sessionCookie(token, SESSION_SECONDS),
        })
        return Response.json(
          {
            user: {
              id: user.id,
              email: user.email,
              displayName: user.email.split("@")[0],
            },
          },
          { status: 200, headers },
        )
      },
    },
  },
})
