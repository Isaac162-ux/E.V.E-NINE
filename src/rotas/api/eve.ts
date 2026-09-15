import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { z } from "zod"

import { EVE_MODEL, buildSystemPrompt } from "#/lib/eve/core.ts"

const attachmentSchema = z.object({
  mediaType: z.string().min(3).max(60),
  data: z.string().min(16),
})

const turnSchema = z.object({
  role: z.enum(["user", "eve"]),
  text: z.string().max(20_000),
  attachments: z.array(attachmentSchema).max(4).optional(),
})

const requestSchema = z.object({
  turns: z.array(turnSchema).min(1).max(40),
  facts: z.array(z.string().max(240)).max(60).default([]),
  autonomy: z.string().max(40).default("A1"),
})

/**
 * Credenciais do gateway vivem apenas no servidor. O navegador chama esta
 * rota, que repassa a conversa para o gateway e devolve um fluxo NDJSON.
 */
async function readSecret(key: string): Promise<string> {
  if (typeof process !== "undefined" && process.env?.[key]) {
    return process.env[key] as string
  }
  try {
    const workers = await import("cloudflare:workers")
    const value = (workers.env as Record<string, string | undefined>)[key]
    if (value) return value
  } catch {
    // Fora do runtime de Workers não há binding para consultar.
  }
  throw new Error(`Credencial ausente no servidor: ${key}`)
}

interface AnthropicBlock {
  type: string
  text?: string
  source?: { type: string; media_type: string; data: string }
}

type AnthropicContent = string | AnthropicBlock[]

interface AnthropicMessage {
  role: "user" | "assistant"
  content: AnthropicContent
}

function toAnthropicContent(turn: z.infer<typeof turnSchema>) {
  const images = (turn.attachments ?? []).map((item) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: item.mediaType,
      // Base64 nunca pode carregar espaço em branco.
      data: item.data.replace(/\s/g, ""),
    },
  }))

  if (images.length === 0) return turn.text

  const blocks: AnthropicBlock[] = [...images]
  if (turn.text.trim().length > 0) {
    blocks.push({ type: "text", text: turn.text })
  }
  return blocks
}

export const Route = createFileRoute("/api/eve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof requestSchema>
        try {
          parsed = requestSchema.parse(await request.json())
        } catch {
          return Response.json(
            { error: "Pedido inválido." },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          )
        }

        let baseUrl: string
        let apiKey: string
        try {
          baseUrl = await readSecret("BTY_LLM_SERVER_BASE_URL")
          apiKey = await readSecret("BTY_LLM_SERVER_API_KEY")
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error ? error.message : "Configuração ausente.",
            },
            { status: 500, headers: { "Cache-Control": "no-store" } },
          )
        }

        const turns = parsed.turns.slice(-16)
        const lastTurn = turns[turns.length - 1]
        const attachmentCount = lastTurn?.attachments?.length ?? 0

        // O manifesto dá à E.V.E. a noção da própria estrutura sem custo alto:
        // o conteúdo completo só entra quando ela lê um arquivo na oficina.
        let manifest = ""
        try {
          const selfModule = await import("#/lib/eve/self.server.ts")
          manifest = await selfModule.sourceManifest()
        } catch {
          manifest = ""
        }

        const messages: AnthropicMessage[] = turns.map((turn) => ({
          role: turn.role === "eve" ? "assistant" : "user",
          content: toAnthropicContent(turn),
        }))

        let upstream: Response
        try {
          upstream = await fetch(`${baseUrl}/messages`, {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "x-bty-business": "ReActUs",
              "x-bty-workspace": "default",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: EVE_MODEL,
              max_tokens: 2048,
              stream: true,
              system: buildSystemPrompt({
                facts: parsed.facts,
                attachmentCount,
                autonomy: parsed.autonomy,
                manifest,
              }),
              messages,
            }),
          })
        } catch {
          return Response.json(
            { error: "Não foi possível alcançar o núcleo cognitivo." },
            { status: 502, headers: { "Cache-Control": "no-store" } },
          )
        }

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "")
          return Response.json(
            {
              error: `Núcleo cognitivo recusou a chamada (${upstream.status}).`,
              detail: detail.slice(0, 400),
            },
            { status: 502, headers: { "Cache-Control": "no-store" } },
          )
        }

        const encoder = new TextEncoder()
        const decoder = new TextDecoder()
        const body = upstream.body

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const reader = body.getReader()
            let buffer = ""
            const send = (payload: Record<string, unknown>) => {
              controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
            }

            try {
              for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() ?? ""

                for (const line of lines) {
                  const trimmed = line.trim()
                  if (!trimmed.startsWith("data:")) continue
                  const raw = trimmed.slice(5).trim()
                  if (!raw || raw === "[DONE]") continue

                  let event: {
                    type?: string
                    delta?: { type?: string; text?: string }
                    usage?: { output_tokens?: number }
                    error?: { message?: string }
                  }
                  try {
                    event = JSON.parse(raw)
                  } catch {
                    continue
                  }

                  if (
                    event.type === "content_block_delta" &&
                    event.delta?.type === "text_delta" &&
                    typeof event.delta.text === "string"
                  ) {
                    send({ t: "delta", v: event.delta.text })
                  } else if (event.type === "message_delta" && event.usage) {
                    send({ t: "usage", tokens: event.usage.output_tokens ?? 0 })
                  } else if (event.type === "error") {
                    send({
                      t: "error",
                      message: event.error?.message ?? "Falha no núcleo.",
                    })
                  }
                }
              }
              send({ t: "done" })
            } catch {
              send({ t: "error", message: "Fluxo interrompido." })
            } finally {
              controller.close()
              reader.releaseLock()
            }
          },
        })

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
          },
        })
      },
    },
  },
})
