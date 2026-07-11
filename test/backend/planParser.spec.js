const { parsePlanOutput } = require('../../server/utils/planParser')

// parsePlanOutput 是异步函数，需 mock callWorkflowFn

describe('parsePlanOutput — JSON 解析', () => {
  it('合法 JSON 数组直接解析成功', async () => {
    const outputs = JSON.stringify([
      { plan_type: 'diet', order_num: 1, time_desc: '07:30', title: '早餐', content: '全麦面包 + 牛奶' },
      { plan_type: 'diet', order_num: 2, time_desc: '12:00', title: '午餐', content: '糙米饭 + 鸡胸肉' },
      { plan_type: 'diet', order_num: 3, time_desc: '18:00', title: '晚餐', content: '蔬菜沙拉' },
      { plan_type: 'diet', order_num: 4, time_desc: '15:00', title: '加餐', content: '苹果一个' },
      { plan_type: 'exercise', order_num: 1, time_desc: '06:30', title: '晨跑', content: '慢跑 30 分钟' },
      { plan_type: 'exercise', order_num: 2, time_desc: '19:00', title: '晚间散步', content: '散步 45 分钟' },
      { plan_type: 'exercise', order_num: 3, time_desc: '周六', title: '周末运动', content: '游泳 1 小时' }
    ])

    const mockCallWorkflow = async () => {
      throw new Error('不应被调用')
    }

    const result = await parsePlanOutput(outputs, 'fake-key', mockCallWorkflow, {})
    expect(result.parseMethod).toBe('json')
    expect(result.items).toHaveLength(7)
    expect(result.items[0]).toMatchObject({
      plan_type: 'diet',
      order_num: 1,
      title: '早餐'
    })
  })

  it('JSON 数组但缺少必填字段时回退到 regex 解析', async () => {
    const outputs = '[{"plan_type":"diet","title":"missing content"}]'

    const mockCallWorkflow = async () => {
      throw new Error('不应被调用')
    }

    // 这个 JSON 缺少 content 字段，regex 也无法匹配（因为 regex 也匹配不到 content）
    // 最终会尝试 llm_retry，所以需要 mock callWorkflowFn
    const mockRetry = async () => ({
      data: { outputs: { text: JSON.stringify([{ plan_type: 'diet', order_num: 1, time_desc: '', title: '早餐', content: '重试生成' }]) } }
    })

    const result = await parsePlanOutput(outputs, 'fake-key', mockRetry, {})
    expect(result.parseMethod).toBe('llm_retry')
  })

  it('空数组 JSON（[]）回退到 llm_retry', async () => {
    const mockRetry = async () => ({
      data: { outputs: { text: JSON.stringify([{ plan_type: 'diet', order_num: 1, time_desc: '', title: '早餐', content: '内容' }]) } }
    })

    const result = await parsePlanOutput('[]', 'fake-key', mockRetry, {})
    expect(result.parseMethod).toBe('llm_retry')
  })
})

describe('parsePlanOutput — Regex 解析', () => {
  it('非 JSON 但含合法对象模式时 regex 解析成功', async () => {
    const outputs = `以下是您的生活方案：
    {"plan_type":"diet","order_num":1,"time_desc":"07:30","title":"早餐","content":"全麦面包+牛奶"}
    {"plan_type":"diet","order_num":2,"time_desc":"12:00","title":"午餐","content":"糙米饭+鸡胸肉"}`

    const mockCallWorkflow = async () => {
      throw new Error('不应被调用')
    }

    const result = await parsePlanOutput(outputs, 'fake-key', mockCallWorkflow, {})
    expect(result.parseMethod).toBe('regex')
    expect(result.items).toHaveLength(2)
    expect(result.items[0].plan_type).toBe('diet')
    expect(result.items[0].title).toBe('早餐')
    expect(result.items[1].title).toBe('午餐')
  })

  it('非 JSON 且无合法模式时回退到 llm_retry', async () => {
    const outputs = '这是一段无法解析的文本'

    const mockRetry = async () => ({
      data: { outputs: { text: JSON.stringify([{ plan_type: 'diet', order_num: 1, time_desc: '', title: '早餐', content: '内容' }]) } }
    })

    const result = await parsePlanOutput(outputs, 'fake-key', mockRetry, {})
    expect(result.parseMethod).toBe('llm_retry')
  })
})

describe('parsePlanOutput — LLM 重试', () => {
  it('重试返回合法 JSON 数组时解析成功', async () => {
    const outputs = '无法解析'

    const mockRetry = async (apiKey, inputs) => {
      expect(inputs.__retry_mode).toBe(true)
      expect(inputs.__retry_parse).toBe('无法解析')
      return {
        data: {
          outputs: {
            text: JSON.stringify([
              { plan_type: 'diet', order_num: 1, time_desc: '08:00', title: '早餐', content: '燕麦粥' }
            ])
          }
        }
      }
    }

    const result = await parsePlanOutput(outputs, 'fake-key', mockRetry, { original: 'inputs' })
    expect(result.parseMethod).toBe('llm_retry')
    expect(result.items[0].title).toBe('早餐')
  })

  it('JSON+Regex+重试 全部失败抛出 PLAN_PARSE_ERROR', async () => {
    const mockRetry = async () => {
      throw new Error('Dify 调用失败')
    }

    try {
      await parsePlanOutput('无法解析的文本...', 'fake-key', mockRetry, {})
      fail('应该抛出异常')
    } catch (e) {
      expect(e.code).toBe('PLAN_PARSE_ERROR')
      expect(e.statusCode).toBe(502)
    }
  })
})
