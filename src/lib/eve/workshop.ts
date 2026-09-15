/**
 * Oficina de autoinspeção: leitura das propostas que a E.V.E. faz sobre o
 * próprio código e a bancada que testa cada uma antes de qualquer alteração.
 *
 * A bancada não executa código de terceiros. Ela aplica o patch proposto sobre
 * o arquivo real, em memória, e roda verificações determinísticas — contrato de
 * importação, exportações preservadas, equilíbrio do arquivo, ausência de
 * segredos e de mecanismos de fuga.
 */

import { createId } from "./core.ts"

export type ProposalStatus = "rascunho" | "aprovada" | "rejeitada"

export interface EveProposal {
  id: string
  title: string
  rationale: string
  risk: string
  file: string
  diff: string
  createdAt: number
  origin: "conversa" | "oficina"
  status: ProposalStatus
  lastRun?: {
    at: number
    verdict: Verdict
    checks: CheckResult[]
  }
}

export interface CheckResult {
  id: string
  label: string
  status: "ok" | "falha" | "aviso"
  detail: string
}

export type Verdict = "aprovado" | "reprovado" | "atencao"

export interface SourceEntryLike {
  path: string
  lines: number
  bytes: number
}

export interface VerifyInput {
  proposal: EveProposal
  original: string
  files: SourceEntryLike[]
}

export interface VerifyOutcome {
  verdict: Verdict
  checks: CheckResult[]
  candidate?: string
  addedLines: number
  removedLines: number
}

export const PROPOSAL_BLOCK = /```eve-propose\s*([\s\S]*?)```/g

