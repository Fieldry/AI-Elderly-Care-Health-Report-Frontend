/**
 * 格式化时间戳为友好的时间字符串
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - timestamp

  // 小于 1 分钟
  if (diff < 60 * 1000) {
    return '刚刚'
  }

  // 小于 1 小时
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return `${minutes}分钟前`
  }

  // 今天
  if (isSameDay(date, now)) {
    return formatHourMinute(date)
  }

  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, yesterday)) {
    return `昨天 ${formatHourMinute(date)}`
  }

  // 今年
  if (date.getFullYear() === now.getFullYear()) {
    return formatMonthDay(date) + ' ' + formatHourMinute(date)
  }

  // 其他
  return formatFullDate(date) + ' ' + formatHourMinute(date)
}

/**
 * 判断两个日期是否是同一天
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * 格式化为 HH:mm
 */
function formatHourMinute(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * 格式化为 MM月DD日
 */
function formatMonthDay(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}

/**
 * 格式化为完整日期 YYYY年MM月DD日
 */
function formatFullDate(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}年${month}月${day}日`
}

/**
 * 格式化为 ISO 日期字符串
 */
export function formatISODate(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

/**
 * 格式化持续时间 (毫秒)
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }

  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) {
    return `${seconds}秒`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}分${remainingSeconds}秒`
      : `${minutes}分钟`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0
    ? `${hours}小时${remainingMinutes}分钟`
    : `${hours}小时`
}
