import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

/**
 * Contas de administrador da E.V.E.
 *
 * Um único papel existe hoje: quem entra vê a oficina de autoinspeção e o
 * registro de acessos. `email` é o identificador de acesso e nunca é usado
 * como chave de outros dados — `id` é a chave de propriedade.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
)

/**
 * Sessões opacas: o cookie carrega um token aleatório e o banco guarda só o
 * resumo (SHA-256) dele. Nenhuma sessão vive em memória de módulo.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    originHash: text("origin_hash"),
    userAgent: text("user_agent"),
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
)

/**
 * Registro de acessos: entrada aceita, tentativa falha, tentativa bloqueada
 * por excesso e acesso recusado a área restrita. É a fonte da vigilância que
 * a E.V.E. mostra no console.
 */
export const accessAttempts = pgTable(
  "access_attempts",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    account: text("account"),
    area: text("area"),
    originHash: text("origin_hash"),
    userAgent: text("user_agent"),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("access_attempts_created_idx").on(table.createdAt),
    index("access_attempts_kind_idx").on(table.kind),
  ],
)
