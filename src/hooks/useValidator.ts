import { computed } from 'vue'
import { useUserProfileStore, type BADLItem, type IADLItem } from '@/stores/userProfile'

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  field: string
  message: string
  section: string
}

export interface ValidationWarning {
  field: string
  message: string
  suggestion: string
}

// BADL 字段中文映射
const BADL_LABELS: Record<keyof BADLItem, string> = {
  bathing: '洗澡',
  dressing: '穿衣',
  toileting: '如厕',
  transfer: '移动',
  continence: '排便控制',
  feeding: '进食'
}

// IADL 字段中文映射
const IADL_LABELS: Record<keyof IADLItem, string> = {
  visiting: '探访',
  shopping: '购物',
  cooking: '做饭',
  washing: '洗衣',
  walking: '步行',
  lifting: '提物',
  crouching: '蹲下',
  transport: '乘车'
}

export function useValidator() {
  const userProfileStore = useUserProfileStore()

  // 验证 BADL 数据完整性
  const badlValidation = computed((): ValidationResult => {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const badl = userProfileStore.profile.functionalStatus.badl

    // 检查每个 BADL 项
    Object.entries(badl).forEach(([key, value]) => {
      const fieldKey = key as keyof BADLItem
      if (value === null) {
        errors.push({
          field: key,
          message: `${BADL_LABELS[fieldKey]}评分未填写`,
          section: 'BADL'
        })
      } else if (value < 0 || value > 3) {
        errors.push({
          field: key,
          message: `${BADL_LABELS[fieldKey]}评分应在 0-3 之间`,
          section: 'BADL'
        })
      }
    })

    // 检查是否存在严重失能项
    const severeCount = Object.values(badl).filter(v => v === 3).length
    if (severeCount >= 3) {
      warnings.push({
        field: 'badl_overall',
        message: '检测到多项严重失能',
        suggestion: '建议重点关注日常照护需求'
      })
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  })

  // 验证 IADL 数据完整性
  const iadlValidation = computed((): ValidationResult => {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const iadl = userProfileStore.profile.functionalStatus.iadl

    // 检查每个 IADL 项
    Object.entries(iadl).forEach(([key, value]) => {
      const fieldKey = key as keyof IADLItem
      if (value === null) {
        errors.push({
          field: key,
          message: `${IADL_LABELS[fieldKey]}能力未评估`,
          section: 'IADL'
        })
      } else if (value < 0 || value > 3) {
        errors.push({
          field: key,
          message: `${IADL_LABELS[fieldKey]}评分应在 0-3 之间`,
          section: 'IADL'
        })
      }
    })

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  })

  // 验证人口学数据
  const demographicsValidation = computed((): ValidationResult => {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const demo = userProfileStore.profile.demographics

    if (!demo.age) {
      errors.push({
        field: 'age',
        message: '年龄未填写',
        section: '基本信息'
      })
    } else if (demo.age < 60 || demo.age > 120) {
      warnings.push({
        field: 'age',
        message: '年龄超出常规范围',
        suggestion: '请确认年龄是否正确填写'
      })
    }

    if (!demo.gender) {
      errors.push({
        field: 'gender',
        message: '性别未填写',
        section: '基本信息'
      })
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  })

  // 验证健康因素数据
  const healthFactorsValidation = computed((): ValidationResult => {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const health = userProfileStore.profile.healthFactors

    // 慢性病检查
    if (health.chronicDiseases.length === 0) {
      warnings.push({
        field: 'chronicDiseases',
        message: '未记录任何慢性病',
        suggestion: '如确无慢性病可忽略此提示'
      })
    }

    // 多病共存警告
    if (health.chronicDiseases.length >= 3) {
      warnings.push({
        field: 'chronicDiseases',
        message: '存在多病共存情况',
        suggestion: '建议关注药物相互作用'
      })
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  })

  // 整体验证
  const overallValidation = computed((): ValidationResult => {
    const allErrors = [
      ...demographicsValidation.value.errors,
      ...badlValidation.value.errors,
      ...iadlValidation.value.errors,
      ...healthFactorsValidation.value.errors
    ]

    const allWarnings = [
      ...demographicsValidation.value.warnings,
      ...badlValidation.value.warnings,
      ...iadlValidation.value.warnings,
      ...healthFactorsValidation.value.warnings
    ]

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    }
  })

  // 检查是否可以生成报告 (最低数据要求)
  const canGenerateReport = computed(() => {
    const demo = userProfileStore.profile.demographics
    const badl = userProfileStore.profile.functionalStatus.badl
    const iadl = userProfileStore.profile.functionalStatus.iadl

    // 必须有年龄和性别
    if (!demo.age || !demo.gender) return false

    // BADL 至少填写一半
    const badlFilled = Object.values(badl).filter(v => v !== null).length
    if (badlFilled < 3) return false

    // IADL 至少填写一半
    const iadlFilled = Object.values(iadl).filter(v => v !== null).length
    if (iadlFilled < 4) return false

    return true
  })

  // 获取缺失字段列表
  const missingFields = computed(() => {
    const missing: string[] = []
    const demo = userProfileStore.profile.demographics

    if (!demo.age) missing.push('年龄')
    if (!demo.gender) missing.push('性别')

    const badl = userProfileStore.profile.functionalStatus.badl
    Object.entries(badl).forEach(([key, value]) => {
      if (value === null) {
        missing.push(BADL_LABELS[key as keyof BADLItem])
      }
    })

    const iadl = userProfileStore.profile.functionalStatus.iadl
    Object.entries(iadl).forEach(([key, value]) => {
      if (value === null) {
        missing.push(IADL_LABELS[key as keyof IADLItem])
      }
    })

    return missing
  })

  return {
    badlValidation,
    iadlValidation,
    demographicsValidation,
    healthFactorsValidation,
    overallValidation,
    canGenerateReport,
    missingFields,
    BADL_LABELS,
    IADL_LABELS
  }
}
