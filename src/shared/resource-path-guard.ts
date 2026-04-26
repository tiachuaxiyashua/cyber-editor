import path from 'node:path'

const RESERVED_SEGMENT_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const FORBIDDEN_SEGMENT_PATTERN = /[<>:"|?*\u0000-\u001F]/
const FORBIDDEN_FILESAFE_SEGMENT_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/

export function assertSafeFilePathSegment(value: string, label: string) {
  const segment = value.trim()
  if (!segment || segment !== value) {
    throw new Error(`${label} must be a non-empty file-safe identifier.`)
  }
  if (
    segment === '.'
    || segment === '..'
    || path.posix.isAbsolute(segment)
    || path.win32.isAbsolute(segment)
    || FORBIDDEN_FILESAFE_SEGMENT_PATTERN.test(segment)
    || /[.\s]$/.test(segment)
    || RESERVED_SEGMENT_PATTERN.test(segment)
  ) {
    throw new Error(`${label} contains unsafe path characters.`)
  }
  return segment
}

export function normalizeSafeRelativePackagePath(value: string, label: string) {
  const normalized = value.replace(/\\/g, '/').trim()
  if (!normalized) {
    throw new Error(`${label} must be a non-empty relative path.`)
  }
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(value)) {
    throw new Error(`${label} must stay inside the package root.`)
  }

  const segments = normalized.split('/')
  if (
    segments.some((segment) =>
      !segment
      || segment === '.'
      || segment === '..'
      || FORBIDDEN_SEGMENT_PATTERN.test(segment)
      || /[.\s]$/.test(segment)
      || RESERVED_SEGMENT_PATTERN.test(segment)
    )
  ) {
    throw new Error(`${label} contains unsafe path characters.`)
  }

  return segments.join('/')
}
