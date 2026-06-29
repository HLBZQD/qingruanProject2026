// Vitest globals（describe/it/expect）已通过 vitest.config.ts 的 globals:true 注入，
// 后端 .js 文件无需、也不能 require('vitest')。
const { parsePagination, buildPagination } = require('../../server/utils/pagination')

describe('parsePagination', () => {
  it('无参数时返回默认第 1 页、每页 20 条', () => {
    expect(parsePagination({})).toMatchObject({ page: 1, pageSize: 20, offset: 0, limit: 20 })
  })

  it('正确解析 page 与 pageSize', () => {
    expect(parsePagination({ page: '3', pageSize: '15' }))
      .toMatchObject({ page: 3, pageSize: 15, offset: 30, limit: 15 })
  })

  it('pageSize 超过 100 时被截断为 100', () => {
    expect(parsePagination({ pageSize: '500' }).pageSize).toBe(100)
  })

  it('非正数 page/pageSize 回退到默认值', () => {
    expect(parsePagination({ page: '0', pageSize: '-1' }))
      .toMatchObject({ page: 1, pageSize: 20 })
  })
})

describe('buildPagination', () => {
  it('计算总页数向上取整', () => {
    expect(buildPagination(2, 20, 45)).toMatchObject({ totalPages: 3 })
  })

  it('总数为 0 时总页数为 0', () => {
    expect(buildPagination(1, 20, 0).totalPages).toBe(0)
  })
})
