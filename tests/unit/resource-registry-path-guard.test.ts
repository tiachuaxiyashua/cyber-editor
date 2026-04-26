import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectTemplatePackage, RolePackage, SkillPackage } from '../../src/shared/types.js'

const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-registry-path-guard-'))

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot,
    getAppPath: () => process.cwd()
  }
}))

function loadTemplateFixture(): ProjectTemplatePackage {
  const filePath = path.join(process.cwd(), 'src', 'shared', 'template-packages', 'software-factory.json')
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProjectTemplatePackage
}

beforeEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(path.join(userDataRoot, 'skills'), { recursive: true, force: true })
  fs.rmSync(path.join(userDataRoot, 'role-packages'), { recursive: true, force: true })
  fs.rmSync(path.join(userDataRoot, 'templates'), { recursive: true, force: true })
})

describe('resource registry path guards', () => {
  it('rejects absolute skill package file paths during parsing', async () => {
    const { parseSkillPackage } = await import('../../src/shared/skill-package.js')

    const payload = JSON.stringify({
      id: 'guarded-skill',
      name: 'Guarded Skill',
      version: '1.0.0',
      description: 'Reject absolute file paths.',
      source: 'local',
      applicableStages: ['discover'],
      files: [
        { path: 'C:/temp/escape.md', content: '# unsafe' }
      ]
    } satisfies SkillPackage)

    expect(() => parseSkillPackage(payload)).toThrow(/inside the package root|unsafe path/i)
  })

  it('rejects absolute role package file paths during parsing', async () => {
    const { parseRolePackage } = await import('../../src/shared/role-package.js')

    const payload = JSON.stringify({
      id: 'guarded-role',
      name: 'Guarded Role',
      version: '1.0.0',
      description: 'Reject absolute file paths.',
      source: 'local',
      files: [
        { path: 'C:/temp/role.json', content: '{}' }
      ]
    } satisfies RolePackage)

    expect(() => parseRolePackage(payload)).toThrow(/inside the package root|unsafe path/i)
  })

  it('rejects unsafe template flow ids during parsing', async () => {
    const { parseTemplatePackage } = await import('../../src/shared/template-package.js')
    const templatePackage = loadTemplateFixture()
    templatePackage.platform.flows[0] = {
      ...templatePackage.platform.flows[0],
      id: '../flow-escape'
    }

    expect(() => parseTemplatePackage(JSON.stringify(templatePackage))).toThrow(/Flow id/)
  })

  it('rejects unsafe skill ids during install and instruction reads', async () => {
    const { SkillRegistryService } = await import('../../src/main/services/skill-registry-service.js')
    const service = new SkillRegistryService()

    const unsafeSkill = {
      id: '../skill-escape',
      name: 'Unsafe Skill',
      version: '1.0.0',
      description: 'Unsafe id.',
      source: 'local',
      applicableStages: ['discover'],
      files: [{ path: 'SKILL.md', content: '# Unsafe' }]
    } satisfies SkillPackage

    expect(() => service.installPackage(unsafeSkill, 'local:test')).toThrow(/Skill id/)
    expect(() => service.readSkillInstructions(['../skill-escape'])).toThrow(/Skill id/)
  })

  it('rejects unsafe role package ids during install', async () => {
    const { RolePackageRegistryService } = await import('../../src/main/services/role-package-registry-service.js')
    const service = new RolePackageRegistryService()

    const unsafeRole = {
      id: '../role-escape',
      name: 'Unsafe Role',
      version: '1.0.0',
      description: 'Unsafe role id.',
      source: 'local',
      files: [
        { path: 'role.json', content: '{}' },
        { path: 'IDENTITY.md', content: '# Unsafe' },
        { path: 'AGENTS.md', content: '# Unsafe' }
      ]
    } satisfies RolePackage

    expect(() => service.installPackage(unsafeRole, 'local:test')).toThrow(/Role package id/)
  })

  it('rejects unsafe template ids during install', async () => {
    const { TemplateRegistryService } = await import('../../src/main/services/template-registry-service.js')
    const service = new TemplateRegistryService()
    const templatePackage = loadTemplateFixture()
    templatePackage.definition = {
      ...templatePackage.definition,
      id: '../template-escape'
    }

    expect(() => service.installPackageObject(templatePackage, 'local:test')).toThrow(/Template id/)
  })
})
