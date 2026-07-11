import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SkeletonLoader from '@/components/SkeletonLoader.vue'

describe('SkeletonLoader.vue', () => {
  // ---------------------------------------------------------------
  // 默认渲染
  // ---------------------------------------------------------------
  describe('默认渲染', () => {
    it('默认 type="list" 且 rows=3', () => {
      const wrapper = mount(SkeletonLoader)
      // list 模式下渲染 skeleton-list-item
      const items = wrapper.findAll('.skeleton-list-item')
      expect(items).toHaveLength(3)
    })

    it('渲染 role="status" 与 aria-label="加载中"', () => {
      const wrapper = mount(SkeletonLoader)
      const root = wrapper.find('.skeleton-loader')
      expect(root.attributes('role')).toBe('status')
      expect(root.attributes('aria-label')).toBe('加载中')
    })
  })

  // ---------------------------------------------------------------
  // type 变体
  // ---------------------------------------------------------------
  describe('type 变体', () => {
    it('type="text" 渲染文本行骨架', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'text', rows: 2 } })
      const lines = wrapper.findAll('.skeleton-line')
      expect(lines).toHaveLength(2)
      // 最后一行宽度为 60%
      expect(lines[1].attributes('style')).toContain('width: 60%')
    })

    it('type="text" 首行宽度为 100%', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'text', rows: 3 } })
      const lines = wrapper.findAll('.skeleton-line')
      expect(lines[0].attributes('style')).toContain('width: 100%')
    })

    it('type="list" 渲染列表项骨架', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'list', rows: 2 } })
      expect(wrapper.findAll('.skeleton-list-item')).toHaveLength(2)
    })

    it('type="list" + avatar=true 渲染头像骨架', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'list', rows: 2, avatar: true } })
      expect(wrapper.findAll('.skeleton-avatar')).toHaveLength(2)
      // avatar=true 时不渲染第三行（v-if="!avatar"）
      const firstItem = wrapper.findAll('.skeleton-list-item')[0]
      expect(firstItem.findAll('.skeleton-line')).toHaveLength(2)
    })

    it('type="list" + avatar=false 渲染三行 skeleton-line', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'list', rows: 1 } })
      const lines = wrapper.find('.skeleton-list-item').findAll('.skeleton-line')
      expect(lines).toHaveLength(3)
    })

    it('type="card" 渲染卡片骨架', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'card', rows: 2 } })
      expect(wrapper.findAll('.skeleton-card')).toHaveLength(2)
    })

    it('type="card" + avatar=true 渲染卡片头像', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'card', rows: 1, avatar: true } })
      expect(wrapper.find('.skeleton-card-header').find('.skeleton-avatar').exists()).toBe(true)
    })

    it('type="card" + avatar=false 不渲染头像', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'card', rows: 1, avatar: false } })
      expect(wrapper.find('.skeleton-card-header').find('.skeleton-avatar').exists()).toBe(false)
    })

    it('type="article" 渲染文章卡片骨架（含封面）', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'article', rows: 2 } })
      expect(wrapper.findAll('.skeleton-article')).toHaveLength(2)
      expect(wrapper.findAll('.skeleton-cover')).toHaveLength(2)
    })

    it('type="custom" 渲染插槽内容', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { type: 'custom' },
        slots: { default: '<div class="custom-content">自定义加载中...</div>' },
      })
      expect(wrapper.find('.custom-content').exists()).toBe(true)
      expect(wrapper.find('.custom-content').text()).toBe('自定义加载中...')
    })
  })

  // ---------------------------------------------------------------
  // rows prop
  // ---------------------------------------------------------------
  describe('rows prop', () => {
    it('rows=5 时渲染 5 行', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'text', rows: 5 } })
      expect(wrapper.findAll('.skeleton-line')).toHaveLength(5)
    })

    it('rows=1 时渲染 1 行', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'list', rows: 1 } })
      expect(wrapper.findAll('.skeleton-list-item')).toHaveLength(1)
    })

    it('rows=0 时不渲染任何骨架项', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'list', rows: 0 } })
      expect(wrapper.findAll('.skeleton-list-item')).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------
  // 边界 & 组合
  // ---------------------------------------------------------------
  describe('边界条件', () => {
    it('type="article" + rows=0 不渲染任何项', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'article', rows: 0 } })
      expect(wrapper.findAll('.skeleton-article')).toHaveLength(0)
    })

    it('type="card" + 大量行数', () => {
      const wrapper = mount(SkeletonLoader, { props: { type: 'card', rows: 20 } })
      expect(wrapper.findAll('.skeleton-card')).toHaveLength(20)
    })
  })
})
