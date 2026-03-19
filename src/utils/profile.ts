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

export const PROFILE_FIELDS: ProfileFieldDefinition[] = [
  { key: 'name', label: '姓名', group: '基础信息', type: 'text', placeholder: '可选' },
  { key: 'age', label: '年龄', group: '基础信息', type: 'number', placeholder: '例如 82' },
  { key: 'sex', label: '性别', group: '基础信息', type: 'select', options: ['男', '女'] },
  { key: 'province', label: '所在省份', group: '基础信息', type: 'text', placeholder: '例如 北京' },
  { key: 'residence', label: '居住地类型', group: '基础信息', type: 'select', options: ['城市', '农村'] },
  {
    key: 'education_years',
    label: '受教育年限',
    group: '基础信息',
    type: 'number',
    placeholder: '例如 6'
  },
  {
    key: 'marital_status',
    label: '婚姻状况',
    group: '基础信息',
    type: 'select',
    options: ['未婚', '已婚', '丧偶', '离异']
  },
  {
    key: 'health_limitation',
    label: '自述健康限制',
    group: '基础信息',
    type: 'text',
    placeholder: '例如 腿脚不便、记忆力下降'
  },
  {
    key: 'badl_bathing',
    label: '洗澡能力',
    group: '功能状态',
    type: 'select',
    options: ['独立', '需要帮助', '无法完成']
  },
  {
    key: 'badl_dressing',
    label: '穿衣能力',
    group: '功能状态',
    type: 'select',
    options: ['独立', '需要帮助', '无法完成']
  },
  {
    key: 'badl_toileting',
    label: '如厕能力',
    group: '功能状态',
    type: 'select',
    options: ['独立', '需要帮助', '无法完成']
  },
  {
    key: 'badl_transferring',
    label: '起居移动能力',
    group: '功能状态',
    type: 'select',
    options: ['独立', '需要帮助', '无法完成']
  },
  {
    key: 'badl_continence',
    label: '大小便控制',
    group: '功能状态',
    type: 'select',
    options: ['正常', '偶尔失禁', '频繁失禁']
  },
  {
    key: 'badl_eating',
    label: '进食能力',
    group: '功能状态',
    type: 'select',
    options: ['独立', '需要帮助', '无法完成']
  },
  { key: 'hypertension', label: '高血压', group: '慢性病', type: 'select', options: yesNoOptions },
  { key: 'diabetes', label: '糖尿病', group: '慢性病', type: 'select', options: yesNoOptions },
  { key: 'heart_disease', label: '心脏病', group: '慢性病', type: 'select', options: yesNoOptions },
  { key: 'stroke', label: '中风', group: '慢性病', type: 'select', options: yesNoOptions },
  { key: 'cataract', label: '白内障', group: '慢性病', type: 'select', options: yesNoOptions },
  { key: 'cancer', label: '癌症', group: '慢性病', type: 'select', options: yesNoOptions },
  { key: 'arthritis', label: '关节炎', group: '慢性病', type: 'select', options: yesNoOptions },
  {
    key: 'depression',
    label: '抑郁情绪',
    group: '认知与心理',
    type: 'select',
    options: ['无', '偶尔', '经常']
  },
  {
    key: 'anxiety',
    label: '焦虑情绪',
    group: '认知与心理',
    type: 'select',
    options: ['无', '偶尔', '经常']
  },
  {
    key: 'loneliness',
    label: '孤独感',
    group: '认知与心理',
    type: 'select',
    options: ['无', '偶尔', '经常']
  },
  { key: 'smoking', label: '吸烟', group: '生活方式', type: 'select', options: yesNoOptions },
  { key: 'drinking', label: '饮酒', group: '生活方式', type: 'select', options: yesNoOptions },
  {
    key: 'exercise',
    label: '锻炼情况',
    group: '生活方式',
    type: 'text',
    placeholder: '例如 每周散步 3 次'
  },
  {
    key: 'sleep_quality',
    label: '睡眠质量',
    group: '生活方式',
    type: 'select',
    options: ['好', '一般', '差']
  },
  { key: 'weight', label: '体重(kg)', group: '身体指标', type: 'number', placeholder: '例如 56' },
  { key: 'height', label: '身高(cm)', group: '身体指标', type: 'number', placeholder: '例如 165' },
  { key: 'vision', label: '视力情况', group: '身体指标', type: 'text', placeholder: '例如 佩戴眼镜后正常' },
  { key: 'hearing', label: '听力情况', group: '身体指标', type: 'text', placeholder: '例如 轻度下降' },
  {
    key: 'living_arrangement',
    label: '居住安排',
    group: '社会支持',
    type: 'select',
    options: ['独居', '与配偶同住', '与子女同住', '养老机构']
  },
  {
    key: 'cohabitants',
    label: '同住人数',
    group: '社会支持',
    type: 'number',
    placeholder: '例如 2'
  },
  {
    key: 'financial_status',
    label: '经济状况',
    group: '社会支持',
    type: 'select',
    options: ['稳定', '一般', '较困难']
  },
  { key: 'income', label: '月收入', group: '社会支持', type: 'number', placeholder: '例如 3000' },
  {
    key: 'medical_insurance',
    label: '医保情况',
    group: '社会支持',
    type: 'text',
    placeholder: '例如 城乡居民医保'
  },
  {
    key: 'caregiver',
    label: '主要照护者',
    group: '社会支持',
    type: 'text',
    placeholder: '例如 女儿'
  }
]

export const PROFILE_FIELD_LABELS = Object.fromEntries(
  PROFILE_FIELDS.map((field) => [field.key, field.label])
) as Record<string, string>

export const PROFILE_GROUPS = Array.from(new Set(PROFILE_FIELDS.map((field) => field.group)))

const CORE_PROGRESS_KEYS = [
  'age',
  'sex',
  'province',
  'residence',
  'health_limitation',
  'hypertension',
  'diabetes',
  'exercise',
  'sleep_quality',
  'living_arrangement',
  'caregiver'
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
