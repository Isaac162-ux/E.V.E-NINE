import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"

import { getCurrentUser } from "#/lib/auth.server.ts"

/** Checagem direta de sessão por HTTP, sem passar por função de servidor. */
export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async () => {
        const user = await getCurrentUser()
        return Response.json(
          { user },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        )
      },
    },
  },
})
