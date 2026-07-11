import { describe, it, expect, beforeEach, vi } from 'vitest'
import { hasAcceptedDisclaimer, setDisclaimerAccepted } from '@/composables/useUI'

// ---------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------
const localStorageStore: Record<string, string> = {}

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageStore[key] = value }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key] }),
})

// ---------------------------------------------------------------
// hasAcceptedDisclaimer
// ---------------------------------------------------------------

describe('hasAcceptedDisclaimer', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach(k => delete localStorageStore[k])
    vi.clearAllMocks()
  })

  it('localStorage 无记录时返回 false', () => {
    expect(hasAcceptedDisclaimer()).toBe(false)
  })

  it('localStorage 值为 "true" 时返回 true', () => {
    localStorageStore['disclaimer_accepted'] = 'true'
    expect(hasAcceptedDisclaimer()).toBe(true)
  })

  it('localStorage 值为其他字符串时返回 false', () => {
    localStorageStore['disclaimer_accepted'] = 'false'
    expect(hasAcceptedDisclaimer()).toBe(false)
  })

  it('localStorage 值为空字符串时返回 false', () => {
    localStorageStore['disclaimer_accepted'] = ''
    expect(hasAcceptedDisclaimer()).toBe(false)
  })
})

// ---------------------------------------------------------------
// setDisclaimerAccepted
// ---------------------------------------------------------------

describe('setDisclaimerAccepted', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach(k => delete localStorageStore[k])
    vi.clearAllMocks()
  })

  it('setDisclaimerAccepted(true) 写入 "true"', () => {
    setDisclaimerAccepted(true)
    expect(localStorageStore['disclaimer_accepted']).toBe('true')
  })

  it('setDisclaimerAccepted(false) 删除键', () => {
    localStorageStore['disclaimer_accepted'] = 'true'
    setDisclaimerAccepted(false)
    expect('disclaimer_accepted' in localStorageStore).toBe(false)
  })

  it('setDisclaimerAccepted(false) 在键不存在时不报错', () => {
    expect(() => setDisclaimerAccepted(false)).not.toThrow()
  })

  it('往返：setDisclaimerAccepted(true) 后 hasAcceptedDisclaimer 返回 true', () => {
    setDisclaimerAccepted(true)
    expect(hasAcceptedDisclaimer()).toBe(true)
  })

  it('往返：setDisclaimerAccepted(false) 后 hasAcceptedDisclaimer 返回 false', () => {
    setDisclaimerAccepted(true)
    setDisclaimerAccepted(false)
    expect(hasAcceptedDisclaimer()).toBe(false)
  })
})
