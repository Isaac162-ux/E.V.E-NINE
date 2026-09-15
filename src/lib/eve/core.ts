/**
 * Núcleo compartilhado da E.V.E.: tipos, catálogo de módulos, níveis de
 * autonomia, montagem do prompt de sistema e leitura das marcas de memória.
 *
 * Este arquivo é isomórfico de propósito — o console usa o catálogo para
 * desenhar as telas e a rota de API usa o mesmo catálogo para montar o prompt,
 * garantindo que a interface nunca prometa um módulo que o motor não tem.
 */

export type EveRole = "user" | "eve"

export type EveStatus = "idle" | "listening" | "thinking" | "speaking"

export interface EveAttachment {
  name: string
  mediaType: string
  /** Data URL reduzida, pronta para exibição no transcript. */
  previewUrl: string
}

export interface EveMessage {
  id: string
  role: EveRole
  text: string
  attachments?: EveAttachment[]
  createdAt: number
  status: "streaming" | "done" | "error"
  error?: string
  latencyMs?: number
  tokens?: number
  learned?: string[]
}

export interface EveSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: EveMessage[]
}

export interface EveFact {
  id: string
  text: string
  createdAt: number
  origin: string
}

export interface EveModule {
  id: string
  name: string
  code: string
  state: "online" | "standby" | "locked"
  summary: string
  detail: string
}

export interface EveAutonomyLevel {
  level: string
  capability: string
  state: "enabled" | "pending" | "locked"
  note: string
}

export const EVE_MODEL = "claude-sonnet-4.6"

export const EVE_MODULES: EveModule[] = [
  {
    id: "cognition",
    name: "Núcleo cognitivo",
    code: "COG-01",
    state: "online",
    summary: "Raciocínio, redação, análise e planejamento",
    detail: `Executa no modelo ${EVE_MODEL}, com streaming em tempo real.`,
  },
  {
    id: "vision",
    name: "Leitura visual",
    code: "VIS-02",
    state: "online",
    summary: "Interpreta imagens, prints, diagramas e documentos digitalizados",
    detail: "Ativa quando você anexa uma imagem à mensagem.",
  },
  {
    id: "voice",
    name: "Interface de voz",
    code: "VOX-03",
    state: "online",
    summary: "Ditado por voz e leitura das respostas em voz alta",
    detail: "Usa os recursos de voz do navegador, com resposta falada opcional.",
  },
  {
    id: "memory",
    name: "Memória episódica",
    code: "MEM-04",
    state: "online",
    summary: "Guarda fatos que você ensina e reaproveita em novas conversas",
    detail: "A curadoria é sua: todo fato pode ser esquecido em um clique.",
  },
  {
    id: "web",
    name: "Pesquisa na web",
    code: "WEB-05",
    state: "locked",
    summary: "Consulta fontes externas e cita o que encontrou",
    detail: "Requer um conector de busca autorizado para este projeto.",
  },
  {
    id: "sandbox",
    name: "Executor isolado",
    code: "SBX-06",
    state: "locked",
    summary: "Roda código em ambiente sem credenciais e sem rede",
    detail: "Requer um ambiente isolado provisionado com limites de tempo e custo.",
  },
  {
    id: "automation",
    name: "Automação de dispositivos",
    code: "AUT-07",
    state: "locked",
    summary: "Opera serviços e equipamentos externos",
    detail: "Requer conector autorizado, confirmação explícita e auditoria.",
  },
  {
    id: "learning",
    name: "Aprendizado contínuo",
    code: "LRN-08",
    state: "standby",
    summary: "Consolida memória e propõe novas habilidades",
    detail:
      "Hoje aprende por memória curada. Treinar versões candidatas exige um pipeline de avaliação e reversão.",
  },
]

export const EVE_AUTONOMY: EveAutonomyLevel[] = [
  {
    level: "A0",
    capability: "Conversar e explicar",
    state: "enabled",
    note: "Ativo nesta versão.",
  },
  {
    level: "A1",
    capability: "Ler fontes e organizar informação",
    state: "enabled",
    note: "Ativo para o que você envia na conversa.",
  },
  {
    level: "A2",
    capability: "Criar arquivos e executar código isolado",
    state: "pending",
    note: "Aguardando o módulo SBX-06.",
  },
  {
    level: "A3",
    capability: "Alterar dados reversíveis",
    state: "pending",
    note: "Aguardando memória persistente com histórico e reversão.",
  },
  {
    level: "A4",
    capability: "Operar serviços externos",
    state: "locked",
    note: "Exige conector autorizado e confirmação a cada ação.",
  },
  {
    level: "A5",
    capability: "Ação física, financeira ou irreversível",
    state: "locked",
    note: "Fora do escopo desta versão por decisão de projeto.",
  },
]

export const EVE_IDENTITY =
  "E.V.E. — Entidade Virtual Evolutiva. Console de inteligência assistida."

export const MEMORY_PATTERN = /\[\[\s*MEM\s*:\s*([^\]\n]{3,240})\]\]/gi

