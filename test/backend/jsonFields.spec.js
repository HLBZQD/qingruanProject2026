const { parseTags, serializeTags } = require('../../server/utils/jsonFields')

describe('parseTags', () => {
  it('合法 JSON 数组返回解析结果', () => {
    expect(parseTags('["饮食指导", "运动指南"]')).toEqual(['饮食指导', '运动指南'])
  })

  it('空数组 JSON 返回空数组', () => {
    expect(parseTags('[]')).toEqual([])
  })

  it('单元素数组返回正确结果', () => {
    expect(parseTags('["糖尿病知识科普"]')).toEqual(['糖尿病知识科普'])
  })

  it('空字符串返回空数组', () => {
    expect(parseTags('')).toEqual([])
  })

  it('null 返回空数组', () => {
    expect(parseTags(null)).toEqual([])
  })

  it('undefined 返回空数组', () => {
    expect(parseTags(undefined)).toEqual([])
  })

  it('非法 JSON 返回空数组', () => {
    expect(parseTags('not-valid-json')).toEqual([])
  })

  it('JSON 对象（非数组）返回空数组', () => {
    expect(parseTags('{"key": "value"}')).toEqual([])
  })

  it('JSON 数字（非数组）返回空数组', () => {
    expect(parseTags('123')).toEqual([])
  })
})

describe('serializeTags', () => {
  it('将数组序列化为 JSON 字符串', () => {
    expect(serializeTags(['饮食指导', '运动指南'])).toBe('["饮食指导","运动指南"]')
  })

  it('空数组返回 "[]"', () => {
    expect(serializeTags([])).toBe('[]')
  })

  it('单元素数组返回正确字符串', () => {
    expect(serializeTags(['糖尿病知识科普'])).toBe('["糖尿病知识科普"]')
  })
})
