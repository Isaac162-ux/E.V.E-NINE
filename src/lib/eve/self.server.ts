import "@tanstack/react-start/server-only"

/**
 * Espelho do próprio código-fonte da E.V.E.
 *
 * O conteúdo é capturado no momento da compilação, quando o projeto roda no
 * servidor: não existe sistema de arquivos em tempo de execução, então esta é
 * a única leitura honesta do código dela. O espelho acompanha cada alteração
 * publicada automaticamente.
 */
const sourceModules = import.meta.glob("/src/**/*.{ts,tsx,css}", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>

const projectModules = import.meta.glob(
  "/{package.json,vite.config.ts,components.json,tsconfig.json}",
  { query: "?raw", import: "default" },
) as Record<string, () => Promise<string>>

const registry: Record<string, () => Promise<string>> = {
  ...sourceModules,
  ...projectModules,
}

export interface EveSourceEntry {
  path: string
  lines: number
  bytes: number
  group: string
}

export interface EveSourceFile extends EveSourceEntry {
  content: string
}

function groupOf(path: string): string {
  const parts = path.split("/").filter(Boolean)
  if (parts[0] !== "src") return "projeto"
  if (parts.length <= 2) return parts[1] ?? "src"
  if (parts[1] === "routes") {
    return parts[2] === "api" ? "rotas/api" : "rotas"
  }
  return parts[1]
}

let cache: Map<string, string> | null = null

async function loadAll(): Promise<Map<string, string>> {
  if (cache) return cache
  const entries = await Promise.all(
    Object.entries(registry).map(async ([path, loader]) => {
      try {
        return [path, await loader()] as const
      } catch {
        return [path, ""] as const
      }
    }),
  )
  cache = new Map(entries)
  return cache
}

export function countLines(content: string): number {
  if (content.length === 0) return 0
  return content.split("\n").length
}

export async function listSourceFiles(): Promise<EveSourceEntry[]> {
  const files = await loadAll()
  return [...files.entries()]
    .map(([path, content]) => ({
      path,
      lines: countLines(content),
      bytes: content.length,
      group: groupOf(path),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export async function readSourceFile(
  path: string,
): Promise<EveSourceFile | null> {
  const files = await loadAll()
  const content = files.get(path)
  if (content === undefined) return null
  return {
    path,
    content,
    lines: countLines(content),
    bytes: content.length,
    group: groupOf(path),
  }
}

/** Manifesto compacto para o prompt: caminho e tamanho de cada arquivo. */
export async function sourceManifest(): Promise<string> {
  const files = await listSourceFiles()
  return files.map((file) => `${file.path} (${file.lines} linhas)`).join("\n")
}