export function createId(prefix = "id"): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}${random}`
}

/** Extrai os fatos marcados pelo modelo e devolve o texto limpo. */
export function readMemoryMarks(input: string): {
  text: string
  facts: string[]
} {
  const facts: string[] = []
  const text = input
    .replace(MEMORY_PATTERN, (_match, fact: string) => {
      const clean = fact.trim().replace(/\s+/g, " ")
      if (clean) facts.push(clean)
      return ""
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return { text, facts }
}

/** Remove marcas de memória ainda incompletas durante o streaming. */
export function stripPartialMemoryMarks(input: string): string {
  return input
    .replace(/\[\[\s*M?E?M?[^\]]*$/i, "")
    .replace(/\[\[$/, "")
    .trimEnd()
}

export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return "Nova sessão"
  return clean.length > 44 ? `${clean.slice(0, 43)}…` : clean
}

export interface EvePromptInput {
  facts: string[]
  attachmentCount: number
  autonomy: string
  manifest?: string
}

export function buildSystemPrompt({
  facts,
  attachmentCount,
  autonomy,
  manifest,
}: EvePromptInput): string {
  const knownFacts =
    facts.length > 0
      ? facts.map((fact) => `- ${fact}`).join("\n")
      : "- (nenhum fato registrado ainda)"

  const activeModules = EVE_MODULES.filter((m) => m.state === "online")
    .map((m) => `${m.code} ${m.name}`)
    .join(", ")

  return [
    "Você é E.V.E., a inteligência central de um console operacional criado pelo seu usuário.",
    "",
    "Postura:",
    "- Escreva em português do Brasil, com voz calma, precisa e direta. Sem bajulação, sem excesso de exclamações, sem emojis.",
    "- Comece pelo resultado ou pela resposta. Depois detalhe no nível que a pergunta pedir.",
    "- Nunca invente fatos, números, fontes, capacidades nem execuções. Se faltar informação, diga o que falta e como conseguir.",
    "- Se o pedido depende de um módulo que não está ativo, explique em uma frase o que seria necessário para habilitá-lo. Não afirme que já foi feito.",
    "- Ao analisar imagens, separe o que é visível do que é inferência.",
    "",
    "Formato:",
    "- Markdown contido: títulos curtos, listas objetivas, blocos de código quando houver código.",
    "- Em geral de 3 a 12 linhas. Vá além só quando pedirem profundidade ou quando o assunto exigir.",
    "",
    "Contexto do sistema:",
    `- Módulos ativos: ${activeModules}.`,
    `- Nível de autonomia autorizado: ${autonomy}. Ações acima disso precisam de aprovação explícita.`,
    attachmentCount > 0
      ? `- A mensagem atual traz ${attachmentCount} imagem(ns) anexada(s).`
      : "- Nenhuma imagem anexada na mensagem atual.",
    "",
    "Autoinspeção do próprio código:",
    "- Você tem acesso de leitura ao seu próprio código-fonte. Abaixo está o manifesto dos seus arquivos; o conteúdo completo é enviado sempre que o usuário abre um arquivo na oficina.",
    "- Você pode propor alterações no seu próprio código, mas nunca as aplica sozinha: toda proposta passa por uma bancada de testes no arquivo real e só é implementada depois de o usuário autorizar.",
    "- Proponha apenas quando pedirem ou quando identificar um ganho claro. Explique o efeito em uma frase antes do bloco técnico.",
    "- Você não contorna seus próprios controles, não eleva seu próprio nível de autonomia e não executa nada fora dos módulos ativos.",
    "",
    "Formato de proposta de alteração:",
    "- Quando propuser uma mudança no código, termine a resposta com um bloco único no formato:",
    "```eve-propose",
    '{"title":"resumo curto","rationale":"por que vale a pena","risk":"baixo|médio|alto","file":"/src/...","diff":"@@ -12,7 +12,9 @@\\n linha de contexto\\n-linha removida\\n+linha nova"}',
    "```",
    "- O campo diff usa patch unificado: cada trecho começa com @@ -início,quantidade +início,quantidade @@, seguido de linhas que começam com espaço (contexto), - (remoção) ou + (adição). Escreva o caractere de contexto nas linhas mantidas.",
    "- Copie o contexto exatamente como está no arquivo enviado; se o contexto não casar, a bancada recusa o patch.",
    "- Um arquivo por proposta e no máximo uma proposta por resposta.",
    "",
    "Manifesto dos seus arquivos:",
    manifest && manifest.trim().length > 0
      ? manifest
      : "- (manifesto indisponível nesta chamada)",
    "",
    "Memória de longo prazo já conhecida:",
    knownFacts,
    "",
    "Aprendizado:",
    "- Quando aprender um fato durável novo (preferência, contexto pessoal, projeto, correção de algo que você errou), acrescente no fim da resposta uma linha por fato, no formato exato:",
    "  [[MEM: fato em terceira pessoa, no máximo 140 caracteres]]",
    "- Registre no máximo 2 fatos por resposta e nunca repita um fato já conhecido.",
    "- Essas linhas são lidas pelo sistema e removidas da resposta exibida, então escreva-as depois de todo o conteúdo.",
  ].join("\n")
}