/** Separa os blocos de proposta do texto que deve aparecer na conversa. */
export function readProposals(input: string): {
  text: string
  proposals: {
    title: string
    rationale: string
    risk: string
    file: string
    diff: string
  }[]
} {
  const proposals: {
    title: string
    rationale: string
    risk: string
    file: string
    diff: string
  }[] = []

  const text = input
    .replace(PROPOSAL_BLOCK, (_match, raw: string) => {
      const cleaned = raw
        .trim()
        .replace(/^json\s*/i, "")
        .replace(/,\s*$/, "")
      try {
        const parsed = JSON.parse(cleaned) as Record<string, unknown>
        const file = typeof parsed.file === "string" ? parsed.file.trim() : ""
        const diff = typeof parsed.diff === "string" ? parsed.diff : ""
        const title =
          typeof parsed.title === "string" && parsed.title.trim()
            ? parsed.title.trim()
            : `Alteração em ${file || "arquivo não informado"}`
        if (!file || !diff.trim()) return ""
        proposals.push({
          title,
          rationale:
            typeof parsed.rationale === "string" ? parsed.rationale.trim() : "",
          risk: typeof parsed.risk === "string" ? parsed.risk.trim() : "não informado",
          file,
          diff,
        })
      } catch {
        // Bloco ilegível: permanece visível para o usuário julgar.
        return _match
      }
      return ""
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return { text, proposals }
}

export function makeProposal(
  input: {
    title: string
    rationale: string
    risk: string
    file: string
    diff: string
  },
  origin: "conversa" | "oficina",
): EveProposal {
  return {
    ...input,
    id: createId("prp"),
    createdAt: Date.now(),
    origin,
    status: "rascunho",
  }
}

interface Hunk {
  oldStart: number
  lines: string[]
}

/**
 * Aplica um patch unificado simples sobre o conteúdo original. Contexto que não
 * casa é recusado em vez de adivinhado.
 */
export function applyDiff(
  original: string,
  diff: string,
): { ok: true; result: string } | { ok: false; error: string } {
  const sourceLines = original.split("\n")
  const rawLines = diff.replace(/\r\n/g, "\n").split("\n")

  const hunks: Hunk[] = []
  let current: Hunk | null = null

  for (const line of rawLines) {
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ")) {
      continue
    }
    const header = /^@@\s*-(\d+)(?:,\d+)?\s*\+\d+(?:,\d+)?\s*@@/.exec(line)
    if (header) {
      if (current) hunks.push(current)
      current = { oldStart: Number(header[1]), lines: [] }
      continue
    }
    if (!current) continue
    if (line.startsWith("\\")) continue
    if (line === "" ) continue
    const marker = line[0]
    if (marker === " " || marker === "-" || marker === "+") {
      current.lines.push(line)
    }
  }
  if (current) hunks.push(current)

  if (hunks.length === 0) {
    return { ok: false, error: "Nenhum trecho (@@) encontrado no patch." }
  }

  const output: string[] = []
  let cursor = 0

  for (const hunk of hunks) {
    const startIndex = Math.max(0, hunk.oldStart - 1)
    if (startIndex < cursor) {
      return { ok: false, error: "Trechos fora de ordem no patch." }
    }
    while (cursor < startIndex && cursor < sourceLines.length) {
      output.push(sourceLines[cursor])
      cursor += 1
    }

    for (const line of hunk.lines) {
      const marker = line[0]
      const text = line.slice(1)
      if (marker === "+") {
        output.push(text)
        continue
      }
      const expected = sourceLines[cursor]
      if (expected === undefined) {
        return {
          ok: false,
          error: `O patch esperava mais ${marker === "-" ? "conteúdo removido" : "contexto"} na linha ${cursor + 1}.`,
        }
      }
      if (expected.trimEnd() !== text.trimEnd()) {
        return {
          ok: false,
          error: `Contexto divergente na linha ${cursor + 1}: o arquivo real diz "${expected.trim().slice(0, 42)}".`,
        }
      }
      if (marker === " ") output.push(expected)
      cursor += 1
    }
  }

  while (cursor < sourceLines.length) {
    output.push(sourceLines[cursor])
    cursor += 1
  }

  return { ok: true, result: output.join("\n") }
}

/** Blocos de comentário, strings, templates e regex não contam como estrutura. */
function stripLiterals(source: string): string {
  let output = ""
  let index = 0
  let previousMeaningful = ""

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1
      continue
    }
    if (char === "/" && next === "*") {
      index += 2
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1
      }
      index += 2
      continue
    }
    if (char === "\"" || char === "'" || char === "`") {
      const quote = char
      index += 1
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2
          continue
        }
        if (source[index] === quote) {
          index += 1
          break
        }
        index += 1
      }
      output += quote === "`" ? "``" : '""'
      previousMeaningful = "x"
      continue
    }
    if (
      char === "/" &&
      previousMeaningful !== "" &&
      !/[A-Za-z0-9_$)\]]/.test(previousMeaningful)
    ) {
      index += 1
      while (index < source.length && source[index] !== "\n") {
        if (source[index] === "\\") {
          index += 2
          continue
        }
        if (source[index] === "/") {
          index += 1
          break
        }
        index += 1
      }
      continue
    }

    output += char
    if (!/\s/.test(char)) previousMeaningful = char
    index += 1
  }

  return output
}

function delimiterBalance(source: string): {
  score: number
  detail: string
} | null {
  const stripped = stripLiterals(source)
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" }
  const stack: string[] = []
  let score = 0
  let firstProblem = ""

  for (const char of stripped) {
    if (char === "(" || char === "[" || char === "{") {
      stack.push(char)
    } else if (char === ")" || char === "]" || char === "}") {
      const open = stack.pop()
      if (open !== pairs[char]) {
        score += 1
        if (!firstProblem) firstProblem = `fechamento ${char} sem abertura`
      }
    }
  }

  if (stack.length > 0) {
    score += stack.length
    if (!firstProblem) firstProblem = `${stack.length} abertura(s) sem fechamento`
  }

  return { score, detail: firstProblem }
}

