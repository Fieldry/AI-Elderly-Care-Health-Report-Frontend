export type ProfileRecord = Record<string, unknown>

export type ProfileFieldType = 'text' | 'number' | 'select'

export interface ProfileFieldDefinition {
  key: string
  label: string
  group: string
  type: ProfileFieldType
  placeholder?: string
  options?: string[]
}

const yesNoOptions = ['是', '否']
const basicFields: ProfileFieldDefinition[] = [
  { key: 'age', label: '年龄', group: '基本信息', type: 'number', placeholder: '例如 82' },
  { key: 'sex', label: '性别', group: '基本信息', type: 'select', options: ['男', '女'] },
  { key: 'residence', label: '居住地类型', group: '基本信息', type: 'select', options: ['城市', '农村'] },
  { key: 'education_years', label: '受教育年限', group: '基本信息', type: 'number', placeholder: '例如 6' },
  {
    key: 'marital_status',
    label: '婚姻状况',
    group: '基本信息',
    type: 'select',
    options: ['已婚', '丧偶', '离婚', '未婚', '其他']
  }
]

const bodyFields: ProfileFieldDefinition[] = [
  { key: 'weight', label: '体重(kg)', group: '身体指标', type: 'number', placeholder: '例如 56' },
  { key: 'height', label: '身高(cm)', group: '身体指标', type: 'number', placeholder: '例如 165' },
  { key: 'vision', label: '视力情况', group: '身体指标', type: 'select', options: ['好', '一般', '差'] },
  { key: 'hearing', label: '听力情况', group: '身体指标', type: 'select', options: ['好', '一般', '差'] },
  { key: 'waist_circumference', label: '腰围(cm)', group: '身体指标', type: 'number', placeholder: '例如 82' },
  { key: 'hip_circumference', label: '臀围(cm)', group: '身体指标', type: 'number', placeholder: '例如 94' }
]

const healthFields: ProfileFieldDefinition[] = [
  {
    key: 'health_limitation',
    label: '健康限制',
    group: '健康限制',
    type: 'select',
    options: ['完全没有影响', '有一点影响', '影响比较明显', '影响很大']
  }
]

const badlFields: ProfileFieldDefinition[] = [
  'badl_bathing',
  'badl_dressing',
  'badl_toileting',
  'badl_transferring',
  'badl_continence',
  'badl_eating'
].map((key, index) => ({
  key,
  label: ['洗澡', '穿衣', '上厕所', '室内走动', '大小便控制', '吃饭'][index],
  group: '基本生活能力',
  type: 'select',
  options: ['不需要帮助', '需要别人搭把手', '大部分要靠别人帮忙']
}))

const iadlFields: ProfileFieldDefinition[] = [
  'iadl_visiting',
  'iadl_shopping',
  'iadl_cooking',
  'iadl_laundry',
  'iadl_walking',
  'iadl_carrying',
  'iadl_crouching',
  'iadl_transport'
].map((key, index) => ({
  key,
  label: ['串门/走亲戚', '买东西', '做饭', '洗衣服', '走1公里路', '提约5斤重的东西', '蹲下再站起来', '坐公共交通'][index],
  group: '工具性活动',
  type: 'select',
  options: ['能自己做', '做起来有点困难', '现在做不了']
}))

