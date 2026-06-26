const LABELS: Record<string, Record<string, string>> = {
  gender: { male: '男', female: '女' },
  family_history: { yes: '有', no: '无' },
  diabetes_history: { healthy: '健康', prediabetes: '糖尿病前期', diagnosed: '已确诊' },
  diabetes_type: { type1: '1型糖尿病', type2: '2型糖尿病', gestational: '妊娠期糖尿病', other: '其他特殊类型' },
  risk_level: { low: '低风险', medium: '中风险', high: '高风险' },
}

export function enumLabel(category: string, value: string): string {
  return LABELS[category]?.[value] ?? value
}
