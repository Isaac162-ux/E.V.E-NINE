import { useEffect, useRef, useState } from "react"

import { listEveSource, readEveSource } from "#/lib/eve/self.functions.ts"
import { streamEve } from "#/lib/eve/client.ts"
import {
  type EveProposal,
  type VerifyOutcome,
  makeProposal,
  readProposals,
  verifyProposal,
} from "#/lib/eve/workshop.ts"
import type { EveSourceEntry, EveSourceFile } from "#/lib/eve/self.server.ts"
import type { EveConversation } from "#/hooks/use-eve.ts"

const FULL_REVIEW_GOAL =
  "Faça uma autoinspeção completa: percorra o manifesto, escolha as duas melhorias de maior impacto para a experiência do usuário e proponha a de maior valor agora."

function languageOf(path: string): string {
  if (path.endsWith(".css")) return "css"
  if (path.endsWith(".json")) return "json"
  return "tsx"
}

function verdictTone(verdict: string): string {
  if (verdict === "aprovado") return "text-eve-ok border-eve-ok/40 bg-eve-ok/8"
  if (verdict === "reprovado")
    return "text-destructive border-destructive/40 bg-destructive/8"
  return "text-eve-amber border-eve-amber/40 bg-eve-amber/8"
}

function checkTone(status: string): string {
  if (status === "ok") return "text-eve-ok"
  if (status === "falha") return "text-destructive"
  return "text-eve-amber"
}

function checkMark(status: string): string {
  if (status === "ok") return "OK"
  if (status === "falha") return "FALHA"
  return "ATENÇÃO"
}

