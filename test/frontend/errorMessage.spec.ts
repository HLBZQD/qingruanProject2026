import { describe, it, expect } from 'vitest'
import { getErrorMessage } from '@/utils/errorMessage'

describe('getErrorMessage', () => {
  it('Axios error with data.error.message', () => {
    const err = {
      response: {
        data: {
          error: { message: '用户名已存在' }
        }
      }
    }
    expect(getErrorMessage(err)).toBe('用户名已存在')
  })

  it('Axios error with data.message (fallback path)', () => {
    const err = {
      response: {
        data: {
          message: '请求参数错误'
        }
      }
    }
    expect(getErrorMessage(err)).toBe('请求参数错误')
  })

  it('Axios error 优先取 error.message 而非 data.message', () => {
    const err = {
      response: {
        data: {
          error: { message: '优先错误' },
          message: '次级错误'
        }
      }
    }
    expect(getErrorMessage(err)).toBe('优先错误')
  })

  it('标准 Error 对象', () => {
    const err = new Error('网络连接失败')
    expect(getErrorMessage(err)).toBe('网络连接失败')
  })

  it('字符串错误', () => {
    expect(getErrorMessage('服务器错误')).toBe('服务器错误')
  })

  it('null 返回默认 fallback', () => {
    expect(getErrorMessage(null)).toBe('操作失败，请稍后重试')
  })

  it('undefined 返回默认 fallback', () => {
    expect(getErrorMessage(undefined)).toBe('操作失败，请稍后重试')
  })

  it('数字错误返回默认 fallback', () => {
    expect(getErrorMessage(500)).toBe('操作失败，请稍后重试')
  })

  it('空对象返回默认 fallback', () => {
    expect(getErrorMessage({})).toBe('操作失败，请稍后重试')
  })

  it('自定义 fallback', () => {
    expect(getErrorMessage(null, '自定义错误提示')).toBe('自定义错误提示')
  })

  it('response 为 null 的 Axios 风格错误走 fallback', () => {
    const err = { response: null }
    expect(getErrorMessage(err)).toBe('操作失败，请稍后重试')
  })

  it('response.data 为 null', () => {
    const err = { response: { data: null } }
    expect(getErrorMessage(err)).toBe('操作失败，请稍后重试')
  })

  it('response.data.error 存在但无 message', () => {
    const err = { response: { data: { error: {} } } }
    expect(getErrorMessage(err)).toBe('操作失败，请稍后重试')
  })
})