const chronicBaseFields: Array<[string, string]> = [
  ['chronic_disease_any', '是否有慢性病'],
  ['hypertension', '高血压'],
  ['coronary_heart_disease', '冠心病'],
  ['heart_failure', '心力衰竭'],
  ['arrhythmia', '心律失常'],
  ['stroke', '中风或脑血管疾病'],
  ['diabetes', '糖尿病'],
  ['hyperlipidemia', '高血脂'],
  ['thyroid_disease', '甲状腺疾病'],
  ['chronic_lung_disease', '慢性肺病'],
  ['tuberculosis', '肺结核'],
  ['cataract', '白内障'],
  ['glaucoma', '青光眼'],
  ['hearing_impairment', '听力障碍'],
  ['peptic_ulcer', '胃肠溃疡'],
  ['cholecystitis_gallstones', '胆囊炎或胆石症'],
  ['chronic_kidney_disease', '慢性肾病'],
  ['hepatitis', '肝炎'],
  ['chronic_liver_disease', '慢性肝病'],
  ['parkinsons_disease', '帕金森病'],
  ['dementia', '痴呆或阿尔茨海默病'],
  ['epilepsy', '癫痫'],
  ['arthritis', '关节炎'],
  ['rheumatism_rheumatoid', '风湿或类风湿'],
  ['osteoporosis', '骨质疏松'],
  ['pressure_ulcer', '褥疮'],
  ['cancer', '癌症或恶性肿瘤'],
  ['cancer_type', '癌症类型'],
  ['frailty', '衰弱'],
  ['fall_history', '跌倒史'],
  ['disability', '失能'],
  ['malnutrition', '营养不良'],
  ['other_chronic_note', '其他慢性病补充'],
  ['prostate_disease', '前列腺疾病'],
  ['breast_disease', '乳腺疾病'],
  ['uterine_fibroids', '子宫肌瘤']
]

const chronicFields: ProfileFieldDefinition[] = chronicBaseFields.map(([key, label]) => ({
  key,
  label,
  group: '慢性病情况',
  type: key === 'chronic_disease_any'
    ? 'select'
    : key === 'cancer_type' || key === 'other_chronic_note'
      ? 'text'
      : 'select',
  options: key === 'chronic_disease_any' ? ['有', '没有', '记不清'] : key === 'cancer_type' || key === 'other_chronic_note' ? undefined : yesNoOptions,
  placeholder: key === 'cancer_type' || key === 'other_chronic_note' ? '请补充说明' : undefined
}))

const cognitionFields: ProfileFieldDefinition[] = [
  { key: 'cognition_time', label: '日期定向', group: '认知功能', type: 'select', options: ['正确', '错误', '不知道'] },
  { key: 'cognition_month', label: '月份定向', group: '认知功能', type: 'select', options: ['正确', '错误', '不知道'] },
  { key: 'cognition_season', label: '季节定向', group: '认知功能', type: 'select', options: ['正确', '错误', '不知道'] },
  { key: 'cognition_place', label: '地点定向', group: '认知功能', type: 'select', options: ['正确', '错误', '不知道'] },
  { key: 'cognition_calc', label: '计算能力', group: '认知功能', type: 'text', placeholder: '例如 正确,正确,错误' }
]

const moodFields: ProfileFieldDefinition[] = [
  { key: 'depression', label: '抑郁感', group: '心理状态', type: 'select', options: ['从不', '很少', '有时', '经常'] },
  { key: 'anxiety', label: '焦虑感', group: '心理状态', type: 'select', options: ['从不', '很少', '有时', '经常'] },
  { key: 'loneliness', label: '孤独感', group: '心理状态', type: 'select', options: ['从不', '很少', '有时', '经常'] }
]

const lifestyleFields: ProfileFieldDefinition[] = [
  { key: 'smoking', label: '吸烟', group: '生活方式', type: 'select', options: ['从不', '已戒', '偶尔', '每天'] },
  { key: 'drinking', label: '饮酒', group: '生活方式', type: 'select', options: ['从不', '已戒', '偶尔', '每天'] },
  { key: 'exercise', label: '锻炼', group: '生活方式', type: 'select', options: ['从不', '很少', '有时', '经常'] },
  { key: 'sleep_quality', label: '睡眠质量', group: '生活方式', type: 'select', options: ['很好', '好', '一般', '差', '很差'] }
]

const supportFields: ProfileFieldDefinition[] = [
  { key: 'living_arrangement', label: '居住安排', group: '社会支持', type: 'select', options: ['独居', '和老伴', '和子女', '和老伴及子女', '住养老院'] },
  { key: 'caregiver', label: '主要照护者', group: '社会支持', type: 'select', options: ['子女', '老伴', '保姆', '自己', '无人', '其他'] },
  { key: 'financial_status', label: '经济状况', group: '社会支持', type: 'select', options: ['很好', '好', '一般', '差', '很差'] },
  { key: 'medical_insurance', label: '医保情况', group: '社会支持', type: 'text', placeholder: '例如 城乡居民医保' }
]

