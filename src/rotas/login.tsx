import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { StateCore } from "#/components/eve/panels.tsx"
import { getAuthState } from "#/lib/auth.functions.ts"

export type PanelIntent = "oficina" | "seguranca"

interface LoginSearch {
  next?: string
  painel?: PanelIntent
}

function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/"
  if (!value.startsWith("/") || value.startsWith("//")) return "/"
  return value
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const painel = search.painel
    return {
      next: safeNext(search.next),
      painel: painel === "oficina" || painel === "seguranca" ? painel : undefined,
    }
  },
  loader: async () => await getAuthState(),
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const { user, hasAccount } = Route.useLoaderData()
  const { next, painel } = Route.useSearch()

  const [account, setAccount] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const creating = !hasAccount

  useEffect(() => {
    if (!user) return
    void router.navigate({
      to: safeNext(next),
      search: painel ? { painel } : {},
      replace: true,
    })
  }, [user, router, next, painel])

  async function submit() {
    if (busy) return
    if (creating && password !== confirm) {
      setMessage("As duas senhas precisam ser iguais.")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(
        creating ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account, password }),
        },
      )
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null
      if (!response.ok) {
        setMessage(payload?.message ?? "Não foi possível entrar.")
        return
      }
      await router.invalidate()
      await router.navigate({
        to: safeNext(next),
        search: painel ? { painel } : {},
        replace: true,
      })
    } catch {
      setMessage("Sem resposta do servidor. Tente de novo.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12 text-foreground">
      <section className="w-full max-w-md">
        <div className="flex items-center gap-3">
          <StateCore status="idle" size="sm" />
          <div>
            <p className="font-display text-[16px] font-semibold tracking-[0.16em]">
              E.V.E.
            </p>
            <p className="font-mono text-[9.5px] tracking-[0.2em] text-eve-dim">
              {creating ? "CREDENCIAL DE ADMINISTRADOR" : "ÁREA RESTRITA"}
            </p>
          </div>
        </div>

        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">
          {creating ? "Criar a credencial de administrador" : "Entrar como administrador"}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-eve-dim">
          {creating
            ? "Esta é a única credencial com acesso à oficina de autoinspeção e ao registro de acessos. Depois de criada, o cadastro fica fechado."
            : "A oficina de autoinspeção e a vigilância de acessos só abrem com esta credencial. Cada tentativa fica registrada."}
        </p>

        <div className="mt-6 space-y-3 rounded-sm border border-eve-hair bg-eve-panel-2/40 p-4">
          <label className="block">
            <span className="font-mono text-[9.5px] tracking-[0.2em] text-eve-dim uppercase">
              Conta (e-mail)
            </span>
            <input
              type="email"
              autoComplete="username"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              className="mt-1.5 w-full rounded-sm border border-eve-hair bg-background px-2.5 py-2 text-[13px] outline-none focus:border-eve-signal/60"
            />
          </label>

          <label className="block">
            <span className="font-mono text-[9.5px] tracking-[0.2em] text-eve-dim uppercase">
              Senha
            </span>
            <input
              type="password"
              autoComplete={creating ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !creating) submit()
              }}
              className="mt-1.5 w-full rounded-sm border border-eve-hair bg-background px-2.5 py-2 text-[13px] outline-none focus:border-eve-signal/60"
            />
          </label>

          {creating && (
            <label className="block">
              <span className="font-mono text-[9.5px] tracking-[0.2em] text-eve-dim uppercase">
                Repetir senha
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit()
                }}
                className="mt-1.5 w-full rounded-sm border border-eve-hair bg-background px-2.5 py-2 text-[13px] outline-none focus:border-eve-signal/60"
              />
            </label>
          )}

          {creating && (
            <p className="font-mono text-[10px] leading-relaxed text-eve-dim">
              MÍNIMO DE 8 CARACTERES, COM LETRAS E NÚMEROS.
            </p>
          )}

          {message && (
            <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[12px] text-destructive">
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !account.trim() || !password}
            className="w-full rounded-sm bg-eve-signal px-3 py-2.5 font-mono text-[11px] tracking-[0.16em] text-primary-foreground disabled:opacity-35"
          >
            {busy ? "VERIFICANDO…" : creating ? "CRIAR E ENTRAR" : "ENTRAR"}
          </button>
        </div>

        <a
          href="/"
          className="mt-4 inline-block font-mono text-[10px] tracking-[0.16em] text-eve-dim hover:text-foreground"
        >
          VOLTAR AO CONSOLE
        </a>
      </section>
    </main>
  )
}
