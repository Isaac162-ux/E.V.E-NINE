import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import postcss from "postcss"

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url))

async function findCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) return findCssFiles(target)
      return entry.isFile() && entry.name.endsWith(".css") ? [target] : []
    }),
  )
  return files.flat()
}

function hasAncestorAtRule(rule, predicate) {
  let parent = rule.parent
  while (parent) {
    if (parent.type === "atrule" && predicate(parent.name.toLowerCase())) {
      return true
    }
    parent = parent.parent
  }
  return false
}

export function findUnlayeredRules(source, from = "<css>") {
  const root = postcss.parse(source, { from })
  const violations = []

  root.walkRules((rule) => {
    const inLayer = hasAncestorAtRule(rule, (name) => name === "layer")
    const inKeyframes = hasAncestorAtRule(rule, (name) =>
      name.endsWith("keyframes"),
    )
    if (!inLayer && !inKeyframes) {
      violations.push({
        line: rule.source?.start?.line ?? 1,
        selector: rule.selector,
      })
    }
  })

  return violations
}

async function main() {
  const cssFiles = await findCssFiles(sourceRoot)
  let failed = false

  for (const file of cssFiles) {
    const source = await readFile(file, "utf8")
    for (const violation of findUnlayeredRules(source, file)) {
      failed = true
      const relative = path.relative(process.cwd(), file)
      console.error(
        `${relative}:${violation.line}: CSS rule must be inside an @layer block: ${violation.selector}`,
      )
    }
  }

  if (failed) process.exitCode = 1
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main()
}
