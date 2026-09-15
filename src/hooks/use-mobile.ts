import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// One MediaQueryList backs both the subscription and the read, so the value
// React renders can only move when the subscription has announced it. Built
// lazily: the module is imported during SSR, where `window` does not exist.
let mediaQuery: MediaQueryList | undefined
function getMediaQuery() {
  mediaQuery ??= window.matchMedia(MOBILE_QUERY)
  return mediaQuery
}

function subscribe(onChange: () => void) {
  const mql = getMediaQuery()
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot() {
  return getMediaQuery().matches
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
