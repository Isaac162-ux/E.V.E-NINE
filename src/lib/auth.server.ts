import "@tanstack/react-start/server-only"
import { getRequest } from "@tanstack/react-start/server"
import { and, desc, eq, gt, gte, isNull, sql } from "drizzle-orm"

import { withDatabase } from "#/db/index.ts"
import { accessAttempts, sessions, users } from "#/db/schema/auth.ts"

/**
 * Autenticação do administrador da E.V.E.
 *
 * Tudo aqui é servidor puro: hash de senha, sessão, limite de tentativas e o
 * registro de acessos. O navegador nunca vê token, hash ou valor de ambiente.
 */

const COOKIE_NAME = "eve_admin"
const SESSION_DAYS = 7
const PBKDF2_ITERATIONS = 150_000
const SALT_BYTES = 16
const LOGIN_WINDOW_MINUTES = 10
const LOGIN_MAX_FAILURES = 5
const ORIGIN_WINDOW_MINUTES = 60
const ORIGIN_MAX_FAILURES = 25

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

export type AttemptKind =
  | "login_ok"
  | "login_failed"
  | "login_blocked"
  | "restricted_denied"
  | "session_rejected"

export interface AccessEntry {
  id: string
  kind: AttemptKind
  account: string | null
  area: string | null
  origin: string | null
  userAgent: string | null
  detail: string | null
  createdAt: string
}

export interface AccessSummary {
  total: number
  failed: number
  blocked: number
  denied: number
  windowHours: number
}

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

async function deriveBits(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  )
  return toBase64Url(new Uint8Array(bits))
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const hash = await deriveBits(password, salt)
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${hash}`
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split("$")
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations < 100_000) return false

  const salt = fromBase64Url(parts[2])
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as BufferSource,
      iterations,
    },
    key,
    256,
  )
  return timingSafeEqual(toBase64Url(new Uint8Array(bits)), parts[3])
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export function normalizeAccount(account: string): string {
  return account.trim().toLowerCase()
}

export function isEmail(account: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(account)
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "A senha precisa ter ao menos 8 caracteres."
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/[0-9]/.test(password)) {
    return "Combine letras e números na senha."
  }
  return null
}

function requestHeaders(): Headers {
  try {
    return getRequest().headers
  } catch {
    return new Headers()
  }
}

/** Origem como resumo irreversível: guarda o rastro sem arquivar o IP. */
async function originTag(): Promise<{ hash: string; userAgent: string }> {
  const headers = requestHeaders()
  const ip =
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "desconhecido"
  return {
    hash: (await sha256(ip)).slice(0, 12),
    userAgent: (headers.get("user-agent") ?? "desconhecido").slice(0, 160),
  }
}

export async function recordAttempt(input: {
  kind: AttemptKind
  account?: string | null
  area?: string | null
  detail?: string | null
}): Promise<void> {
  const origin = await originTag()
  await withDatabase(async (database) => {
    await database.insert(accessAttempts).values({
      id: crypto.randomUUID(),
      kind: input.kind,
      account: input.account ? normalizeAccount(input.account).slice(0, 200) : null,
      area: input.area ?? null,
      originHash: origin.hash,
      userAgent: origin.userAgent,
      detail: input.detail?.slice(0, 300) ?? null,
      createdAt: new Date(),
    })
  })
}

function readCookie(name: string): string | null {
  const header = requestHeaders().get("cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) return decodeURIComponent(rest.join("="))
  }
  return null
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ]
  attributes.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`)
  return attributes.join("; ")
}

export async function createSession(userId: string): Promise<string> {
  const token = toBase64Url(randomBytes(32))
  const tokenHash = await sha256(token)
  const origin = await originTag()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await withDatabase(async (database) => {
    await database.insert(sessions).values({
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      expiresAt,
      originHash: origin.hash,
      userAgent: origin.userAgent,
      createdAt: new Date(),
    })
  })

  return token
}

export async function revokeCurrentSession(): Promise<void> {
  const token = readCookie(COOKIE_NAME)
  if (!token) return
  const tokenHash = await sha256(token)
  await withDatabase(async (database) => {
    await database
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
  })
}

