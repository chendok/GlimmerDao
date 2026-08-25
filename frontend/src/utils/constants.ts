/** 共享常量 */

export const SUGGESTIONS = [
  { label: '四柱八字', prompt: '帮我排一下八字，我的出生日期是1990年5月15日早上8点，性别男' },
  { label: '紫微斗数', prompt: '紫微斗数中十二宫分别代表什么？如何看命盘中的主星分布？' },
  { label: '麻衣神相', prompt: '请问面相中的三停五官分别代表什么？如何通过面相看运势？' },
  { label: '六爻占卜', prompt: '六爻占卜是什么？如何通过六爻预测事情的发展趋势？' },
  { label: '梅花易数', prompt: '梅花易数的起卦方法有哪些？如何解读梅花易数的卦象？' },
  { label: '黄历择吉', prompt: '我想查询今天的黄历信息，看看今日宜忌和吉神方位' },
]

export const APP_NAME = '微光问道'
export const APP_TAGLINE = '知命 · 不惑 · 明心'

export const API_BASE = '/api/v1'

/** 认证 token 的存储 key（localStorage / sessionStorage 共用） */
export const TOKEN_KEY = 'glimmerdao_token'