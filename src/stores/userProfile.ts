import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// BADL 评估项 (基本日常生活活动)
export interface BADLItem {
  bathing: number | null      // 洗澡
  dressing: number | null     // 穿衣
  toileting: number | null    // 如厕
  transfer: number | null     // 移动
  continence: number | null   // 排便控制
  feeding: number | null      // 进食
}

// IADL 评估项 (工具性日常生活活动)
export interface IADLItem {
  visiting: number | null     // 探访
  shopping: number | null     // 购物
  cooking: number | null      // 做饭
  washing: number | null      // 洗衣
  walking: number | null      // 步行
  lifting: number | null      // 提物
  crouching: number | null    // 蹲下
  transport: number | null    // 乘车
}

// 慢性病类型
export type ChronicDisease =
  | 'hypertension'    // 高血压
  | 'diabetes'        // 糖尿病
  | 'heart_disease'   // 心脏病
  | 'stroke'          // 中风
  | 'cancer'          // 癌症
  | 'arthritis'       // 关节炎
  | 'respiratory'     // 呼吸系统疾病
  | 'dementia'        // 痴呆
  | 'other'           // 其他

// 用户健康档案
export interface UserProfile {
  // 基本人口学信息
  demographics: {
    age: number | null          // trueage - 实际年龄
    gender: 'male' | 'female' | null  // a1 - 性别
    livingStatus: 'alone' | 'with_spouse' | 'with_children' | 'nursing_home' | ''  // 居住状态
    education: string           // 教育程度
    maritalStatus: string       // 婚姻状况
  }

  // 功能状态评估
  functionalStatus: {
    badl: BADLItem              // 基本日常生活活动
    iadl: IADLItem              // 工具性日常生活活动
  }

  // 健康因素
  healthFactors: {
    chronicDiseases: ChronicDisease[]  // 慢性病列表
    mood: 'normal' | 'depression' | 'anxiety' | 'both' | ''  // 情绪状态
    cognition: 'normal' | 'mild_impairment' | 'moderate_impairment' | 'severe_impairment' | ''  // 认知状态
    vision: 'good' | 'fair' | 'poor' | ''      // 视力
    hearing: 'good' | 'fair' | 'poor' | ''     // 听力
    fallHistory: boolean | null   // 跌倒史
  }

  // 生活方式
  lifestyle: {
    exercise: 'regular' | 'occasional' | 'none' | ''      // 运动频率
    diet: 'balanced' | 'unbalanced' | ''                  // 饮食状况
    sleep: 'good' | 'fair' | 'poor' | ''                  // 睡眠质量
    smoking: 'never' | 'former' | 'current' | ''          // 吸烟状态
    drinking: 'never' | 'occasional' | 'regular' | ''     // 饮酒状态
  }

  // 社会支持
  socialSupport: {
    familySupport: 'strong' | 'moderate' | 'weak' | ''    // 家庭支持
    socialActivity: 'active' | 'moderate' | 'inactive' | ''  // 社会活动参与度
    primaryCaregiver: string     // 主要照护者
  }
}

// 创建默认的 BADL 对象
function createDefaultBADL(): BADLItem {
  return {
    bathing: null,
    dressing: null,
    toileting: null,
    transfer: null,
    continence: null,
    feeding: null
  }
}

// 创建默认的 IADL 对象
function createDefaultIADL(): IADLItem {
  return {
    visiting: null,
    shopping: null,
    cooking: null,
    washing: null,
    walking: null,
    lifting: null,
    crouching: null,
    transport: null
  }
}

// 创建默认的用户档案
function createDefaultProfile(): UserProfile {
  return {
    demographics: {
      age: null,
      gender: null,
      livingStatus: '',
      education: '',
      maritalStatus: ''
    },
    functionalStatus: {
      badl: createDefaultBADL(),
      iadl: createDefaultIADL()
    },
    healthFactors: {
      chronicDiseases: [],
      mood: '',
      cognition: '',
      vision: '',
      hearing: '',
      fallHistory: null
    },
    lifestyle: {
      exercise: '',
      diet: '',
      sleep: '',
      smoking: '',
      drinking: ''
    },
    socialSupport: {
      familySupport: '',
      socialActivity: '',
      primaryCaregiver: ''
    }
  }
}

