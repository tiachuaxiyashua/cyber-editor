import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformFlowAsset, PlatformRole, ProjectTemplatePackage } from '../../src/shared/types.js'

const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-platform-guard-user-data-'))
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

function createFlow(id: string): PlatformFlowAsset {
  return {
    id,
    kind: 'flow',
    name: 'Guarded Flow',
    description: 'Tests flow path guards.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: 'end', type: 'end', position: { x: 180, y: 0 }, data: { label: 'End' } }
    ],
    edges: [{ id: 'edge-start-end', source: 'start', target: 'end' }]
  }
}

function createRole(id: string): PlatformRole {
  return {
    id,
    name: 'Guarded Role',
    description: 'Tests role path guards.',
    promptHint: 'Keep runtime safe.',
    allowedSkillIds: [],
    allowedCapabilities: [],
    outputSchema: 'markdown',
    outputFormat: 'markdown',
    modelPolicy: {
      mode: 'fallback_to_active',
      preferredProfileIds: [],
      fallbackToActive: true
    }
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('PlatformService path segment guards', () => {
  it('rejects unsafe flow ids when saving flows', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js')
    const service = new PlatformService()
    const rootPath = tempRoot('cyber-editor-platform-flow-guard-')
    const escapedTarget = path.join(rootPath, '.project', 'platform', 'escaped.json')

    expect(() => service.saveFlow(rootPath, createFlow('../escaped'))).toThrow(/Flow id/)
    expect(fs.existsSync(escapedTarget)).toBe(false)
  })

  it('rejects unsafe flow ids when deleting flows', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js')
    const service = new PlatformService()
    const rootPath = tempRoot('cyber-editor-platform-delete-guard-')
    const protectedFile = path.join(rootPath, '.project', 'protected.json')
    fs.mkdirSync(path.dirname(protectedFile), { recursive: true })
    fs.writeFileSync(protectedFile, 'keep', 'utf8')

    expect(() => service.deleteFlow(rootPath, 'flow', '../../protected')).toThrow(/Flow id/)
    expect(fs.readFileSync(protectedFile, 'utf8')).toBe('keep')
  })

  it('rejects unsafe history version ids when restoring flows', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js')
    const service = new PlatformService()
    const rootPath = tempRoot('cyber-editor-platform-history-guard-')

    expect(() => service.restoreFlowVersion(rootPath, 'flow', 'safe-flow', '../history-escape')).toThrow(/version id/i)
  })

  it('rejects unsafe role ids before creating package directories', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js')
    const service = new PlatformService()
    const rootPath = tempRoot('cyber-editor-platform-role-guard-')
    const escapedRoleDir = path.join(rootPath, '.project', 'platform', 'escaped-role')

    expect(() => service.saveRoles(rootPath, [createRole('../escaped-role')])).toThrow(/Role id/)
    expect(fs.existsSync(escapedRoleDir)).toBe(false)
  })

  it('rejects unsafe flow ids during template bootstrap', async () => {
    const { PlatformService } = await import('../../src/main/services/platform-service.js')
    const service = new PlatformService()
    const rootPath = tempRoot('cyber-editor-platform-bootstrap-guard-')

    const templatePackage: ProjectTemplatePackage = {
      definition: {
        id: 'unsafe-template',
        name: 'Unsafe Template',
        shortDescription: 'Template for guard checks.',
        description: 'Template for guard checks.',
        icon: 'template',
        category: 'product',
        source: 'builtin',
        starterPrompt: 'Start',
        requirementDocName: 'requirements.md'
      },
      platform: {
        flows: [createFlow('../template-escape')],
        subflows: [],
        roles: [],
        taskTemplates: [],
        agentProfiles: [],
        connectors: [],
        tools: []
      },
      runtime: {
        promptProfiles: [],
        artifactSchemas: [],
        template: {} as never
      }
    }

    vi.spyOn(service, 'getTemplateDefinition').mockReturnValue(templatePackage.definition)
    vi.spyOn((service as any).templateRegistry, 'getTemplatePackage').mockReturnValue(templatePackage)

    expect(() => service.initializeProjectPlatform(rootPath, templatePackage.definition.id)).toThrow(/Flow id/)
  })
})