export function Workshop({
  open,
  onClose,
  onRequireAuth,
  eve,
}: {
  open: boolean
  onClose: () => void
  onRequireAuth: () => void
  eve: EveConversation
}) {
  const [files, setFiles] = useState<EveSourceEntry[]>([])
  const [denied, setDenied] = useState(false)
  const [query, setQuery] = useState("")
  const [activePath, setActivePath] = useState<string | null>(null)
  const [file, setFile] = useState<EveSourceFile | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [review, setReview] = useState("")
  const [reviewing, setReviewing] = useState(false)
  const [goal, setGoal] = useState("")
  const [openProposal, setOpenProposal] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const contentCache = useRef<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open || files.length > 0) return
    let active = true
    void listEveSource().then(
      (result) => {
        if (!active) return
        if (!result.authorized) {
          setDenied(true)
          onRequireAuth()
          return
        }
        setDenied(false)
        setFiles(result.files)
      },
      () => {
        if (active) setNotice("Não consegui abrir o espelho do código.")
      },
    )
    return () => {
      active = false
    }
  }, [open, files.length, onRequireAuth])

  useEffect(() => {
    if (!activePath) return
    let active = true
    void readEveSource({ data: activePath }).then(
      (result) => {
        if (!active) return
        if (!result.authorized) {
          setDenied(true)
          setLoadingFile(false)
          onRequireAuth()
          return
        }
        const loaded = result.file
        setDenied(false)
        setFile(loaded)
        setLoadingFile(false)
        if (loaded) contentCache.current[loaded.path] = loaded.content
      },
      () => {
        if (!active) return
        setLoadingFile(false)
        setNotice("Não consegui ler esse arquivo.")
      },
    )
    return () => {
      active = false
    }
  }, [activePath, onRequireAuth])

  if (!open) return null

  function openFile(path: string) {
    setActivePath(path)
    setLoadingFile(true)
    setNotice(null)
  }

  async function contentOf(path: string): Promise<string | null> {
    const cached = contentCache.current[path]
    if (cached !== undefined) return cached
    const result = await readEveSource({ data: path })
    if (!result.authorized) {
      setDenied(true)
      onRequireAuth()
      return null
    }
    const loaded = result.file
    if (!loaded) return null
    contentCache.current[loaded.path] = loaded.content
    return loaded.content
  }

  async function ask(instruction: string, withFile: boolean) {
    if (reviewing) return

    let context = ""
    if (withFile && file) {
      context = `ARQUIVO ${file.path} (${file.lines} linhas)\n\n\`\`\`${languageOf(file.path)}\n${file.content}\n\`\`\`\n\n`
    } else {
      const manifest = files
        .map((entry) => `${entry.path} (${entry.lines} linhas)`)
        .join("\n")
      context = `MANIFESTO COMPLETO DOS MEUS ARQUIVOS\n\n${manifest}\n\n`
    }

    const controller = new AbortController()
    abortRef.current = controller
    setReview("")
    setReviewing(true)
    setNotice(null)

    try {
      const result = await streamEve(
        {
          turns: [{ role: "user", text: `${context}${instruction}` }],
          facts: eve.facts.map((fact) => fact.text),
          autonomy: "A0–A1 (conversa, leitura e proposta)",
          signal: controller.signal,
        },
        { onDelta: (chunk) => setReview((previous) => previous + chunk) },
      )

      const parsed = readProposals(result.text)
      setReview(parsed.text)
      const created = parsed.proposals.map((proposal) =>
        makeProposal(proposal, "oficina"),
      )
      for (const proposal of created) {
        await contentOf(proposal.file)
      }
      if (created.length > 0) {
        eve.addProposals(created)
        setOpenProposal(created[0].id)
        setNotice(
          `${created.length} proposta(s) na bancada. Rode os testes antes de aprovar.`,
        )
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setNotice(
          cause instanceof Error ? cause.message : "A leitura falhou.",
        )
      }
    } finally {
      abortRef.current = null
      setReviewing(false)
    }
  }

  async function runTests(proposal: EveProposal) {
    const original = await contentOf(proposal.file)
    if (original === null) {
      eve.recordProposalRun(proposal.id, "reprovado", [
        {
          id: "arquivo",
          label: "Arquivo existe no espelho do código",
          status: "falha",
          detail: `${proposal.file} não está no espelho.`,
        },
      ])
      setNotice("A proposta aponta para um arquivo que não existe.")
      return
    }

    const outcome: VerifyOutcome = verifyProposal({
      proposal,
      original,
      files,
    })
    eve.recordProposalRun(proposal.id, outcome.verdict, outcome.checks)
    setNotice(
      outcome.verdict === "aprovado"
        ? "Testes passaram. Pode aprovar a implementação."
        : outcome.verdict === "atencao"
          ? "Testes passaram com observações. Revise os avisos."
          : "Testes reprovaram a proposta. Nada foi alterado.",
    )
  }

  const filtered = files.filter((entry) =>
    query.trim() ? entry.path.toLowerCase().includes(query.trim().toLowerCase()) : true,
  )
  const groups = [...new Set(filtered.map((entry) => entry.group))]
  const sortedProposals = [...eve.proposals].sort((a, b) => b.createdAt - a.createdAt)

  if (denied && files.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
        <section className="w-full max-w-sm rounded-sm border border-eve-amber/40 bg-eve-panel p-5">
          <p className="font-mono text-[10px] tracking-[0.2em] text-eve-amber">
            ÁREA RESTRITA
          </p>
          <h2 className="mt-2 font-display text-lg font-semibold tracking-tight text-foreground">
            A oficina exige credencial de administrador
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-eve-dim">
            Esta tentativa ficou registrada na vigilância de acessos.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-sm border border-eve-hair px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-eve-dim hover:text-foreground"
          >
            VOLTAR
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-eve-hair px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-semibold tracking-[0.14em] text-foreground">
            OFICINA DE AUTOINSPEÇÃO
          </h2>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.16em] text-eve-dim">
            {files.length} ARQUIVOS NO ESPELHO · {sortedProposals.length} PROPOSTA(S)
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNotice(null)
            void ask(FULL_REVIEW_GOAL, false)
          }}
          disabled={reviewing}
          className="rounded-sm border border-eve-signal/45 bg-eve-signal/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-eve-signal disabled:opacity-40"
        >
          AUTOINSPEÇÃO COMPLETA
        </button>
        <button
          type="button"
          onClick={() => {
            abortRef.current?.abort()
            onClose()
          }}
          className="rounded-sm border border-eve-hair px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-eve-dim hover:text-foreground"
        >
          FECHAR
        </button>
      </header>

      {notice && (
        <div className="shrink-0 border-b border-eve-hair bg-eve-panel-2/50 px-4 py-2">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-eve-dim">
            {notice}
          </p>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[250px_1fr_380px] lg:overflow-hidden">
        <section className="flex min-h-0 flex-col border-b border-eve-hair lg:border-r lg:border-b-0">
          <div className="shrink-0 border-b border-eve-hair px-4 py-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrar arquivos"
              className="w-full rounded-sm border border-eve-hair bg-background px-2.5 py-1.5 text-[12px] text-foreground outline-none placeholder:text-eve-dim focus:border-eve-signal/60"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 lg:max-h-none">
            {groups.map((group) => (
              <div key={group} className="mb-3">
                <p className="px-2 font-mono text-[9.5px] tracking-[0.2em] text-eve-dim uppercase">
                  {group}
                </p>
                <ul className="mt-1">
                  {filtered
                    .filter((entry) => entry.group === group)
                    .map((entry) => {
                      const active = entry.path === activePath
                      const shortName = entry.path.split("/").slice(-1)[0]
                      return (
                        <li key={entry.path}>
                          <button
                            type="button"
                            onClick={() => openFile(entry.path)}
                            className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left ${
                              active
                                ? "bg-eve-signal/10 text-foreground"
                                : "text-foreground/75 hover:bg-eve-panel-2"
                            }`}
                          >
                            <span className="min-w-0 truncate font-mono text-[11.5px]">
                              {shortName}
                            </span>
                            <span className="shrink-0 font-mono text-[9.5px] text-eve-dim">
                              {entry.lines}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-0 flex-col border-b border-eve-hair lg:border-b-0">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-eve-hair px-4 py-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-eve-dim">
              {file ? `${file.path} · ${file.lines} linhas` : "Selecione um arquivo"}
            </span>
            <button
              type="button"
              onClick={() => void ask("Leia este arquivo e explique em poucas linhas o que ele faz, quais riscos você vê e o que melhoraria. Não proponha patch agora.", true)}
              disabled={!file || reviewing}
              className="rounded-sm border border-eve-hair px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-eve-dim hover:border-eve-signal/50 hover:text-foreground disabled:opacity-40"
            >
              LER COM A E.V.E.
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-eve-hair px-4 py-2.5">
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Objetivo da melhoria neste arquivo"
              className="min-w-[180px] flex-1 rounded-sm border border-eve-hair bg-background px-2.5 py-1.5 text-[12px] text-foreground outline-none placeholder:text-eve-dim focus:border-eve-signal/60"
            />
            <button
              type="button"
              onClick={() => {
                const objective =
                  goal.trim() ||
                  "melhorar clareza, robustez e desempenho sem quebrar nada"
                void ask(
                  `Proponha uma alteração concreta neste arquivo para ${objective}. Entregue um bloco eve-propose com o patch unificado.`,
                  true,
                )
              }}
              disabled={!file || reviewing}
              className="rounded-sm border border-eve-signal/45 bg-eve-signal/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-eve-signal disabled:opacity-40"
            >
              PROPOR MELHORIA
            </button>
          </div>

          {reviewing && (
            <div className="shrink-0 border-b border-eve-hair bg-eve-panel-2/40 px-4 py-2">
              <p className="flex items-center gap-2 font-mono text-[10.5px] text-eve-dim">
                <span className="eve-core-pulse size-1.5 rounded-full bg-eve-signal" />
                E.V.E. lendo o próprio código…
              </p>
            </div>
          )}

          {review.length > 0 && (
            <div className="shrink-0 max-h-56 overflow-y-auto border-b border-eve-hair px-4 py-3">
              <p className="font-mono text-[9.5px] tracking-[0.2em] text-eve-signal">
                PARECER DA E.V.E.
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed whitespace-pre-wrap text-foreground/85">
                {review}
              </p>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto bg-eve-panel-2/20 px-4 py-3">
            {loadingFile ? (
              <p className="font-mono text-[11px] text-eve-dim">Carregando…</p>
            ) : file ? (
              <div className="min-w-max">
                {file.content.split("\n").map((line, index) => (
                  <div key={index} className="flex">
                    <span className="w-11 shrink-0 pr-3 text-right font-mono text-[10px] text-eve-dim select-none">
                      {index + 1}
                    </span>
                    <span className="font-mono text-[11.5px] whitespace-pre text-foreground/85">
                      {line || " "}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-eve-dim">
                Escolha um arquivo à esquerda para ler, pedir um parecer ou
                solicitar uma melhoria. Nenhuma alteração acontece sem passar
                pela bancada e pela sua aprovação.
              </p>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col lg:border-l lg:border-eve-hair">
          <div className="shrink-0 border-b border-eve-hair px-4 py-3">
            <p className="font-mono text-[9.5px] tracking-[0.2em] text-eve-dim uppercase">
              Bancada de testes e propostas
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {sortedProposals.length === 0 && (
              <p className="px-1 text-[12px] leading-relaxed text-eve-dim">
                Nenhuma proposta ainda. Peça uma leitura ou uma melhoria e a
                proposta aparece aqui para ser testada.
              </p>
            )}

            {sortedProposals.map((proposal) => {
              const expanded = openProposal === proposal.id
              const run = proposal.lastRun
              return (
                <article
                  key={proposal.id}
                  className="mb-2 rounded-sm border border-eve-hair bg-eve-panel-2/40"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenProposal(expanded ? null : proposal.id)
                    }
                    className="w-full px-3 py-2.5 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12.5px] leading-snug text-foreground">
                        {proposal.title}
                      </span>
                      <span
                        className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] ${
                          proposal.status === "aprovada"
                            ? "border-eve-ok/40 text-eve-ok"
                            : proposal.status === "rejeitada"
                              ? "border-destructive/40 text-destructive"
                              : "border-eve-hair text-eve-dim"
                        }`}
                      >
                        {proposal.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-eve-dim">
                      {proposal.file} · risco {proposal.risk}
                    </p>
                    {run && (
                      <p
                        className={`mt-1.5 inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] ${verdictTone(run.verdict)}`}
                      >
                        BANCADA: {run.verdict.toUpperCase()}
                      </p>
                    )}
                  </button>

                  {expanded && (
                    <div className="border-t border-eve-hair px-3 py-3">
                      {proposal.rationale && (
                        <p className="text-[12px] leading-relaxed text-eve-dim">
                          {proposal.rationale}
                        </p>
                      )}

                      <pre className="mt-2 max-h-40 overflow-auto rounded-sm border border-eve-hair bg-background p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre text-foreground/80">
                        {proposal.diff}
                      </pre>

                      {run && (
                        <ul className="mt-3 space-y-1.5">
                          {run.checks.map((check) => (
                            <li key={check.id} className="flex gap-2">
                              <span
                                className={`w-14 shrink-0 font-mono text-[9px] tracking-[0.08em] ${checkTone(check.status)}`}
                              >
                                {checkMark(check.status)}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[11.5px] text-foreground/85">
                                  {check.label}
                                </span>
                                <span className="block text-[11px] text-eve-dim">
                                  {check.detail}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void runTests(proposal)}
                          className="rounded-sm border border-eve-signal/45 bg-eve-signal/10 px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-eve-signal"
                        >
                          RODAR TESTES
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(proposal.diff)
                              .then(
                                () => setNotice("Patch copiado."),
                                () => setNotice("Não consegui copiar."),
                              )
                          }}
                          className="rounded-sm border border-eve-hair px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-eve-dim hover:text-foreground"
                        >
                          COPIAR PATCH
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!run || run.verdict === "reprovado") {
                              setNotice(
                                "Rode os testes antes de aprovar esta proposta.",
                              )
                              return
                            }
                            eve.setProposalStatus(proposal.id, "aprovada")
                            setNotice(
                              "Aprovada. Entra na fila de implementação — nada foi alterado no sistema ainda.",
                            )
                          }}
                          disabled={proposal.status === "aprovada"}
                          className="rounded-sm border border-eve-ok/45 bg-eve-ok/10 px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-eve-ok disabled:opacity-40"
                        >
                          APROVAR
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            eve.setProposalStatus(proposal.id, "rejeitada")
                            setNotice("Proposta rejeitada e arquivada.")
                          }}
                          className="rounded-sm border border-eve-hair px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-eve-dim hover:text-destructive"
                        >
                          REJEITAR
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
