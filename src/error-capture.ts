let lastCapturedError: { error: unknown; at: number } | undefined

const TTL_MS = 5_000

function record(error: unknown): void {
  lastCapturedError = { error, at: Date.now() }
}

const originalConsoleError = console.error.bind(console)

console.error = (...args: unknown[]) => {
  for (const arg of args) {
    if (arg instanceof Error) record(arg)
  }
  originalConsoleError(...args)
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined
    return undefined
  }

  const { error } = lastCapturedError
  lastCapturedError = undefined
  return error
}

/** Logs without feeding the consumed error back into the capture slot. */
export function logCapturedError(error: unknown): void {
  originalConsoleError(error)
}
