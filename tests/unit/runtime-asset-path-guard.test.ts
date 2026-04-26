import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformAssets, ProjectTemplatePackage } from '../../src/shared/types.js'

const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-runtime-asset-guard-'))
const tempRoots: string[] = []

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot,
    getAppPath: () => process.cwd()
  }
}))

function tempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

function loadTemplateFixture(): ProjectTemplatePackage {
  const filePath = path.join(process.cwd(), 'src', 'shared', 'template-packages', 'software-factory.json')
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProjectTemplatePackage
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('RuntimeAssetService path guards', () => {
  it('rejects unsafe runtime template ids when saving templates', async () => {
    const { RuntimeAssetService } = await import('../../src/main/services/runtime-asset-service.js')
    const service = new RuntimeAssetService()
    const rootPath = tempRoot('cyber-editor-runtime-template-guard-')
    const templatePackage = loadTemplateFixture()

    const unsafeTemplate = {
      ...templatePackage.runtime.template,
      id: '../template-escape'
    }
    const platformAssets = {
      template: null,
      ...templatePackage.platform
    } satisfies PlatformAssets

    expect(() => service.saveTemplate(rootPath, unsafeTemplate as any, platformAssets)).toThrow(/Runtime template id/)
  })

  it('rejects unsafe runtime run ids when saving runs', async () => {
    const { RuntimeAssetService } = await import('../../src/main/services/runtime-asset-service.js')
    const service = new RuntimeAssetService()
    const rootPath = tempRoot('cyber-editor-runtime-run-guard-')

    expect(() => service.saveRun(rootPath, {
      id: '../run-escape'
    } as any)).toThrow(/Runtime run id/)
  })
})
