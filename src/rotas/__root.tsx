import { HappySeedsInspector } from "@happyseeds/devtools/react"
import "@happyseeds/devtools/runtime"
import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouter,
} from "@tanstack/react-router"
import type { ErrorComponentProps } from "@tanstack/react-router"

import appCss from "../styles.css?url"
import { getSessionUser } from "#/lib/auth.functions.ts"
import type { AuthUser } from "#/lib/auth.functions.ts"

interface MyRouterContext {
  queryClient: QueryClient
  user: AuthUser | null
}

/**
 * Umami analytics. Loads only in a production build and only once both values
 * are configured, so a dev session or an unconfigured app ships no tracker.
 *
 * `import.meta.env.PROD` is statically false in every other build, including
 * `build:dev`, so the tag never renders there. The configured values still sit
 * in the bundle either way — a VITE_ variable is public by definition, so
 * neither of these may hold anything secret.
 */
const UMAMI_SCRIPT_URL = import.meta.env.VITE_UMAMI_SCRIPT_URL ?? ""
const UMAMI_WEBSITE_ID = (import.meta.env.VITE_UMAMI_WEBSITE_ID ?? "").trim()
const UMAMI_ENABLED =
  import.meta.env.PROD && UMAMI_SCRIPT_URL !== "" && UMAMI_WEBSITE_ID !== ""

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "E.V.E. — Console de Inteligência" },
      {
        name: "description",
        content:
          "E.V.E. é um console de inteligência assistida: conversa em tempo real, leitura de imagens, voz e memória curada por você.",
      },
      { property: "og:title", content: "E.V.E. — Console de Inteligência" },
      {
        property: "og:description",
        content:
          "E.V.E. é um console de inteligência assistida: conversa em tempo real, leitura de imagens, voz e memória curada por você.",
      },
      {
        name: "keywords",
        content:
          "E.V.E., assistente de IA, console de inteligência, memória, voz, visão",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "E.V.E." },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  // Fonte única do estado de sessão para toda a interface.
  beforeLoad: async () => ({ user: await getSessionUser() }),
  shellComponent: RootDocument,
  errorComponent: RootError,
})

function RootError({ reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <main
      key="root-error"
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background px-4"
    >
      <section className="flex w-full max-w-md flex-col items-center text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page failed to load
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          An error stopped it from rendering.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => {
              void router.invalidate()
              reset()
            }}
          >
            Try again
          </button>
          <a
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href="/"
          >
            Go home
          </a>
        </div>
      </section>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  // Browser extensions decorate <html>/<body> before React hydrates. The
  // suppression is element-local — mismatches inside the app still warn.
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <HappySeedsInspector />
        {UMAMI_ENABLED && (
          <script
            async
            src={UMAMI_SCRIPT_URL}
            data-website-id={UMAMI_WEBSITE_ID}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
