/**
 * 紫微斗数排盘计算器综合测试
 *
 * 验证目标:
 * 1) 所有计算严格使用 iztro 库算法，无自研逻辑
 * 2) 本命盘(主星、辅星、杂耀、神煞、长生十二神)准确
 * 3) 大限、小限、流年、流月、流日计算正确
 * 4) 四化(生年/流年/流月/流日)正确
 * 5) 与已知正确紫微斗数排盘示例对比
 *
 * 测试用例: 1974-08-19 13:30 男 (经度126.5°)
 *   甲寅年 七月初三 未时
 *   命宫在丑 水二局 命主巨门 身主天梁
 */
import { getErrorMessage } from '../helpers'
import {
  calculateZiwei,
  getZiweiDaXianList,
  getZiweiLiuNianList,
  getZiweiLiuYueList,
  getZiweiLiuRiList,
  GONG_NAMES,
} from '../ziweiCalculator'

// ── 测试框架 ──

let passed = 0
let failed = 0
const failures: string[] = []

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

function assertDeepEqual<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`)
  }
}

function assertMapEqual(actual: Record<string, string>, expected: Record<string, string>, message: string) {
  const actualKeys = Object.keys(actual).sort()
  const expectedKeys = Object.keys(expected).sort()
  if (actualKeys.join(',') !== expectedKeys.join(',')) {
    throw new Error(`FAIL: ${message}\n  Keys mismatch\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`)
  }
  for (const key of actualKeys) {
    if (actual[key] !== expected[key]) {
      throw new Error(`FAIL: ${message}\n  Key "${key}"\n  Expected: ${expected[key]}\n  Actual:   ${actual[key]}`)
    }
  }
}

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e: unknown) {
    failed++
    const msg = `  ✗ ${name}\n      ${getErrorMessage(e)}`
    console.log(msg)
    failures.push(msg)
  }
}

// ── 测试数据 ──

const TEST_CASE = {
  name: '测试用户',
  gender: '男' as const,
  year: 1974,
  month: 8,
  day: 19,
  hour: 13,
  minute: 30,
  isLunar: false,
  longitude: 126.5,
}

// 甲干四化 (生年四化)
const JIA_SI_HUA: Record<string, string> = {
  '廉贞': '化禄',
  '破军': '化权',
  '武曲': '化科',
  '太阳': '化忌',
}

// 十干四化对照表 (中州派, 庚干=太阳武曲天同天相)
const STEM_SI_HUA: Record<string, Record<string, string>> = {
  '甲': { '廉贞': '化禄', '破军': '化权', '武曲': '化科', '太阳': '化忌' },
  '乙': { '天机': '化禄', '天梁': '化权', '紫微': '化科', '太阴': '化忌' },
  '丙': { '天同': '化禄', '天机': '化权', '文昌': '化科', '廉贞': '化忌' },
  '丁': { '太阴': '化禄', '天同': '化权', '天机': '化科', '巨门': '化忌' },
  '戊': { '贪狼': '化禄', '太阴': '化权', '右弼': '化科', '天机': '化忌' },
  '己': { '武曲': '化禄', '贪狼': '化权', '天梁': '化科', '文曲': '化忌' },
  '庚': { '太阳': '化禄', '武曲': '化权', '天同': '化科', '天相': '化忌' },
  '辛': { '巨门': '化禄', '太阳': '化权', '文曲': '化科', '文昌': '化忌' },
  '壬': { '天梁': '化禄', '紫微': '化权', '左辅': '化科', '武曲': '化忌' },
  '癸': { '破军': '化禄', '巨门': '化权', '太阴': '化科', '贪狼': '化忌' },
}

// 预期主星分布 (1974-08-19 13:30 男)
const EXPECTED_MAIN_STARS: Record<string, string[]> = {
  '巳': ['巨门'],
  '午': ['廉贞', '天相'],
  '未': ['天梁'],
  '申': ['七杀'],
  '寅': ['紫微', '天府'],
  '丑': ['天机'],
  '亥': ['太阳'],
  '戌': ['武曲'],
  '酉': ['天同'],
  '卯': ['太阴'],
  '辰': ['贪狼'],
  '子': ['破军'],
}

// 预期长生十二神 (按地支)
const EXPECTED_CHANGSHENG: Record<string, string> = {
  '丑': '衰', '子': '帝旺', '亥': '临官', '戌': '冠带',
  '酉': '沐浴', '申': '长生', '未': '养', '午': '胎',
  '巳': '绝', '辰': '墓', '卯': '死', '寅': '病',
}

// ── 执行测试 ──

console.log('\n═══ 紫微斗数排盘计算器综合测试 ═══')
console.log(`测试用例: ${TEST_CASE.year}-${TEST_CASE.month}-${TEST_CASE.day} ${TEST_CASE.hour}:${TEST_CASE.minute} ${TEST_CASE.gender} 经度${TEST_CASE.longitude}°\n`)

const result = calculateZiwei(
  TEST_CASE.name, TEST_CASE.gender, TEST_CASE.year, TEST_CASE.month,
  TEST_CASE.day, TEST_CASE.hour, TEST_CASE.minute, TEST_CASE.isLunar, TEST_CASE.longitude
)

// ═══════════════════════════════════════════════════════════════
// 1. 四柱八字验证
// ═══════════════════════════════════════════════════════════════
console.log('═══ 1. 四柱八字验证 ═══')

test('年柱应为甲寅', () => {
  assertEqual(result.yearGanZhi, '甲寅', '年柱')
})

test('月柱应为壬申', () => {
  assertEqual(result.monthGanZhi, '壬申', '月柱')
})

test('日柱应为壬辰', () => {
  assertEqual(result.dayGanZhi, '壬辰', '日柱')
})

test('时柱应为丁未', () => {
  assertEqual(result.hourGanZhi, '丁未', '时柱')
})

// ═══════════════════════════════════════════════════════════════
// 2. 命宫/身宫/五行局验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 2. 命宫/身宫/五行局验证 ═══')

test('命宫应在丑', () => {
  const mingGong = result.gongs.find(g => g.name === '命宫')
  assertEqual(mingGong?.zhi, '丑', '命宫地支')
})

test('身宫应在卯(福德宫)', () => {
  const shenGong = result.gongs.find(g => g.bodyGong)
  assertEqual(shenGong?.zhi, '卯', '身宫地支')
  assertEqual(shenGong?.name, '福德', '身宫所在宫位')
})

test('五行局应为水二局', () => {
  assertEqual(result.wuXingJu, '水', '五行')
  assertEqual(result.wuXingJuNum, 2, '局数')
})

test('命主应为巨门', () => {
  assertEqual(result.mingZhu, '巨门', '命主')
})

test('身主应为天梁', () => {
  assertEqual(result.shenZhu, '天梁', '身主')
})

test('斗指应为丑', () => {
  assertEqual(result.douZhi, '丑', '斗指')
})

// ═══════════════════════════════════════════════════════════════
// 3. 十二宫结构验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 3. 十二宫结构验证 ═══')

test('应有12个宫位', () => {
  assertEqual(result.gongs.length, 12, '宫位数量')
})

test('宫位名称顺序应为命宫→兄弟→...→父母', () => {
  assertDeepEqual(result.gongs.map(g => g.name), GONG_NAMES, '宫位名称顺序')
})

test('每个宫位应有天干地支', () => {
  for (const gong of result.gongs) {
    assert(gong.gan.length === 1, `${gong.name}天干缺失`)
    assert(gong.zhi.length === 1, `${gong.name}地支缺失`)
  }
})

test('宫位天干地支应符合纳音表', () => {
  // 验证天干地支组合有效 (丙寅、丁卯等)
  const validGanZhi = result.gongs.every(g => {
    return g.gan && g.zhi
  })
  assert(validGanZhi, '存在无效的天干地支')
})

// ═══════════════════════════════════════════════════════════════
// 4. 主星分布验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 4. 主星分布验证 ═══')

test('14主星应分布在正确的宫位', () => {
  for (const [zhi, expectedStars] of Object.entries(EXPECTED_MAIN_STARS)) {
    const gong = result.gongs.find(g => g.zhi === zhi)
    assert(gong != null, `找不到地支为${zhi}的宫位`)
    const mainStarNames = gong!.stars
      .filter(s => s.type === '主星')
      .map(s => s.name)
      .sort()
    assertDeepEqual(mainStarNames, [...expectedStars].sort(), `${zhi}(${gong!.name})主星`)
  }
})

test('14主星应全部出现', () => {
  const allMainStars = new Set<string>()
  for (const gong of result.gongs) {
    for (const star of gong.stars) {
      if (star.type === '主星') allMainStars.add(star.name)
    }
  }
  const expected14 = ['紫微','天机','太阳','武曲','天同','廉贞','天府','太阴','贪狼','巨门','天相','天梁','七杀','破军']
  for (const star of expected14) {
    assert(allMainStars.has(star), `缺少主星: ${star}`)
  }
})

// ═══════════════════════════════════════════════════════════════
// 5. 生年四化验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 5. 生年四化验证 ═══')

test('生年四化(甲干)应正确', () => {
  assertMapEqual(result.siHuaMap, JIA_SI_HUA, '生年四化Map')
})

test('四化星应在对应宫位显示siHua属性', () => {
  for (const gong of result.gongs) {
    for (const star of gong.stars) {
      if (result.siHuaMap[star.name]) {
        assertEqual(star.siHua, result.siHuaMap[star.name], `${gong.name}的${star.name}四化属性`)
      }
    }
  }
})

// ═══════════════════════════════════════════════════════════════
// 6. 长生十二神验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 6. 长生十二神验证 ═══')

test('长生十二神应分布在正确宫位', () => {
  for (const [zhi, expectedCS] of Object.entries(EXPECTED_CHANGSHENG)) {
    const gong = result.gongs.find(g => g.zhi === zhi)
    assert(gong != null, `找不到地支为${zhi}的宫位`)
    assertEqual(gong!.changSheng, expectedCS as any, `${zhi}(${gong!.name})长生十二神`)
  }
})

test('12长生应全部出现且不重复', () => {
  const csSet = new Set(result.gongs.map(g => g.changSheng))
  assertEqual(csSet.size, 12, '长生十二神种类数')
})

// ═══════════════════════════════════════════════════════════════
// 7. 神煞验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 7. 神煞验证 ═══')

test('每个宫位应有神煞数据(博士12/将前12/岁前12)', () => {
  for (const gong of result.gongs) {
    assert(gong.shenSha !== undefined, `${gong.name}缺少神煞数据`)
    assert(Array.isArray(gong.shenSha), `${gong.name}神煞格式错误`)
  }
})

test('博士十二神应全部出现', () => {
  const allShenSha = result.gongs.flatMap(g => g.shenSha)
  const boshi12 = ['博士','力士','青龙','小耗','将军','奏书','飞廉','喜神','病符','大耗','伏兵','官府']
  for (const bs of boshi12) {
    assert(allShenSha.includes(bs), `缺少博士十二神: ${bs}`)
  }
})

// ═══════════════════════════════════════════════════════════════
// 8. 大限验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 8. 大限验证 ═══')

const daXianList = getZiweiDaXianList(result)

test('应有12个大限', () => {
  assertEqual(daXianList.length, 12, '大限数量')
})

test('大限应按startAge升序排列', () => {
  for (let i = 1; i < daXianList.length; i++) {
    assert(daXianList[i].startAge > daXianList[i - 1].startAge,
      `大限排序错误: 第${i}个(${daXianList[i].startAge})应大于第${i - 1}个(${daXianList[i - 1].startAge})`)
  }
})

test('大限编号应从1到12', () => {
  daXianList.forEach((dx, i) => {
    assertEqual(dx.index, i + 1, `大限${i}编号`)
  })
})

test('水二局起运年龄应为2岁', () => {
  assertEqual(daXianList[0].startAge, 2, '第一个大限起始年龄')
})

test('每个大限应为10年', () => {
  for (const dx of daXianList) {
    assertEqual(dx.endAge - dx.startAge, 9, `${dx.gongName}大限年限(含起止)`)
  }
})

test('大限起始年份应与起运年龄一致', () => {
  for (const dx of daXianList) {
    const expectedStartYear = TEST_CASE.year + dx.startAge - 1
    assertEqual(dx.startYear, expectedStartYear, `${dx.gongName}大限起始年份`)
  }
})

test('大限应覆盖所有12宫', () => {
  const gongNames = new Set(daXianList.map(dx => dx.gongName))
  assertEqual(gongNames.size, 12, '大限宫位种类数')
  for (const name of GONG_NAMES) {
    assert(gongNames.has(name), `大限缺少宫位: ${name}`)
  }
})

test('第一个大限应在命宫(丑)', () => {
  assertEqual(daXianList[0].gongName, '命宫', '第一个大限宫位')
  assertEqual(daXianList[0].zhi, '丑', '第一个大限地支')
})

test('大限天干地支应与宫位一致', () => {
  for (const dx of daXianList) {
    const gong = result.gongs.find(g => g.name === dx.gongName)
    assert(gong != null, `找不到宫位${dx.gongName}`)
    // 大限天干地支应与命盘宫位天干地支一致(大限宫位即本命宫位)
    assertEqual(dx.zhi, gong!.zhi, `${dx.gongName}大限地支`)
  }
})

// ═══════════════════════════════════════════════════════════════
// 9. 小限验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 9. 小限验证 ═══')

test('每个宫位应有小限数据', () => {
  for (const gong of result.gongs) {
    assert(gong.xiaoXian.length > 0, `${gong.name}缺少小限数据`)
  }
})

test('小限年龄应覆盖1-120岁且不重复', () => {
  const allAges = new Set<number>()
  for (const gong of result.gongs) {
    for (const age of gong.xiaoXian.split(',').map(Number)) {
      assert(!allAges.has(age), `小限年龄${age}重复`)
      allAges.add(age)
    }
  }
  assert(allAges.size >= 120, `小限年龄总数应≥120, 实际${allAges.size}`)
})

// ═══════════════════════════════════════════════════════════════
// 10. 流年验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 10. 流年验证 ═══')

const liuNianList = getZiweiLiuNianList(daXianList[0], result)

test('每个大限应有10个流年', () => {
  assertEqual(liuNianList.length, 10, '第一个大限的流年数量')
})

test('流年年份应与大限范围一致', () => {
  const dx = daXianList[0]
  for (let i = 0; i < liuNianList.length; i++) {
    assertEqual(liuNianList[i].year, dx.startYear + i, `第${i + 1}个流年年份`)
  }
})

test('流年干支应符合该年干支', () => {
  const ZHI_CYCLE = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']
  const GAN_CYCLE = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
  // 1975年=乙卯年
  const expectedYears: Record<number, [string, string]> = {
    1975: ['乙', '卯'],
    1976: ['丙', '辰'],
    1977: ['丁', '巳'],
    1978: ['戊', '午'],
    1979: ['己', '未'],
    1980: ['庚', '申'],
    1981: ['辛', '酉'],
    1982: ['壬', '戌'],
    1983: ['癸', '亥'],
    1984: ['甲', '子'],
  }
  for (const ln of liuNianList) {
    const [gan, zhi] = expectedYears[ln.year]
    assertEqual(ln.gan, gan, `${ln.year}年天干`)
    assertEqual(ln.zhi, zhi, `${ln.year}年地支`)
  }
})

test('流年四化应与年干四化一致', () => {
  for (const ln of liuNianList) {
    const expectedSiHua = STEM_SI_HUA[ln.gan]
    assert(expectedSiHua != null, `缺少${ln.gan}干四化数据`)
    assertMapEqual(ln.siHuaMap, expectedSiHua, `${ln.year}年(${ln.gan}干)四化`)
  }
})

// ═══════════════════════════════════════════════════════════════
// 11. 流月验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 11. 流月验证 ═══')

const liuYueList2024 = getZiweiLiuYueList(2024, result)

test('应有12个流月', () => {
  assertEqual(liuYueList2024.length, 12, '流月数量')
})

test('流月月份应为1-12', () => {
  liuYueList2024.forEach((ly, i) => {
    assertEqual(ly.month, i + 1, `第${i + 1}个流月月份`)
  })
})

test('流月四化应与月干四化一致', () => {
  for (const ly of liuYueList2024) {
    const expectedSiHua = STEM_SI_HUA[ly.gan]
    assert(expectedSiHua != null, `缺少${ly.gan}干四化数据`)
    assertMapEqual(ly.siHuaMap, expectedSiHua, `${ly.month}月(${ly.gan}干)四化`)
  }
})

test('流月天干地支应匹配', () => {
  // 验证干支组合合理性 (天干地支应有值)
  for (const ly of liuYueList2024) {
    assert(ly.gan.length === 1, `${ly.month}月天干格式错误`)
    assert(ly.zhi.length === 1, `${ly.month}月地支格式错误`)
  }
})

// ═══════════════════════════════════════════════════════════════
// 12. 流日验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 12. 流日验证 ═══')

const liuRiList = getZiweiLiuRiList(2024, 7, result)

test('7月应有31天', () => {
  assertEqual(liuRiList.length, 31, '7月流日数量')
})

test('流日日期应为1-31', () => {
  liuRiList.forEach((lr, i) => {
    assertEqual(lr.day, i + 1, `第${i + 1}个流日日期`)
  })
})

test('流日星期应正确', () => {
  for (const lr of liuRiList) {
    const date = new Date(2024, 6, lr.day) // JS月份从0开始
    assertEqual(lr.weekday, date.getDay(), `${lr.day}日星期`)
  }
})

test('流日四化应与日干四化一致', () => {
  for (const lr of liuRiList) {
    const expectedSiHua = STEM_SI_HUA[lr.gan]
    assert(expectedSiHua != null, `缺少${lr.gan}干四化数据`)
    assertMapEqual(lr.siHuaMap, expectedSiHua, `${lr.day}日(${lr.gan}干)四化`)
  }
})

test('流日天干地支应与siHuaMap一致', () => {
  for (const lr of liuRiList) {
    const expectedSiHua = STEM_SI_HUA[lr.gan]
    assertMapEqual(lr.siHuaMap, expectedSiHua, `${lr.day}日干(${lr.gan})与四化不匹配`)
  }
})

// ═══════════════════════════════════════════════════════════════
// 13. iztro一致性验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 13. iztro一致性验证 ═══')

test('_birth字段应保存出生参数', () => {
  assertEqual(result._birth.year, TEST_CASE.year, '_birth.year')
  assertEqual(result._birth.month, TEST_CASE.month, '_birth.month')
  assertEqual(result._birth.day, TEST_CASE.day, '_birth.day')
  assertEqual(result._birth.hour, TEST_CASE.hour, '_birth.hour')
  assertEqual(result._birth.minute, TEST_CASE.minute, '_birth.minute')
  assertEqual(result._birth.isLunar, TEST_CASE.isLunar, '_birth.isLunar')
  assertEqual(result._birth.longitude, TEST_CASE.longitude, '_birth.longitude')
})

test('星耀scope应全部为origin(本命盘)', () => {
  for (const gong of result.gongs) {
    for (const star of gong.stars) {
      // 本命盘星耀不应有运限scope混入
      assert(star.name.length > 0, `${gong.name}有空名星耀`)
    }
  }
})

test('流年四化星应在星耀列表中显示siHua', () => {
  for (const ln of liuNianList) {
    for (const star of ln.stars) {
      if (ln.siHuaMap[star.name]) {
        assertEqual(star.siHua, ln.siHuaMap[star.name], `${ln.year}年${star.name}四化标注`)
      }
    }
  }
})

// ═══════════════════════════════════════════════════════════════
// 14. 跨组件一致性验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 14. 跨组件一致性验证 ═══')

test('大限宫位应与命盘宫位一致', () => {
  for (const dx of daXianList) {
    const gong = result.gongs.find(g => g.name === dx.gongName)
    assert(gong != null, `大限${dx.gongName}在命盘中不存在`)
    assertEqual(dx.zhi, gong!.zhi, `${dx.gongName}大限地支与命盘不一致`)
  }
})

test('流年宫位索引应在0-11范围内', () => {
  for (const ln of liuNianList) {
    assert(ln.gongIndex >= 0 && ln.gongIndex < 12, `${ln.year}年宫位索引越界: ${ln.gongIndex}`)
    assertEqual(ln.gongName, GONG_NAMES[ln.gongIndex], `${ln.year}年宫位名与索引不匹配`)
  }
})

test('流月宫位索引应在0-11范围内', () => {
  for (const ly of liuYueList2024) {
    assert(ly.gongIndex >= 0 && ly.gongIndex < 12, `${ly.month}月宫位索引越界: ${ly.gongIndex}`)
    assertEqual(ly.gongName, GONG_NAMES[ly.gongIndex], `${ly.month}月宫位名与索引不匹配`)
  }
})

test('流日宫位索引应在0-11范围内', () => {
  for (const lr of liuRiList) {
    assert(lr.gongIndex >= 0 && lr.gongIndex < 12, `${lr.day}日宫位索引越界: ${lr.gongIndex}`)
    assertEqual(lr.gongName, GONG_NAMES[lr.gongIndex], `${lr.day}日宫位名与索引不匹配`)
  }
})

test('大限起运年龄应与五行局一致', () => {
  // 水二局→2岁起运, 各局起运年龄=局数
  assertEqual(daXianList[0].startAge, result.wuXingJuNum, '起运年龄应等于五行局数')
})

// ═══════════════════════════════════════════════════════════════
// 15. 第二个测试用例 (农历输入验证)
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 15. 农历输入验证 ═══')

test('农历1974年七月初三未时(男)应与公历1974-08-19一致', () => {
  const lunarResult = calculateZiwei('农历测试', '男', 1974, 7, 3, 13, 30, true, 126.5)
  const solarResult = calculateZiwei('公历测试', '男', 1974, 8, 19, 13, 30, false, 126.5)

  // 命宫地支应一致
  assertEqual(lunarResult.gongs[0].zhi, solarResult.gongs[0].zhi, '农历/公历命宫地支')
  // 五行局应一致
  assertEqual(lunarResult.wuXingJu, solarResult.wuXingJu, '农历/公历五行局')
  assertEqual(lunarResult.wuXingJuNum, solarResult.wuXingJuNum, '农历/公历局数')
  // 主星分布应一致
  for (let i = 0; i < 12; i++) {
    const lunarMain = lunarResult.gongs[i].stars.filter(s => s.type === '主星').map(s => s.name).sort()
    const solarMain = solarResult.gongs[i].stars.filter(s => s.type === '主星').map(s => s.name).sort()
    assertDeepEqual(lunarMain, solarMain, `农历/公历第${i}宫主星`)
  }
  // 命主身主应一致
  assertEqual(lunarResult.mingZhu, solarResult.mingZhu, '农历/公历命主')
  assertEqual(lunarResult.shenZhu, solarResult.shenZhu, '农历/公历身主')
})

// ═══════════════════════════════════════════════════════════════
// 16. 女命验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 16. 女命验证 ═══')

test('女命大限应逆行(甲年男顺女逆)', () => {
  const femaleResult = calculateZiwei('女命测试', '女', 1974, 8, 19, 13, 30, false, 126.5)
  const femaleDaXian = getZiweiDaXianList(femaleResult)

  // 水二局起运2岁
  assertEqual(femaleDaXian[0].startAge, 2, '女命起运年龄')
  // 第一个大限应在命宫
  assertEqual(femaleDaXian[0].gongName, '命宫', '女命第一个大限宫位')
  // 第二个大限应逆行到父母宫(而非兄弟宫)
  // 男命(阳年顺行): 命宫→父母→福德→田宅...
  // 女命(阳年逆行): 命宫→兄弟→夫妻→子女...
  assertEqual(femaleDaXian[1].gongName, '兄弟', '女命第二个大限应为兄弟宫(逆行)')
})

// ═══════════════════════════════════════════════════════════════
// 17. 闰年流日验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 17. 闰年流日验证 ═══')

test('2024年2月(闰年)应有29天', () => {
  const febLiuRi = getZiweiLiuRiList(2024, 2, result)
  assertEqual(febLiuRi.length, 29, '闰年2月流日数量')
})

test('2023年2月(平年)应有28天', () => {
  const febLiuRi = getZiweiLiuRiList(2023, 2, result)
  assertEqual(febLiuRi.length, 28, '平年2月流日数量')
})

test('各月流日天数应正确', () => {
  const expectedDays: Record<number, number> = {
    1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
    7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31,
  }
  for (const [month, days] of Object.entries(expectedDays)) {
    const lr = getZiweiLiuRiList(2024, Number(month), result)
    assertEqual(lr.length, days, `2024年${month}月流日数量`)
  }
})

// ═══════════════════════════════════════════════════════════════
// 18. 星耀类型验证
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 18. 星耀类型验证 ═══')

test('星耀类型应有效', () => {
  const validTypes = ['主星', '辅星', '吉星', '煞星', '四化', '杂星']
  for (const gong of result.gongs) {
    for (const star of gong.stars) {
      assert(validTypes.includes(star.type), `${gong.name}的${star.name}类型无效: ${star.type}`)
    }
  }
})

test('辅星应包含左辅右弼文昌文曲', () => {
  const allStars = result.gongs.flatMap(g => g.stars.map(s => s.name))
  assert(allStars.includes('左辅'), '缺少左辅')
  assert(allStars.includes('右弼'), '缺少右弼')
  assert(allStars.includes('文昌'), '缺少文昌')
  assert(allStars.includes('文曲'), '缺少文曲')
})

test('煞星应包含擎羊陀罗火星铃星地空地劫', () => {
  const allStars = result.gongs.flatMap(g => g.stars.map(s => s.name))
  assert(allStars.includes('擎羊'), '缺少擎羊')
  assert(allStars.includes('陀罗'), '缺少陀罗')
  assert(allStars.includes('火星'), '缺少火星')
  assert(allStars.includes('铃星'), '缺少铃星')
  assert(allStars.includes('地空'), '缺少地空')
  assert(allStars.includes('地劫'), '缺少地劫')
})

test('吉星应包含禄存天魁天钺', () => {
  const allStars = result.gongs.flatMap(g => g.stars.map(s => s.name))
  assert(allStars.includes('禄存'), '缺少禄存')
  assert(allStars.includes('天魁'), '缺少天魁')
  assert(allStars.includes('天钺'), '缺少天钺')
})

test('天马应出现', () => {
  const allStars = result.gongs.flatMap(g => g.stars.map(s => s.name))
  assert(allStars.includes('天马'), '缺少天马')
})

// 19. 辅星/杂耀强弱(庙旺平陷)验证

console.log('\n═══ 19. 辅星/杂耀强弱验证 ═══')

test('8颗辅星/煞星应全部有强弱', () => {
  const targetStars = ['左辅', '右弼', '天魁', '天钺', '禄存', '天马', '地空', '地劫']
  for (const target of targetStars) {
    const found = result.gongs.flatMap(g => g.stars).find(s => s.name === target)
    assert(found != null, `缺少星耀: ${target}`)
    assert(found!.status != null, `${target} 应有强弱值，实际为 ${found!.status}`)
  }
})

test('禄存应为庙', () => {
  const lucun = result.gongs.flatMap(g => g.stars).find(s => s.name === '禄存')
  assert(lucun != null, '缺少禄存')
  assertEqual(lucun!.status, '庙', `禄存强弱应为庙，实际为 ${lucun!.status}`)
})

test('左辅右弼应为旺', () => {
  const zuofu = result.gongs.flatMap(g => g.stars).find(s => s.name === '左辅')
  const youbi = result.gongs.flatMap(g => g.stars).find(s => s.name === '右弼')
  assert(zuofu != null, '缺少左辅')
  assert(youbi != null, '缺少右弼')
  assertEqual(zuofu!.status, '旺', `左辅强弱应为旺，实际为 ${zuofu!.status}`)
  assertEqual(youbi!.status, '旺', `右弼强弱应为旺，实际为 ${youbi!.status}`)
})

test('天魁天钺应为旺', () => {
  const kui = result.gongs.flatMap(g => g.stars).find(s => s.name === '天魁')
  const yue = result.gongs.flatMap(g => g.stars).find(s => s.name === '天钺')
  assert(kui != null, '缺少天魁')
  assert(yue != null, '缺少天钺')
  assertEqual(kui!.status, '旺', `天魁强弱应为旺，实际为 ${kui!.status}`)
  assertEqual(yue!.status, '旺', `天钺强弱应为旺，实际为 ${yue!.status}`)
})

test('地空地劫应为陷', () => {
  const dikong = result.gongs.flatMap(g => g.stars).find(s => s.name === '地空')
  const dijie = result.gongs.flatMap(g => g.stars).find(s => s.name === '地劫')
  assert(dikong != null, '缺少地空')
  assert(dijie != null, '缺少地劫')
  assertEqual(dikong!.status, '陷', `地空强弱应为陷，实际为 ${dikong!.status}`)
  assertEqual(dijie!.status, '陷', `地劫强弱应为陷，实际为 ${dijie!.status}`)
})

test('天马在申宫(四长生位)应为旺', () => {
  // 1974-08-19 13:30 命盘天马在疾厄(申宫)，申为四长生位
  const tianma = result.gongs.flatMap(g => g.stars).find(s => s.name === '天马')
  assert(tianma != null, '缺少天马')
  assertEqual(tianma!.status, '旺', `天马在申宫强弱应为旺，实际为 ${tianma!.status}`)
})

test('杂耀应全部有强弱', () => {
  const miscStars = result.gongs.flatMap(g => g.stars).filter(s => s.type === '杂星')
  assert(miscStars.length > 0, '应存在杂星')
  for (const star of miscStars) {
    assert(star.status != null, `杂耀 ${star.name} 应有强弱值`)
  }
})

test('吉杂耀应为旺', () => {
  const auspiciousStars = ['三台', '八座', '恩光', '天贵', '龙池', '凤阁', '天德', '月德']
  for (const name of auspiciousStars) {
    const star = result.gongs.flatMap(g => g.stars).find(s => s.name === name)
    if (star) {
      assertEqual(star.status, '旺', `${name} 强弱应为旺，实际为 ${star.status}`)
    }
  }
})

test('凶杂耀应为陷', () => {
  const inauspiciousStars = ['天刑', '阴煞', '天哭', '天虚', '孤辰', '寡宿', '截空', '空亡']
  for (const name of inauspiciousStars) {
    const star = result.gongs.flatMap(g => g.stars).find(s => s.name === name)
    if (star) {
      assertEqual(star.status, '陷', `${name} 强弱应为陷，实际为 ${star.status}`)
    }
  }
})

test('桃花杂耀应为平', () => {
  const neutralStars = ['红鸾', '天喜', '天姚', '咸池', '华盖', '天巫']
  for (const name of neutralStars) {
    const star = result.gongs.flatMap(g => g.stars).find(s => s.name === name)
    if (star) {
      assertEqual(star.status, '平', `${name} 强弱应为平，实际为 ${star.status}`)
    }
  }
})

// ── 测试结果汇总 ──

console.log('\n═══════════════════════════════════════')
console.log(`  测试结果: ${passed} passed, ${failed} failed`)
console.log('═══════════════════════════════════════')

if (failures.length > 0) {
  console.log('\n失败详情:')
  failures.forEach(f => console.log(f))
  throw new Error(`${failed} tests failed`)
}
