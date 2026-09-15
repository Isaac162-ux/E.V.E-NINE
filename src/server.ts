import "#/error-capture.ts"
import handler, { createServerEntry } from "@tanstack/react-start/server-entry"

import { consumeLastCapturedError, logCapturedError } from "#/error-capture.ts"
import { renderErrorPage } from "#/error-page.ts"

function acceptsHtml(request: Request): boolean {
  return (
    request.method === "GET" &&
    request.headers.get("accept")?.includes("text/html") === true
  )
}

function renderErrorResponse(status = 500): Response {
  return new Response(renderErrorPage(), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as {
      unhandled?: unknown
      message?: unknown
    }
    return payload.unhandled === true && payload.message === "HTTPError"
  } catch {
    return false
  }
}

async function normalizeCatastrophicSsrResponse(
  request: Request,
  response: Response,
): Promise<Response> {
  if (!acceptsHtml(request) || response.status < 500) {
    return response
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    return response
  }

  const body = await response.clone().text()
  if (!isH3SwallowedErrorBody(body)) {
    return response
  }

  logCapturedError(
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`),
  )
  return renderErrorResponse(response.status)
}

export default createServerEntry({
  async fetch(request, requestOpts) {
    try {
      const response = await handler.fetch(request, requestOpts)
      return await normalizeCatastrophicSsrResponse(request, response)
    } catch (error) {
      logCapturedError(error)
      if (acceptsHtml(request)) return renderErrorResponse()
      throw error
    }
  },
})