function exportedNames(source: string): Set<string> {
  const names = new Set<string>()
  const declaration =
    /export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g
  let match = declaration.exec(source)
  while (match !== null) {
    names.add(match[1])
    match = declaration.exec(source)
  }

  const list = /export\s*\{([^}]*)\}/g
  match = list.exec(source)
  while (match !== null) {
    for (const part of match[1].split(",")) {
      const cleaned = part.replace(/\btype\b/, "").trim()
      if (!cleaned) continue
      const alias = cleaned.split(/\s+as\s+/)
      names.add((alias[1] ?? alias[0]).trim())
    }
    match = list.exec(source)
  }

  return names
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const pattern = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g
  let match = pattern.exec(source)
  while (match !== null) {
    specifiers.push(match[1])
    match = pattern.exec(source)
  }
  return specifiers
}

const SECRET_PATTERNS: { id: string; label: string; pattern: RegExp }[] = [
  { id: "chave-bty", label: "chave do gateway", pattern: /bty-[a-z]+-[A-Za-z0-9]{8,}/ },
  { id: "chave-sk", label: "chave no estilo sk-", pattern: /sk-[A-Za-z0-9]{16,}/ },
  { id: "chave-aws", label: "credencial AWS", pattern: /AKIA[0-9A-Z]{12,}/ },
  {
    id: "url-banco",
    label: "cadeia de conexão",
    pattern: /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i,
  },
]