export const PROFILE_FIELDS: ProfileFieldDefinition[] = [
  ...basicFields,
  ...bodyFields,
  ...healthFields,
  ...badlFields,
  ...iadlFields,
  ...chronicFields,
  ...cognitionFields,
  ...moodFields,
  ...lifestyleFields,
  ...supportFields
]

export const PROFILE_FIELD_LABELS = Object.fromEntries(
  PROFILE_FIELDS.map((field) => [field.key, field.label])
) as Record<string, string>

export const PROFILE_GROUPS = Array.from(new Set(PROFILE_FIELDS.map((field) => field.group)))

const CORE_PROGRESS_KEYS = [
  'age',
  'sex',
  'residence',
  'health_limitation',
  'chronic_disease_any',
  'cognition_time',
  'exercise',
  'sleep_quality',
  'living_arrangement',
  'caregiver',
  'medical_insurance'
]

function hasDisplayValue(value: unknown) {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  return true
}

export function isFilledValue(value: unknown) {
  return hasDisplayValue(value)
}

export function formatProfileValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '未填写'
  }
  return String(value)
}

export function getFilledProfileEntries(profile: ProfileRecord) {
  return PROFILE_FIELDS.filter((field) => hasDisplayValue(profile[field.key])).map((field) => ({
    ...field,
    value: formatProfileValue(profile[field.key])
  }))
}

export function estimateProfileCompletion(profile: ProfileRecord) {
  const filledCount = CORE_PROGRESS_KEYS.filter((key) => hasDisplayValue(profile[key])).length
  return filledCount / CORE_PROGRESS_KEYS.length
}

export function getMissingCoreFields(profile: ProfileRecord) {
  return CORE_PROGRESS_KEYS.filter((key) => !hasDisplayValue(profile[key])).map(
    (key) => PROFILE_FIELD_LABELS[key] || key
  )
}

export function groupProfileEntries(profile: ProfileRecord) {
  const grouped = new Map<string, Array<{ key: string; label: string; value: string }>>()

  for (const entry of getFilledProfileEntries(profile)) {
    const currentEntries = grouped.get(entry.group) || []
    currentEntries.push({
      key: entry.key,
      label: entry.label,
      value: entry.value
    })
    grouped.set(entry.group, currentEntries)
  }

  return PROFILE_GROUPS.map((group) => ({
    group,
    entries: grouped.get(group) || []
  })).filter((item) => item.entries.length > 0)
}

export function cloneProfileForForm(profile: ProfileRecord) {
  const nextProfile: ProfileRecord = {}

  for (const field of PROFILE_FIELDS) {
    const currentValue = profile[field.key]
    nextProfile[field.key] =
      currentValue === null || currentValue === undefined ? '' : currentValue
  }

  return nextProfile
}

export function getIdentityTitle(profile: ProfileRecord, fallback: string) {
  const name = typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : ''
  if (name) {
    return name
  }

  const age = profile.age ? `${profile.age}岁` : ''
  const sex = typeof profile.sex === 'string' ? profile.sex : ''
  const summary = [age, sex].filter(Boolean).join(' / ')
  return summary || fallback
}

export function serializeProfilePayload(profile: ProfileRecord) {
  const payload: ProfileRecord = {}

  for (const field of PROFILE_FIELDS) {
    const rawValue = profile[field.key]

    if (rawValue === null || rawValue === undefined) {
      continue
    }

    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (!trimmed) {
        continue
      }

      if (field.type === 'number') {
        const numericValue = Number(trimmed)
        payload[field.key] = Number.isFinite(numericValue) ? numericValue : trimmed
      } else {
        payload[field.key] = trimmed
      }
      continue
    }

    payload[field.key] = rawValue
  }

  return payload
}
