import type { UserProfile } from '@/stores/userProfile'

/**
 * 构建用户画像的 Prompt 描述
 * 可选用于前端组装发送给后端的结构化数据
 */
export function buildProfilePrompt(profile: UserProfile): string {
  const parts: string[] = []

  // 基本信息
  const { demographics } = profile
  if (demographics.age || demographics.gender) {
    let basicInfo = '基本信息：'
    if (demographics.age) basicInfo += `${demographics.age}岁`
    if (demographics.gender) basicInfo += demographics.gender === 'male' ? '男性' : '女性'
    if (demographics.livingStatus) {
      const livingMap: Record<string, string> = {
        alone: '独居',
        with_spouse: '与配偶同住',
        with_children: '与子女同住',
        nursing_home: '养老机构'
      }
      basicInfo += `，${livingMap[demographics.livingStatus] || demographics.livingStatus}`
    }
    parts.push(basicInfo)
  }

  // BADL 评估
  const { badl } = profile.functionalStatus
  const badlLabels: Record<string, string> = {
    bathing: '洗澡',
    dressing: '穿衣',
    toileting: '如厕',
    transfer: '移动',
    continence: '排便控制',
    feeding: '进食'
  }
  const badlItems = Object.entries(badl)
    .filter(([_, value]) => value !== null)
    .map(([key, value]) => `${badlLabels[key]}(${value})`)

  if (badlItems.length > 0) {
    parts.push(`BADL评分：${badlItems.join('、')}`)
  }

  // IADL 评估
  const { iadl } = profile.functionalStatus
  const iadlLabels: Record<string, string> = {
    visiting: '探访',
    shopping: '购物',
    cooking: '做饭',
    washing: '洗衣',
    walking: '步行',
    lifting: '提物',
    crouching: '蹲下',
    transport: '乘车'
  }
  const iadlItems = Object.entries(iadl)
    .filter(([_, value]) => value !== null)
    .map(([key, value]) => `${iadlLabels[key]}(${value})`)

  if (iadlItems.length > 0) {
    parts.push(`IADL评分：${iadlItems.join('、')}`)
  }

  // 慢性病
  const { healthFactors } = profile
  if (healthFactors.chronicDiseases.length > 0) {
    const diseaseLabels: Record<string, string> = {
      hypertension: '高血压',
      diabetes: '糖尿病',
      heart_disease: '心脏病',
      stroke: '中风史',
      cancer: '癌症',
      arthritis: '关节炎',
      respiratory: '呼吸系统疾病',
      dementia: '痴呆',
      other: '其他'
    }
    const diseases = healthFactors.chronicDiseases
      .map(d => diseaseLabels[d] || d)
    parts.push(`慢性病：${diseases.join('、')}`)
  }

  // 情绪与认知
  if (healthFactors.mood) {
    const moodLabels: Record<string, string> = {
      normal: '正常',
      depression: '抑郁倾向',
      anxiety: '焦虑倾向',
      both: '抑郁+焦虑'
    }
    parts.push(`情绪状态：${moodLabels[healthFactors.mood] || healthFactors.mood}`)
  }

  if (healthFactors.cognition) {
    const cogLabels: Record<string, string> = {
      normal: '正常',
      mild_impairment: '轻度认知障碍',
      moderate_impairment: '中度认知障碍',
      severe_impairment: '重度认知障碍'
    }
    parts.push(`认知状态：${cogLabels[healthFactors.cognition] || healthFactors.cognition}`)
  }

  // 跌倒史
  if (healthFactors.fallHistory !== null) {
    parts.push(`跌倒史：${healthFactors.fallHistory ? '有' : '无'}`)
  }

  // 生活方式
  const { lifestyle } = profile
  const lifestyleItems: string[] = []

  if (lifestyle.exercise) {
    const exerciseLabels: Record<string, string> = {
      regular: '规律运动',
      occasional: '偶尔运动',
      none: '不运动'
    }
    lifestyleItems.push(exerciseLabels[lifestyle.exercise] || lifestyle.exercise)
  }

  if (lifestyle.sleep) {
    const sleepLabels: Record<string, string> = {
      good: '睡眠良好',
      fair: '睡眠一般',
      poor: '睡眠较差'
    }
    lifestyleItems.push(sleepLabels[lifestyle.sleep] || lifestyle.sleep)
  }

  if (lifestyleItems.length > 0) {
    parts.push(`生活方式：${lifestyleItems.join('、')}`)
  }

  return parts.join('\n')
}

/**
 * 构建评估数据的 JSON 结构 (用于发送给后端)
 */
export function buildProfileJSON(profile: UserProfile): object {
  return {
    demographics: {
      trueage: profile.demographics.age,
      a1: profile.demographics.gender === 'male' ? 1 : 2,
      living_status: profile.demographics.livingStatus,
      education: profile.demographics.education,
      marital_status: profile.demographics.maritalStatus
    },
    functional_status: {
      badl: profile.functionalStatus.badl,
      iadl: profile.functionalStatus.iadl
    },
    health_factors: {
      chronic_diseases: profile.healthFactors.chronicDiseases,
      mood: profile.healthFactors.mood,
      cognition: profile.healthFactors.cognition,
      vision: profile.healthFactors.vision,
      hearing: profile.healthFactors.hearing,
      fall_history: profile.healthFactors.fallHistory
    },
    lifestyle: profile.lifestyle,
    social_support: profile.socialSupport
  }
}
