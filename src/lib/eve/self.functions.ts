import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { getCurrentUser, noteRestrictedAccess } from "./auth.server.ts"
import {
  listSourceFiles,
  readSourceFile,
  sourceManifest,
  type EveSourceEntry,
  type EveSourceFile,
} from "./self.server.ts"

export const listEveSource = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ authorized: boolean; files: EveSourceEntry[] }> => {
    const user = await getCurrentUser()
    if (!user) {
      await noteRestrictedAccess("oficina")
      return { authorized: false, files: [] }
    }
    return { authorized: true, files: await listSourceFiles() }
  },
)

export const readEveSource = createServerFn({ method: "GET" })
  .validator(z.string().min(1).max(200))
  .handler(
    async ({
      data,
    }): Promise<{ authorized: boolean; file: EveSourceFile | null }> => {
      const user = await getCurrentUser()
      if (!user) {
        await noteRestrictedAccess("oficina")
        return { authorized: false, file: null }
      }
      return { authorized: true, file: await readSourceFile(data) }
    },
  )

export const eveSourceManifest = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ authorized: boolean; manifest: string }> => {
    const user = await getCurrentUser()
    if (!user) return { authorized: false, manifest: "" }
    return { authorized: true, manifest: await sourceManifest() }
  },
)