export const useUserProfileStore = defineStore('userProfile', () => {
  // 状态
  const profile = ref<UserProfile>(createDefaultProfile())

  // 计算属性：检查是否收集齐了必要信息
  const isReadyForAnalysis = computed(() => {
    const { demographics, functionalStatus, healthFactors } = profile.value

    // 检查基本人口学信息
    if (!demographics.age || !demographics.gender) {
      return false
    }

    // 检查 BADL 是否至少填写了一半
    const badlValues = Object.values(functionalStatus.badl)
    const badlFilledCount = badlValues.filter(v => v !== null).length
    if (badlFilledCount < 3) {
      return false
    }

    // 检查 IADL 是否至少填写了一半
    const iadlValues = Object.values(functionalStatus.iadl)
    const iadlFilledCount = iadlValues.filter(v => v !== null).length
    if (iadlFilledCount < 4) {
      return false
    }

    return true
  })

  // 计算属性：数据完成度百分比
  const completionPercentage = computed(() => {
    let total = 0
    let filled = 0

    // 人口学信息 (5项)
    total += 5
    if (profile.value.demographics.age) filled++
    if (profile.value.demographics.gender) filled++
    if (profile.value.demographics.livingStatus) filled++
    if (profile.value.demographics.education) filled++
    if (profile.value.demographics.maritalStatus) filled++

    // BADL (6项)
    total += 6
    Object.values(profile.value.functionalStatus.badl).forEach(v => {
      if (v !== null) filled++
    })

    // IADL (8项)
    total += 8
    Object.values(profile.value.functionalStatus.iadl).forEach(v => {
      if (v !== null) filled++
    })

    // 健康因素 (6项)
    total += 6
    if (profile.value.healthFactors.chronicDiseases.length > 0) filled++
    if (profile.value.healthFactors.mood) filled++
    if (profile.value.healthFactors.cognition) filled++
    if (profile.value.healthFactors.vision) filled++
    if (profile.value.healthFactors.hearing) filled++
    if (profile.value.healthFactors.fallHistory !== null) filled++

    // 生活方式 (5项)
    total += 5
    if (profile.value.lifestyle.exercise) filled++
    if (profile.value.lifestyle.diet) filled++
    if (profile.value.lifestyle.sleep) filled++
    if (profile.value.lifestyle.smoking) filled++
    if (profile.value.lifestyle.drinking) filled++

    // 社会支持 (3项)
    total += 3
    if (profile.value.socialSupport.familySupport) filled++
    if (profile.value.socialSupport.socialActivity) filled++
    if (profile.value.socialSupport.primaryCaregiver) filled++

    return Math.round((filled / total) * 100)
  })

  // 计算 BADL 评分 (失能等级)
  const badlScore = computed(() => {
    const values = Object.values(profile.value.functionalStatus.badl)
    const validValues = values.filter(v => v !== null) as number[]
    if (validValues.length === 0) return null
    return validValues.reduce((sum, v) => sum + v, 0)
  })

  // 计算 IADL 评分
  const iadlScore = computed(() => {
    const values = Object.values(profile.value.functionalStatus.iadl)
    const validValues = values.filter(v => v !== null) as number[]
    if (validValues.length === 0) return null
    return validValues.reduce((sum, v) => sum + v, 0)
  })

  // 方法：更新人口学信息
  function updateDemographics(data: Partial<UserProfile['demographics']>) {
    profile.value.demographics = { ...profile.value.demographics, ...data }
  }

  // 方法：更新功能状态
  function updateFunctionalStatus(type: 'badl' | 'iadl', data: Partial<BADLItem | IADLItem>) {
    if (type === 'badl') {
      profile.value.functionalStatus.badl = {
        ...profile.value.functionalStatus.badl,
        ...data
      } as BADLItem
    } else {
      profile.value.functionalStatus.iadl = {
        ...profile.value.functionalStatus.iadl,
        ...data
      } as IADLItem
    }
  }

  // 方法：更新健康因素
  function updateHealthFactors(data: Partial<UserProfile['healthFactors']>) {
    profile.value.healthFactors = { ...profile.value.healthFactors, ...data }
  }

  // 方法：更新生活方式
  function updateLifestyle(data: Partial<UserProfile['lifestyle']>) {
    profile.value.lifestyle = { ...profile.value.lifestyle, ...data }
  }

  // 方法：更新社会支持
  function updateSocialSupport(data: Partial<UserProfile['socialSupport']>) {
    profile.value.socialSupport = { ...profile.value.socialSupport, ...data }
  }

  // 方法：重置档案
  function resetProfile() {
    profile.value = createDefaultProfile()
  }

  // 方法：从 JSON 加载档案
  function loadProfile(data: UserProfile) {
    profile.value = data
  }

  return {
    profile,
    isReadyForAnalysis,
    completionPercentage,
    badlScore,
    iadlScore,
    updateDemographics,
    updateFunctionalStatus,
    updateHealthFactors,
    updateLifestyle,
    updateSocialSupport,
    resetProfile,
    loadProfile
  }
})