/** Resolve a sessão do pedido atual. Qualquer irregularidade resulta em nulo. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = readCookie(COOKIE_NAME)
  if (!token) return null
  const tokenHash = await sha256(token)

  return withDatabase(async (database) => {
    const rows = await database
      .select({
        id: users.id,
        email: users.email,
        status: users.status,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1)

    const row = rows[0]
    if (!row || row.status !== "active") return null
    return {
      id: row.id,
      email: row.email,
      displayName: row.email.split("@")[0],
    }
  })
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error("UNAUTHORIZED")
  return user
}

/** Recusa de acesso a área restrita: registra o rastro e devolve falso. */
export async function noteRestrictedAccess(area: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (user) return true
  await recordAttempt({
    kind: "restricted_denied",
    area: area.slice(0, 60),
    detail: "Tentativa de abrir área restrita sem credencial válida.",
  })
  return false
}

async function recentFailures(
  kind: AttemptKind,
  since: Date,
  account?: string,
): Promise<number> {
  return withDatabase(async (database) => {
    const filters = [eq(accessAttempts.kind, kind), gte(accessAttempts.createdAt, since)]
    if (account) filters.push(eq(accessAttempts.account, account))
    const rows = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(accessAttempts)
      .where(and(...filters))
    return rows[0]?.count ?? 0
  })
}

export async function loginThrottled(account: string): Promise<boolean> {
  const origin = await originTag()
  const accountWindow = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000)
  const originWindow = new Date(Date.now() - ORIGIN_WINDOW_MINUTES * 60 * 1000)

  const [byAccount, byOrigin] = await Promise.all([
    recentFailures("login_failed", accountWindow, account),
    withDatabase(async (database) => {
      const rows = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(accessAttempts)
        .where(
          and(
            eq(accessAttempts.kind, "login_failed"),
            gte(accessAttempts.createdAt, originWindow),
            eq(accessAttempts.originHash, origin.hash),
          ),
        )
      return rows[0]?.count ?? 0
    }),
  ])

  return byAccount >= LOGIN_MAX_FAILURES || byOrigin >= ORIGIN_MAX_FAILURES
}

export async function accountCount(): Promise<number> {
  return withDatabase(async (database) => {
    const rows = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
    return rows[0]?.count ?? 0
  })
}

export async function findUserByAccount(
  account: string,
): Promise<{ id: string; email: string; passwordHash: string | null; status: string } | null> {
  return withDatabase(async (database) => {
    const rows = await database
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        status: users.status,
      })
      .from(users)
      .where(eq(users.email, account))
      .limit(1)
    return rows[0] ?? null
  })
}

export async function createAdmin(
  account: string,
  passwordHash: string,
): Promise<AuthUser> {
  const id = crypto.randomUUID()
  await withDatabase(async (database) => {
    await database.insert(users).values({
      id,
      email: account,
      passwordHash,
      emailVerifiedAt: new Date(),
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })
  return { id, email: account, displayName: account.split("@")[0] }
}

export async function listAccessLog(limit = 60): Promise<AccessEntry[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200)
  return withDatabase(async (database) => {
    const rows = await database
      .select()
      .from(accessAttempts)
      .orderBy(desc(accessAttempts.createdAt))
      .limit(safeLimit)

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as AttemptKind,
      account: row.account,
      area: row.area,
      origin: row.originHash,
      userAgent: row.userAgent,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
    }))
  })
}

export async function accessSummary(hours = 24): Promise<AccessSummary> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  return withDatabase(async (database) => {
    const rows = await database
      .select({
        kind: accessAttempts.kind,
        count: sql<number>`count(*)::int`,
      })
      .from(accessAttempts)
      .where(gte(accessAttempts.createdAt, since))
      .groupBy(accessAttempts.kind)

    const byKind = new Map(rows.map((row) => [row.kind, row.count]))
    const failed = byKind.get("login_failed") ?? 0
    const blocked = byKind.get("login_blocked") ?? 0
    const denied = byKind.get("restricted_denied") ?? 0
    const rejected = byKind.get("session_rejected") ?? 0
    return {
      total: rows.reduce((sum, row) => sum + row.count, 0),
      failed: failed + rejected,
      blocked,
      denied,
      windowHours: hours,
    }
  })
}
