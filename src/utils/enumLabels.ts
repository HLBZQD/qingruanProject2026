const LABELS = {
  gender: {
    male: '男',
    female: '女',
  },
  family_history: {
    yes: '有',
    no: '无',
  },
  diabetes_history: {
    healthy: '健康',
    prediabetes: '糖尿病前期',
    diagnosed: '已确诊',
  },
  diabetes_type: {
    type1: '1型糖尿病',
    type2: '2型糖尿病',
    gestational: '妊娠期糖尿病',
    other: '其他特殊类型',
  },
  risk_level: {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
  },
  plan_type: {
    diet: '饮食',
    exercise: '运动',
    other: '其他',
  },
  punch_type: {
    diet: '饮食',
    exercise: '运动',
  },
  completion_status: {
    completed: '已完成',
    uncompleted: '未完成',
  },
} as const satisfies Record<string, Record<string, string>>

export function enumLabel(category: string, value: string): string {
  const group = (LABELS as Record<string, Record<string, string>>)[category]
  return group?.[value] ?? value
}
