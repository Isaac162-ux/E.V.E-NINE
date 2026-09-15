import type { ReactNode } from "react"

import {
  EVE_AUTONOMY,
  EVE_IDENTITY,
  EVE_MODEL,
  EVE_MODULES,
  type EveFact,
  type EveSession,
  type EveStatus,
} from "#/lib/eve/core.ts"

const STATUS_COPY: Record<
  EveStatus,
  { label: string; detail: string; tone: string }
> = {
  idle: {
    label: "PRONTA",
    detail: "Aguardando comando",
    tone: "var(--eve-signal)",
  },
  listening: {
    label: "OUVINDO",
    detail: "Captando sua voz",
    tone: "var(--eve-ok)",
  },
  thinking: {
    label: "PROCESSANDO",
    detail: "Compondo resposta",
    tone: "var(--eve-amber)",
  },
  speaking: {
    label: "FALANDO",
    detail: "Lendo a resposta",
    tone: "var(--eve-signal)",
  },
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

/** Núcleo de estado: a assinatura visual do console. */
export function StateCore({
  status,
  size = "lg",
}: {
  status: EveStatus
  size?: "sm" | "lg"
}) {
  const tone = STATUS_COPY[status].tone
  const dimension = size === "lg" ? "size-40 sm:size-48" : "size-14"
  const ticks = Array.from({ length: 24 }, (_, index) => index * 15)

  return (
    <div
      className={`relative ${dimension}`}
      role="img"
      aria-label={`Estado: ${STATUS_COPY[status].label}`}
    >
      <svg
        viewBox="0 0 120 120"
        className="eve-ring-outer absolute inset-0 size-full"
        aria-hidden="true"
      >
        <circle
          cx="60"
          cy="60"
          r="57"
          fill="none"
          stroke="var(--eve-hair)"
          strokeWidth="1"
          strokeDasharray="1 5"
        />
        <circle
          cx="60"
          cy="60"
          r="57"
          fill="none"
          stroke={tone}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="34 324"
          opacity="0.85"
        />
      </svg>

      <svg
        viewBox="0 0 120 120"
        className="eve-ring-mid absolute inset-0 size-full"
        aria-hidden="true"
      >
        <circle
          cx="60"
          cy="60"
          r="46"
          fill="none"
          stroke="var(--eve-hair)"
          strokeWidth="1"
          strokeDasharray="14 4"
          opacity="0.6"
        />
        <circle
          cx="60"
          cy="60"
          r="46"
          fill="none"
          stroke={tone}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="10 279"
        />
      </svg>

      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{ transform: "rotate(0deg)" }}
      >
        {ticks.map((angle) => (
          <span
            key={angle}
            className="absolute top-1/2 left-1/2 h-1.5 w-px bg-eve-hair"
            style={{
              transform: `rotate(${angle}deg) translateY(-${size === "lg" ? 88 : 30}px)`,
              transformOrigin: "top center",
            }}
          />
        ))}
      </div>

      <div className="absolute inset-[30%] rounded-full border border-eve-hair bg-eve-panel-2/70" />
      <div
        className="eve-core-pulse absolute inset-[38%] rounded-full"
        style={{
          background: `radial-gradient(circle, ${tone} 0%, transparent 72%)`,
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-[44%] rounded-full" style={{ background: tone }} />

      {size === "lg" && (
        <div className="absolute inset-x-6 top-1/2 overflow-hidden">
          <div className="eve-scan h-px w-full" style={{ background: tone }} />
        </div>
      )}
    </div>
  )
}

export function StatePill({ status }: { status: EveStatus }) {
  const copy = STATUS_COPY[status]
  return (
    <div className="flex items-center gap-2">
      <span
        className="size-1.5 rounded-full"
        style={{ background: copy.tone }}
        aria-hidden="true"
      />
      <span
        className="font-mono text-[10px] tracking-[0.22em]"
        style={{ color: copy.tone }}
      >
        {copy.label}
      </span>
      <span className="hidden font-mono text-[10px] tracking-[0.14em] text-eve-dim sm:inline">
        {copy.detail}
      </span>
    </div>
  )
}

function MetaLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.2em] text-eve-dim uppercase">
      {children}
    </span>
  )
}

