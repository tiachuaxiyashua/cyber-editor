import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()

function collectMirrorFiles(relativeRoot: string): string[] {
  const root = path.join(repoRoot, relativeRoot)
  const mirrors: string[] = []
  if (!fs.existsSync(root)) {
    return mirrors
  }

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(repoRoot, fullPath).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.vite' ||
          relativePath.startsWith('src/renderer/public')
        ) {
          continue
        }
        walk(fullPath)
        continue
      }

      if (!entry.name.endsWith('.js')) {
        continue
      }

      const tsPath = fullPath.replace(/\.js$/, '.ts')
      const tsxPath = fullPath.replace(/\.js$/, '.tsx')
      if (fs.existsSync(tsPath) || fs.existsSync(tsxPath)) {
        mirrors.push(relativePath)
      }
    }
  }

  walk(root)
  return mirrors
}

describe('source mirror hygiene', () => {
  it('does not keep generated js mirrors next to ts or tsx source files', () => {
    expect(collectMirrorFiles('src/main')).toEqual([])
    expect(collectMirrorFiles('src/renderer')).toEqual([])
    expect(collectMirrorFiles('src/shared')).toEqual([])
    expect(collectMirrorFiles('tests/unit')).toEqual([])
  })

  it('does not keep renderer vite output inside the source tree', () => {
    const viteDir = path.join(repoRoot, 'src', 'renderer', '.vite')
    expect(fs.existsSync(viteDir)).toBe(false)
  })
})
