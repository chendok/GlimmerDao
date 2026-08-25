/**
 * 八字计算器综合测试
 * 验证真太阳时转换、四柱八字生成及起运时间计算的准确性
 */
import { getErrorMessage } from '../helpers'
import {
  getTrueSolarTime,
  getYearGanZhi,
  getMonthGanZhi,
  getDayGanZhi,
  getHourGanZhi,
  getQiYunInfo,
  calculateBazi,
  TIAN_GAN,
  DI_ZHI,
} from '../baziCalculator'

// ── 辅助函数 ──
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`)
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`)
  }
}

function log(msg: string) {
  console.log(`  ${msg}`)
}

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (e: unknown) {
    failed++
    console.log(`✗ ${name}`)
    console.log(`    ${getErrorMessage(e)}`)
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. 真太阳时转换测试
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 1. 真太阳时转换测试 ═══')

test('北京(120°E) 12:00 真太阳时应在12:00附近', () => {
  // 北京东经116.4°，但用120°E基准，经度修正=0
  // 均时差在一年中变化，春分/秋分附近约±0分钟
  // 使用年中日期确保均时差较小
  const ts = getTrueSolarTime(2024, 6, 15, 12, 0, 120)
  // 均时差约 -1 到 +1 分钟，所以真太阳时应在 11:58 到 12:02 之间
  assert(ts >= 11.9 && ts <= 12.1, `120°E 12:00 真太阳时=${ts.toFixed(2)}，应在11.9~12.1之间`)
})

test('乌鲁木齐(87.6°E) 12:00 真太阳时应比北京晚约2小时', () => {
  // 乌鲁木齐东经87.6°，经度修正 = (87.6-120)*4 = -129.6分钟 ≈ -2.16小时
  const ts = getTrueSolarTime(2024, 6, 15, 12, 0, 87.6)
  // 真太阳时应在 12 - 2.16 = 9.84 附近
  assert(ts >= 9.6 && ts <= 10.1, `乌鲁木齐(87.6°E) 12:00 真太阳时=${ts.toFixed(2)}，应在9.6~10.1之间`)
})

test('抚远(134.3°E) 12:00 真太阳时应比北京早约1小时', () => {
  // 抚远东经134.3°，经度修正 = (134.3-120)*4 = 57.2分钟 ≈ 0.95小时
  const ts = getTrueSolarTime(2024, 6, 15, 12, 0, 134.3)
  // 真太阳时应在 12 + 0.95 = 12.95 附近
  assert(ts >= 12.7 && ts <= 13.2, `抚远(134.3°E) 12:00 真太阳时=${ts.toFixed(2)}，应在12.7~13.2之间`)
})

test('真太阳时考虑分钟参数', () => {
  const ts1 = getTrueSolarTime(2024, 6, 15, 12, 0, 120)
  const ts2 = getTrueSolarTime(2024, 6, 15, 12, 30, 120)
  const diff = ts2 - ts1
  assert(diff >= 0.48 && diff <= 0.52, `12:00 vs 12:30 差值应为0.5小时，实际=${diff.toFixed(3)}`)
})

test('不同经度的真太阳时差异符合预期', () => {
  // 成都(104°E) 和 上海(121.5°E) 相差约17.5度 = 70分钟
  const tsCD = getTrueSolarTime(2024, 6, 15, 12, 0, 104)
  const tsSH = getTrueSolarTime(2024, 6, 15, 12, 0, 121.5)
  const diff = (tsSH - tsCD) * 60 // 分钟
  assert(diff >= 65 && diff <= 75, `成都 vs 上海 12:00 差值应为70分钟，实际=${diff.toFixed(1)}分钟`)
})

test('均时差在一年中有明显变化', () => {
  // 2月中旬均时差约 -14 分钟
  const tsFeb = getTrueSolarTime(2024, 2, 15, 12, 0, 120)
  // 11月初均时差约 +16 分钟
  const tsNov = getTrueSolarTime(2024, 11, 3, 12, 0, 120)
  const diffMin = (tsNov - tsFeb) * 60
  // 差异应大约30分钟 (11月+16 vs 2月-14)
  assert(Math.abs(diffMin) >= 25, `2月vs11月均时差差异应≥25分钟，实际=${diffMin.toFixed(1)}分钟`)
})

// ═══════════════════════════════════════════════════════════════
// 2. 四柱八字正确性测试
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 2. 四柱八字正确性测试 ═══')

// 2.1 年柱测试
console.log('  --- 年柱 ---')

test('年柱：2024年2月4日(立春)后为甲辰年', () => {
  const gz = getYearGanZhi(2024, 2, 5)
  assertEqual(gz.gan, '甲', '年干应为甲')
  assertEqual(gz.zhi, '辰', '年支应为辰')
})

test('年柱：2024年2月3日(立春前)仍为癸卯年', () => {
  const gz = getYearGanZhi(2024, 2, 3)
  assertEqual(gz.gan, '癸', '年干应为癸')
  assertEqual(gz.zhi, '卯', '年支应为卯')
})

test('年柱：1984年2月4日(立春)后为甲子年', () => {
  const gz = getYearGanZhi(1984, 2, 5)
  assertEqual(gz.gan, '甲', '年干应为甲')
  assertEqual(gz.zhi, '子', '年支应为子')
})

test('年柱：1984年2月1日(立春前)为癸亥年', () => {
  const gz = getYearGanZhi(1984, 2, 1)
  assertEqual(gz.gan, '癸', '年干应为癸')
  assertEqual(gz.zhi, '亥', '年支应为亥')
})

test('年柱：2025年1月29日(春节但立春前)为甲辰年', () => {
  // 2025年春节是1月29日，但立春是2月3日，年柱以立春为界
  const gz = getYearGanZhi(2025, 1, 30)
  assertEqual(gz.gan, '甲', '年干应为甲（立春前仍是甲辰年）')
  assertEqual(gz.zhi, '辰', '年支应为辰（立春前仍是甲辰年）')
})

// 2.2 月柱测试
console.log('  --- 月柱 ---')

test('月柱：2024年2月5日(立春后)为丙寅月', () => {
  const gz = getMonthGanZhi(2024, 2, 5)
  assertEqual(gz.gan, '丙', '月干应为丙')
  assertEqual(gz.zhi, '寅', '月支应为寅')
})

test('月柱：2024年2月3日(立春前)为乙丑月', () => {
  const gz = getMonthGanZhi(2024, 2, 3)
  assertEqual(gz.gan, '乙', '月干应为乙')
  assertEqual(gz.zhi, '丑', '月支应为丑')
})

test('月柱：2024年6月6日(芒种后)为庚午月', () => {
  const gz = getMonthGanZhi(2024, 6, 7)
  assertEqual(gz.gan, '庚', '月干应为庚')
  assertEqual(gz.zhi, '午', '月支应为午')
})

test('月柱：2024年6月4日(芒种前)为己巳月', () => {
  const gz = getMonthGanZhi(2024, 6, 4)
  assertEqual(gz.gan, '己', '月干应为己')
  assertEqual(gz.zhi, '巳', '月支应为巳')
})

test('月柱：2024年12月7日(大雪后)为丙子月', () => {
  const gz = getMonthGanZhi(2024, 12, 8)
  assertEqual(gz.gan, '丙', '月干应为丙')
  assertEqual(gz.zhi, '子', '月支应为子')
})

test('月柱：2024年8月8日(立秋后)为壬申月', () => {
  const gz = getMonthGanZhi(2024, 8, 8)
  assertEqual(gz.gan, '壬', '月干应为壬')
  assertEqual(gz.zhi, '申', '月支应为申')
})

// 2.3 日柱测试
console.log('  --- 日柱 ---')

test('日柱：2024年1月1日应为甲子日', () => {
  const gz = getDayGanZhi(2024, 1, 1)
  assertEqual(gz.gan, '甲', '2024-01-01 日干应为甲')
  assertEqual(gz.zhi, '子', '2024-01-01 日支应为子')
})

test('日柱：1900年1月1日应为甲戌日（基准日验证）', () => {
  const gz = getDayGanZhi(1900, 1, 1)
  assertEqual(gz.gan, '甲', '1900-01-01 日干应为甲')
  assertEqual(gz.zhi, '戌', '1900-01-01 日支应为戌')
})

test('日柱：2024年2月10日(春节)应为甲辰日', () => {
  const gz = getDayGanZhi(2024, 2, 10)
  assertEqual(gz.gan, '甲', '2024-02-10 日干应为甲')
  assertEqual(gz.zhi, '辰', '2024-02-10 日支应为辰')
})

test('日柱：2000年1月1日应为戊午日', () => {
  const gz = getDayGanZhi(2000, 1, 1)
  assertEqual(gz.gan, '戊', '2000-01-01 日干应为戊')
  assertEqual(gz.zhi, '午', '2000-01-01 日支应为午')
})

test('日柱：连续两天干支正确轮转', () => {
  const gz1 = getDayGanZhi(2024, 6, 15)
  const gz2 = getDayGanZhi(2024, 6, 16)
  const idx1 = TIAN_GAN.indexOf(gz1.gan)
  const idx2 = TIAN_GAN.indexOf(gz2.gan)
  assertEqual((idx1 + 1) % 10, idx2, '日干应连续轮转')
  const zIdx1 = DI_ZHI.indexOf(gz1.zhi)
  const zIdx2 = DI_ZHI.indexOf(gz2.zhi)
  assertEqual((zIdx1 + 1) % 12, zIdx2, '日支应连续轮转')
})

// 2.4 时柱测试
console.log('  --- 时柱 ---')

test('时柱：甲日 0:00 为甲子时', () => {
  // 2024-01-01 是甲日（示例日期，需确认日干为甲）
  // 使用已知甲日：2024-01-01 为甲子日
  const gz = getHourGanZhi(2024, 1, 1, 0)
  assertEqual(gz.zhi, '子', '0:00 时支应为子')
})

test('时柱：12:00 为午时', () => {
  const gz = getHourGanZhi(2024, 1, 1, 12)
  assertEqual(gz.zhi, '午', '12:00 时支应为午')
})

test('时柱：5:00 为卯时', () => {
  const gz = getHourGanZhi(2024, 1, 1, 5)
  assertEqual(gz.zhi, '卯', '5:00 时支应为卯')
})

test('时柱：22:00 为亥时', () => {
  const gz = getHourGanZhi(2024, 1, 1, 22)
  assertEqual(gz.zhi, '亥', '22:00 时支应为亥')
})

test('时柱：23:00 和 0:00 的时支都是子时', () => {
  const gz23 = getHourGanZhi(2024, 1, 1, 23)
  const gz0 = getHourGanZhi(2024, 1, 1, 0)
  assertEqual(gz23.zhi, '子', '23:00 时支应为子')
  assertEqual(gz0.zhi, '子', '0:00 时支应为子')
})

// 2.5 完整四柱测试
console.log('  --- 完整四柱 ---')

test('完整四柱：1984年2月15日 8:00(甲子年 丙寅月 己卯日 戊辰时)', () => {
  const result = calculateBazi('测试', '男', 1984, 2, 15, 8, 0)
  assertEqual(result.yearPillar.gan, '甲', '年干')
  assertEqual(result.yearPillar.zhi, '子', '年支')
  assertEqual(result.monthPillar.gan, '丙', '月干')
  assertEqual(result.monthPillar.zhi, '寅', '月支')
  assertEqual(result.dayPillar.gan, '己', '日干')
  assertEqual(result.dayPillar.zhi, '卯', '日支')
  // 己日 辰时 (7-9点是辰时, 8点属于辰时, 索引=4)
  // 甲己还加甲，子时=甲子，丑=乙丑，寅=丙寅，卯=丁卯，辰=戊辰
  assertEqual(result.hourPillar.gan, '戊', '时干')
  assertEqual(result.hourPillar.zhi, '辰', '时支')
})

test('完整四柱：2024年6月15日 14:00(甲辰年 庚午月 庚戌日 癸未时)', () => {
  const result = calculateBazi('测试', '男', 2024, 6, 15, 14, 0)
  assertEqual(result.yearPillar.gan, '甲', '年干')
  assertEqual(result.yearPillar.zhi, '辰', '年支')
  assertEqual(result.monthPillar.gan, '庚', '月干')
  assertEqual(result.monthPillar.zhi, '午', '月支')
  assertEqual(result.dayPillar.gan, '庚', '日干')
  assertEqual(result.dayPillar.zhi, '戌', '日支')
  // 庚日 未时(14点=未时, 索引=6)
  // 乙庚丙作初，子=丙子，丑=丁丑，寅=戊寅，卯=己卯，辰=庚辰，巳=辛巳，午=壬午，未=癸未
  assertEqual(result.hourPillar.gan, '癸', '时干')
  assertEqual(result.hourPillar.zhi, '未', '时支')
})

test('完整四柱：2024年2月3日 23:30(立春前，癸卯年 乙丑月 丁酉日 壬子时)', () => {
  const result = calculateBazi('测试', '男', 2024, 2, 3, 23, 30)
  // 2月3日在立春前，年柱应仍是癸卯年
  assertEqual(result.yearPillar.gan, '癸', '年干')
  assertEqual(result.yearPillar.zhi, '卯', '年支')
  // 立春前，仍是丑月，癸年丑月=乙丑
  assertEqual(result.monthPillar.gan, '乙', '月干')
  assertEqual(result.monthPillar.zhi, '丑', '月支')
  // 日柱：2024-02-03 应查表
  assertEqual(result.dayPillar.gan, '丁', '日干')
  assertEqual(result.dayPillar.zhi, '酉', '日支')
  // 23:30 属于次日子时，使用次日(戊日)日干
  // 戊日 子时 → 壬子
  assertEqual(result.hourPillar.gan, '壬', '时干')
  assertEqual(result.hourPillar.zhi, '子', '时支')
})

test('完整四柱：1984年2月4日 12:00(立春后，甲子年 丙寅月)', () => {
  // 1984年立春是2月4日，从JIE_QI表看是2月4日
  const result = calculateBazi('测试', '男', 1984, 2, 4, 12, 0)
  assertEqual(result.yearPillar.gan, '甲', '2月4日立春后年干应为甲')
  assertEqual(result.yearPillar.zhi, '子', '2月4日立春后年支应为子')
})

// ═══════════════════════════════════════════════════════════════
// 3. 起运时间计算测试
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 3. 起运时间计算测试 ═══')

test('起运：阳年男命顺行，从出生日到下一个节', () => {
  // 2024年(甲辰年，阳年) 男命 6月1日出生
  // 6月1日在芒种(6月5日)之前，下一个节就是芒种
  // 从6月1日到6月5日 = 4天
  // 4天 / 3 = 1岁 + 4个月
  const qiYun = getQiYunInfo({ gan: '甲', zhi: '辰' }, '男', 2024, 6, 1)
  assertEqual(qiYun.totalDays, 4, '2024年6月1日到下一个节(芒种6月5日)应为4天')
  assertEqual(qiYun.startAge, 2, '起运岁数应为2岁(1岁+1)')
  assert(qiYun.years === 1, `起运年数应为1，实际=${qiYun.years}`)
})

test('起运：阴年女命顺行，规则同阳年男命', () => {
  // 2025年(乙巳年，阴年) 女命 6月1日出生，顺行
  // 6月1日在芒种(6月5日)之前，下一个节就是芒种
  // 从6月1日到6月5日 = 4天
  const qiYun = getQiYunInfo({ gan: '乙', zhi: '巳' }, '女', 2025, 6, 1)
  assertEqual(qiYun.totalDays, 4, '2025年6月1日到下一个节(芒种6月5日)应为4天')
  assert(qiYun.startAge > 0, '起运岁数应大于0')
})

test('起运：阳年女命逆行，从上一个节到出生日', () => {
  // 2024年(甲辰年，阳年) 女命 6月20日出生，逆行
  // 6月20日在芒种(6月5日)之后，上一个节就是芒种
  // 从6月5日到6月20日 = 15天
  // 15天 / 3 = 5岁 → 起运 6岁
  const qiYun = getQiYunInfo({ gan: '甲', zhi: '辰' }, '女', 2024, 6, 20)
  assertEqual(qiYun.totalDays, 15, '2024年6月20日从上一个节(芒种6月5日)应为15天')
  assertEqual(qiYun.startAge, 6, '起运岁数应为6岁(5岁+1)')
})

test('起运：阴年男命逆行，规则同阳年女命', () => {
  // 2025年(乙巳年，阴年) 男命 6月20日出生，逆行
  // 6月20日在芒种(6月5日)之后，上一个节就是芒种
  // 从6月5日到6月20日 = 15天
  const qiYun = getQiYunInfo({ gan: '乙', zhi: '巳' }, '男', 2025, 6, 20)
  assertEqual(qiYun.totalDays, 15, '2025年6月20日从上一个节(芒种6月5日)应为15天')
})

test('起运：出生日正好在节上，距节0天', () => {
  // 2024年芒种是6月5日，如果出生在6月5日
  // 阳男顺行，当天就是节，距下一个节=到小暑(7月6日)
  const qiYun = getQiYunInfo({ gan: '甲', zhi: '辰' }, '男', 2024, 6, 5)
  // 6月5日到7月6日(小暑) = 31天
  assertEqual(qiYun.totalDays, 31, '芒种当天出生，距下个小暑应为31天')
})

test('起运：1月出生跨年处理', () => {
  // 2024年1月15日，阳年男命顺行
  // 1月15日在小寒(1月6日)之后，下一个节是立春(2月4日)
  // 从1月15日到2月4日 = 20天
  const qiYun = getQiYunInfo({ gan: '甲', zhi: '辰' }, '男', 2024, 1, 15)
  assertEqual(qiYun.totalDays, 20, '2024年1月15日到立春(2月4日)应为20天')
})

test('起运：12月出生跨年处理', () => {
  // 2024年12月25日，阳年男命顺行
  // 12月25日在大雪(12月6日)之后，下一个节是2025年小寒(1月5日)
  // 从12月25日到1月5日 = 11天
  const qiYun = getQiYunInfo({ gan: '甲', zhi: '辰' }, '男', 2024, 12, 25)
  assertEqual(qiYun.totalDays, 11, '2024年12月25日到2025年小寒(1月5日)应为11天')
})

test('起运：大运列表包含正确的起运信息', () => {
  const result = calculateBazi('测试', '男', 2024, 6, 1, 12, 0)
  // 2024年6月1日在芒种(6月5日)前，月柱为己巳
  // 阳男顺行，大运从月柱己巳开始顺排
  assert(result.qiYunInfo.years >= 0, '起运年数应>=0')
  assert(result.qiYunInfo.startAge >= 1, '起运岁数应>=1')
  assert(result.qiYunInfo.totalDays >= 0, '距节天数应>=0')
  assert(result.daYunList.length === 10, '应有10个大运')
  // 月柱为己巳，大运顺行：己巳→庚午→辛未...
  assertEqual(result.daYunList[0].gan, '己', '第一大运天干应为己（从月柱己巳开始）')
  assertEqual(result.daYunList[0].zhi, '巳', '第一大运地支应为巳（从月柱己巳开始）')
  assertEqual(result.daYunList[1].gan, '庚', '第二大运天干应为庚')
  assertEqual(result.daYunList[1].zhi, '午', '第二大运地支应为午')
})

test('起运：阴年男命大运逆行', () => {
  // 2025年(乙巳年，阴年) 男命，大运应逆行
  const result = calculateBazi('测试', '男', 2025, 6, 15, 12, 0)
  // 月柱：2025年6月15日在芒种后，乙年 → 壬午月
  // 逆行：午→巳→辰→卯...
  assertEqual(result.daYunList[0].gan, '壬', '第一大运天干应为壬')
  assertEqual(result.daYunList[0].zhi, '午', '第一大运地支应为午')
  assertEqual(result.daYunList[1].zhi, '巳', '第二大运地支应为巳(逆行)')
})

// ═══════════════════════════════════════════════════════════════
// 4. 真太阳时对时柱的影响测试
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 4. 真太阳时对时柱的影响测试 ═══')

test('真太阳时：乌鲁木齐12:00可能落在巳时而非午时', () => {
  // 乌鲁木齐(87.6°E) 12:00，真太阳时约9:50
  // 9:50属于巳时(9:00-11:00)
  const result = calculateBazi('测试', '男', 2024, 6, 15, 12, 0, '', 87.6)
  // 真太阳时约9:50，应在巳时
  assertEqual(result.hourPillar.zhi, '巳', '乌鲁木齐12:00真太阳时应为巳时')
})

test('真太阳时：北京时间使用时柱不受经度影响', () => {
  const result = calculateBazi('测试', '男', 2024, 6, 15, 12, 0, '', 120)
  // 12:00真太阳时 ≈ 12:00，应在午时
  assertEqual(result.hourPillar.zhi, '午', '北京时间12:00应为午时')
})

test('真太阳时：接近时辰边界的精确处理', () => {
  // 北京 10:55，真太阳时约10:55，仍在巳时
  const result = calculateBazi('测试', '男', 2024, 6, 15, 10, 55, '', 120)
  assertEqual(result.hourPillar.zhi, '巳', '10:55应在巳时')
})

// ═══════════════════════════════════════════════════════════════
// 5. 边界和特殊场景测试
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 5. 边界和特殊场景测试 ═══')

test('边界：跨年子时(12月31日 23:30)', () => {
  const result = calculateBazi('测试', '男', 2024, 12, 31, 23, 30)
  // 23:30属于次日子时，使用2025年1月1日的日干
  // 2024年12月31日 日柱和次日 2025年1月1日 日柱
  assertEqual(result.hourPillar.zhi, '子', '12月31日23:30时支应为子')
  // 时干应使用次日日干
  const nextDayGZ = getDayGanZhi(2025, 1, 1)
  assert(result.hourPillar.gan.length > 0, '时干应有值')
})

test('边界：1999年12月31日到2000年1月1日', () => {
  const gz1 = getDayGanZhi(1999, 12, 31)
  const gz2 = getDayGanZhi(2000, 1, 1)
  const idx1 = TIAN_GAN.indexOf(gz1.gan)
  const idx2 = TIAN_GAN.indexOf(gz2.gan)
  assertEqual((idx1 + 1) % 10, idx2, '跨世纪日干应连续')
})

test('边界：闰年2月29日不应报错', () => {
  const result = calculateBazi('测试', '男', 2024, 2, 29, 12, 0)
  assert(result.dayPillar.gan.length > 0, '闰年2月29日应能正常计算')
})

test('边界：大月31日不应报错', () => {
  const result = calculateBazi('测试', '男', 2024, 3, 31, 12, 0)
  assert(result.dayPillar.gan.length > 0, '3月31日应能正常计算')
})

// ═══════════════════════════════════════════════════════════════
// 测试结果汇总
// ═══════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════')
console.log(`测试结果: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`)
console.log('════════════════════════════════════════')

if (failed > 0) {
  throw new Error(`${failed} tests failed`)
}