export function SessionRail({
  sessions,
  activeId,
  factsCount,
  onSelect,
  onCreate,
  onDelete,
  onClose,
}: {
  sessions: EveSession[]
  activeId: string | null
  factsCount: number
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onClose?: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-eve-hair px-4 py-3">
        <MetaLabel>Sessões</MetaLabel>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-eve-dim">
            {sessions.length}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-[10px] tracking-[0.16em] text-eve-dim hover:text-foreground lg:hidden"
            >
              FECHAR
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="mx-3 mt-3 flex items-center justify-between rounded-sm border border-eve-hair bg-eve-panel-2 px-3 py-2 text-left transition-colors hover:border-eve-signal/60 hover:bg-eve-panel"
      >
        <span className="text-[13px] text-foreground">Nova sessão</span>
        <span className="font-mono text-[11px] text-eve-signal">+</span>
      </button>

      <nav className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sessions.map((session) => {
          const active = session.id === activeId
          const last = session.messages[session.messages.length - 1]
          return (
            <div
              key={session.id}
              className={`group mt-1 flex items-start gap-2 rounded-sm border px-3 py-2 transition-colors ${
                active
                  ? "border-eve-signal/40 bg-eve-signal/8"
                  : "border-transparent hover:border-eve-hair hover:bg-eve-panel-2"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(session.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span
                  className={`block truncate text-[13px] ${active ? "text-foreground" : "text-foreground/80"}`}
                >
                  {session.title}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-eve-dim">
                  {formatTime(session.updatedAt)} · {session.messages.length} msg
                </span>
                {last && (
                  <span className="mt-1 block truncate text-[11px] text-eve-dim">
                    {last.role === "eve" ? "E.V.E.: " : "Você: "}
                    {last.text.slice(0, 48)}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onDelete(session.id)}
                aria-label={`Remover sessão ${session.title}`}
                className="mt-0.5 font-mono text-[10px] text-eve-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
              >
                ✕
              </button>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-eve-hair px-4 py-3">
        <MetaLabel>Memória</MetaLabel>
        <p className="mt-1 text-[12px] text-eve-dim">
          {factsCount === 0
            ? "Nenhum fato registrado."
            : `${factsCount} fato${factsCount > 1 ? "s" : ""} em uso.`}
        </p>
      </div>
    </div>
  )
}

export function ModulesPanel() {
  return (
    <section className="border-b border-eve-hair px-4 py-4">
      <div className="flex items-baseline justify-between">
        <MetaLabel>Módulos</MetaLabel>
        <span className="font-mono text-[10px] text-eve-dim">
          {EVE_MODULES.filter((module) => module.state === "online").length}/
          {EVE_MODULES.length}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {EVE_MODULES.map((module) => {
          const tone =
            module.state === "online"
              ? "var(--eve-ok)"
              : module.state === "standby"
                ? "var(--eve-amber)"
                : "var(--eve-dim)"
          return (
            <li key={module.id} className="flex items-start gap-2.5">
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full"
                style={{ background: tone }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] text-foreground/90">
                    {module.name}
                  </span>
                  <span className="font-mono text-[9.5px] tracking-[0.12em] text-eve-dim">
                    {module.code}
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-eve-dim">
                  {module.summary}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function MemoryPanel({
  facts,
  onForget,
  onClear,
}: {
  facts: EveFact[]
  onForget: (id: string) => void
  onClear: () => void
}) {
  return (
    <section className="border-b border-eve-hair px-4 py-4">
      <div className="flex items-baseline justify-between">
        <MetaLabel>Memória de longo prazo</MetaLabel>
        {facts.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="font-mono text-[10px] tracking-[0.14em] text-eve-dim hover:text-destructive"
          >
            LIMPAR
          </button>
        )}
      </div>

      {facts.length === 0 ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-eve-dim">
          A E.V.E. registra aqui os fatos duráveis que aprende na conversa. Você
          pode esquecer qualquer um deles.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {facts.map((fact) => (
            <li
              key={fact.id}
              className="group flex items-start gap-2 rounded-sm border border-eve-hair/60 bg-eve-panel-2 px-2.5 py-1.5"
            >
              <span className="mt-0.5 font-mono text-[10px] text-eve-signal">
                ▪
              </span>
              <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-foreground/85">
                {fact.text}
              </span>
              <button
                type="button"
                onClick={() => onForget(fact.id)}
                aria-label={`Esquecer: ${fact.text}`}
                className="font-mono text-[10px] text-eve-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function AutonomyPanel() {
  return (
    <section className="px-4 py-4">
      <MetaLabel>Níveis de autonomia</MetaLabel>
      <ul className="mt-3 space-y-1.5">
        {EVE_AUTONOMY.map((level) => {
          const tone =
            level.state === "enabled"
              ? "var(--eve-ok)"
              : level.state === "pending"
                ? "var(--eve-amber)"
                : "var(--eve-dim)"
          return (
            <li key={level.level} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 w-6 shrink-0 font-mono text-[10px] tracking-[0.1em]"
                style={{ color: tone }}
              >
                {level.level}
              </span>
              <div className="min-w-0">
                <p className="text-[12px] text-foreground/85">
                  {level.capability}
                </p>
                <p className="text-[11px] leading-snug text-eve-dim">
                  {level.note}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 border-t border-eve-hair pt-3 text-[11px] leading-relaxed text-eve-dim">
        Nada acima do nível autorizado é executado sem confirmação explícita.
      </p>
    </section>
  )
}

export function SystemRail({
  facts,
  onForget,
  onClearFacts,
  onClose,
}: {
  facts: EveFact[]
  onForget: (id: string) => void
  onClearFacts: () => void
  onClose?: () => void
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-eve-hair px-4 py-3">
        <MetaLabel>Sistema</MetaLabel>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] tracking-[0.16em] text-eve-dim hover:text-foreground xl:hidden"
          >
            FECHAR
          </button>
        )}
      </div>
      <ModulesPanel />
      <MemoryPanel facts={facts} onForget={onForget} onClear={onClearFacts} />
      <AutonomyPanel />
      <div className="mt-auto border-t border-eve-hair px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.14em] text-eve-dim">
          {EVE_IDENTITY}
        </p>
      </div>
    </div>
  )
}

export function MetaRailStatus({ status }: { status: EveStatus }) {
  return (
    <div className="flex flex-col gap-1 font-mono text-[10px] tracking-[0.14em] text-eve-dim">
      <span>{EVE_MODEL}</span>
      <span>ESTADO {STATUS_COPY[status].label}</span>
    </div>
  )
}