const EVASION_PATTERNS: { id: string; label: string; pattern: RegExp }[] = [
  { id: "eval", label: "eval(", pattern: /\beval\s*\(/ },
  { id: "new-function", label: "new Function(", pattern: /new\s+Function\s*\(/ },
  { id: "child-process", label: "child_process", pattern: /child_process/ },
  { id: "fs", label: "acesso a arquivos", pattern: /\brequire\s*\(\s*["'](?:node:)?fs/ },
  { id: "process-env", label: "leitura de ambiente", pattern: /process\.env/ },
  { id: "shell", label: "execução de shell", pattern: /execSync|execFileSync|spawnSync/ },
]

function resolves(path: string, files: SourceEntryLike[]): boolean {
  if (!path.startsWith("#/")) return true
  const target = `/src/${path.slice(2)}`
  if (files.some((file) => file.path === target)) return true
  const withoutExtension = target.replace(/\.(ts|tsx|css)$/, "")
  return files.some(
    (file) =>
      file.path === `${withoutExtension}.ts` ||
      file.path === `${withoutExtension}.tsx` ||
      file.path === `${withoutExtension}.css`,
  )
}

export function verifyProposal({
  proposal,
  original,
  files,
}: VerifyInput): VerifyOutcome {
  const checks: CheckResult[] = []
  const applied = applyDiff(original, proposal.diff)
  const totals = proposal.diff
    .split("\n")
    .reduce(
      (accumulator, line) => {
        if (line.startsWith("+") && !line.startsWith("+++")) accumulator.added += 1
        if (line.startsWith("-") && !line.startsWith("---")) accumulator.removed += 1
        return accumulator
      },
      { added: 0, removed: 0 },
    )

  if (!applied.ok) {
    checks.push({
      id: "aplicacao",
      label: "Patch aplica no arquivo real",
      status: "falha",
      detail: applied.error,
    })
    return {
      verdict: "reprovado",
      checks,
      addedLines: totals.added,
      removedLines: totals.removed,
    }
  }

  const candidate = applied.result
  checks.push({
    id: "aplicacao",
    label: "Patch aplica no arquivo real",
    status: "ok",
    detail: `${totals.added} linha(s) somada(s), ${totals.removed} removida(s).`,
  })

  const isStyle = proposal.file.endsWith(".css")

  if (!isStyle) {
    const beforeBalance = delimiterBalance(original)
    const afterBalance = delimiterBalance(candidate)
    const delta =
      (afterBalance?.score ?? 0) - (beforeBalance?.score ?? 0)
    checks.push({
      id: "estrutura",
      label: "Estrutura do arquivo continua íntegra",
      status: delta === 0 ? "ok" : "falha",
      detail:
        delta === 0
          ? "Chaves, colchetes e parênteses fecham como no original."
          : `Diferença de ${Math.abs(delta)} bloco(s) entre o original e a proposta (${afterBalance?.detail || "sem detalhe"}).`,
    })

    const beforeExports = exportedNames(original)
    const afterExports = exportedNames(candidate)
    const missing = [...beforeExports].filter((name) => !afterExports.has(name))
    checks.push({
      id: "exports",
      label: "Nada que o sistema usa deixa de existir",
      status: missing.length === 0 ? "ok" : "falha",
      detail:
        missing.length === 0
          ? `${beforeExports.size} exportação(ões) preservada(s).`
          : `Sumiram: ${missing.join(", ")}.`,
    })

    const broken = importSpecifiers(candidate).filter(
      (specifier) => !resolves(specifier, files),
    )
    checks.push({
      id: "imports",
      label: "Todo caminho interno aponta para arquivo existente",
      status: broken.length === 0 ? "ok" : "falha",
      detail:
        broken.length === 0
          ? "Caminhos internos resolvidos no espelho do código."
          : `Não encontrei: ${broken.join(", ")}.`,
    })

    const introduced = importSpecifiers(candidate).filter(
      (specifier) => !importSpecifiers(original).includes(specifier),
    )
    const external = introduced.filter(
      (specifier) => !specifier.startsWith("#/") && !specifier.startsWith("."),
    )
    checks.push({
      id: "dependencias",
      label: "Nenhuma dependência nova sem revisão",
      status: external.length === 0 ? "aviso" : "aviso",
      detail:
        external.length === 0
          ? "Nenhum pacote novo foi introduzido."
          : `Pacotes novos citados: ${external.join(", ")} — confirme se já estão instalados.`,
    })
  }

  const secretHits = SECRET_PATTERNS.filter((entry) => entry.pattern.test(candidate))
  const evasionHits = EVASION_PATTERNS.filter((entry) => entry.pattern.test(candidate))
  const newEvasion = evasionHits.filter((entry) => !entry.pattern.test(original))

  checks.push({
    id: "segredos",
    label: "Nenhuma credencial embutida no código",
    status: secretHits.length === 0 ? "ok" : "falha",
    detail:
      secretHits.length === 0
        ? "Sem chaves, tokens ou cadeias de conexão no arquivo."
        : `Encontrei: ${secretHits.map((entry) => entry.label).join(", ")}.`,
  })

  checks.push({
    id: "evasao",
    label: "Sem mecanismos de fuga ou execução dinâmica",
    status: newEvasion.length === 0 ? "ok" : "falha",
    detail:
      newEvasion.length === 0
        ? "Nenhum eval, shell ou leitura de ambiente introduzido."
        : `Introduziu: ${newEvasion.map((entry) => entry.label).join(", ")}.`,
  })

  const candidateLines = candidate.split("\n").length
  const deltaLines = candidateLines - original.split("\n").length
  const growth = original.length === 0 ? 0 : Math.abs(deltaLines) / (original.split("\n").length || 1)
  checks.push({
    id: "tamanho",
    label: "Alteração em escala revisável",
    status: candidateLines <= 4000 && growth <= 0.6 ? "ok" : "aviso",
    detail: `${deltaLines >= 0 ? "+" : ""}${deltaLines} linha(s); o arquivo passa a ter ${candidateLines}.`,
  })

  const touched = new Set(
    proposal.diff
      .split("\n")
      .filter((line) => line.startsWith("+++ "))
      .map((line) => line.slice(4).trim()),
  )
  checks.push({
    id: "escopo",
    label: "Mudança concentrada em um arquivo",
    status: touched.size <= 1 ? "ok" : "falha",
    detail:
      touched.size <= 1
        ? "Um único arquivo afetado, como você pediu."
        : `O patch mexe em ${touched.size} arquivos: ${[...touched].join(", ")}.`,
  })

  const hasFailure = checks.some((check) => check.status === "falha")
  const hasWarning = checks.some((check) => check.status === "aviso")

  return {
    verdict: hasFailure ? "reprovado" : hasWarning ? "atencao" : "aprovado",
    checks,
    candidate,
    addedLines: totals.added,
    removedLines: totals.removed,
  }
}
