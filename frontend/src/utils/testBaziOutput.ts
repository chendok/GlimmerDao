/**
 * 验证脚本：使用规范中的示例命盘测试排盘JSON输出
 * 陈纪东，男，1974-08-19 13:30，吉林省 吉林市 昌邑区
 */
import { calculateBazi, serializeBaziJson } from './baziCalculator'

const result = calculateBazi(
  '陈纪东',
  '男',
  1974, 8, 19,
  13, 30,
  '吉林省 吉林市 昌邑区',
  126.55  // 吉林市经度
)

// 输出完整JSON
const json = serializeBaziJson(result)
console.log(json)

// 提取关键字段进行验证
const parsed = JSON.parse(json)

console.log('\n=== 字段验证 ===')
console.log('chartType:', parsed.chartType === '八字' ? '✅' : '❌')

// basicInfo
const bi = parsed.basicInfo
console.log('basicInfo.name:', bi.name === '陈纪东' ? '✅' : '❌', bi.name)
console.log('basicInfo.gender:', bi.gender === '男' ? '✅' : '❌')
console.log('basicInfo.genderLabel:', bi.genderLabel === '乾造' ? '✅' : '❌')
console.log('basicInfo.lunarDate:', bi.lunarDate ? '✅' : '❌', bi.lunarDate)
console.log('basicInfo.trueSolarTime:', bi.trueSolarTime ? '✅' : '❌')

// fourPillars
console.log('fourPillars:', parsed.fourPillars?.length === 4 ? '✅' : '❌', 'count=' + parsed.fourPillars?.length)
if (parsed.fourPillars) {
  for (const p of parsed.fourPillars) {
    const hasAll = p.label && p.gan && p.zhi && p.naYin && p.wuXing && p.zhuXing && p.fuXing && p.zangGan && p.xingYun && p.zizuo && p.kongWang && p.shishen
    console.log(`  ${p.label}: gan=${p.gan} zhi=${p.zhi} naYin=${p.naYin} wuXing=${p.wuXing} zhuXing=${p.zhuXing} ${hasAll ? '✅' : '❌(missing fields)'}`)
  }
}

// dayMaster
const dm = parsed.dayMaster
console.log('dayMaster:', dm ? '✅' : '❌')
console.log('  gan:', dm?.gan)
console.log('  wuXing:', dm?.wuXing)
console.log('  yinYang:', dm?.yinYang)
console.log('  strength:', dm?.strength ? `✅ level=${dm.strength.level} score=${dm.strength.score}` : '❌')

// pattern
console.log('pattern:', parsed.pattern ? `✅ ${parsed.pattern}` : '❌')

// monthOrder
console.log('monthOrder:', parsed.monthOrder ? `✅ ${parsed.monthOrder}` : '❌')

// wuXingDistribution
console.log('wuXingDistribution:', parsed.wuXingDistribution ? `✅ ${JSON.stringify(parsed.wuXingDistribution)}` : '❌')

// daYun
console.log('daYun:', parsed.daYun?.length > 0 ? `✅ count=${parsed.daYun.length}` : '❌')
if (parsed.daYun?.[0]) {
  const d = parsed.daYun[0]
  console.log('  daYun[0].wuXing:', d.wuXing ? `✅ ${d.wuXing}` : '❌')
  console.log('  daYun[0].isCurrent:', d.isCurrent !== undefined ? `✅ ${d.isCurrent}` : '❌')
}

// currentDaYun
console.log('currentDaYun:', parsed.currentDaYun ? `✅ ${parsed.currentDaYun.ganZhi}` : '❌')

// currentLiuNian
console.log('currentLiuNian:', parsed.currentLiuNian ? `✅ ${parsed.currentLiuNian.ganZhi} wuXing=${parsed.currentLiuNian.wuXing}` : '❌')

// liuYueList
console.log('liuYueList:', parsed.liuYueList ? `✅ count=${parsed.liuYueList.length}` : '❌')

// analysis
const a = parsed.analysis
console.log('analysis:', a ? '✅' : '❌')
if (a) {
  console.log('  dayMasterStrength:', a.dayMasterStrength ? `✅ level=${a.dayMasterStrength.level} score=${a.dayMasterStrength.score}` : '❌')
  console.log('    deLing/deDi/deShi:', a.dayMasterStrength?.deLing, a.dayMasterStrength?.deDi, a.dayMasterStrength?.deShi)
  console.log('  geJuInfo:', a.geJuInfo ? `✅ name=${a.geJuInfo.name} chengBaiDu=${a.geJuInfo.chengBaiDu}` : '❌')
  console.log('  tiaoHou:', a.tiaoHou ? `✅ hanNuan=${a.tiaoHou.hanNuan.level} zaoShi=${a.tiaoHou.zaoShi.level} yongShen=${a.tiaoHou.tiaoHouYongShen}` : '❌')
  console.log('  yongShen:', a.yongShen ? `✅ zongHe=${a.yongShen.zongHeYongShen?.join(',')}` : '❌')
  console.log('  shiShenPower:', a.shiShenPower ? `✅ count=${a.shiShenPower.length}` : '❌')
  if (a.shiShenPower) {
    for (const sp of a.shiShenPower.slice(0, 5)) {
      console.log(`    rank=${sp.rank} ${sp.name} power=${sp.power} level=${sp.level}`)
    }
  }
  console.log('  shiShenCombination:', a.shiShenCombination ? `✅ name=${a.shiShenCombination.name} type=${a.shiShenCombination.type}` : '❌')
  console.log('  diZhiRelations:', a.diZhiRelations ? '✅' : '❌')
  if (a.diZhiRelations) {
    for (const [key, val] of Object.entries(a.diZhiRelations)) {
      if (key !== 'summary') console.log(`    ${key}: exists=${(val as any).exists || false}`)
    }
    console.log('    summary:', a.diZhiRelations.summary)
  }
  console.log('  mingJuLevel:', a.mingJuLevel ? `✅ totalScore=${a.mingJuLevel.totalScore} level=${a.mingJuLevel.level}` : '❌')
  
  // 3.9 ganHe
  console.log('  ganHe:', a.ganHe ? `✅ exists=${a.ganHe.exists} pairs=${a.ganHe.pairs?.length || 0}` : '❌')
  if (a.ganHe?.pairs?.length > 0) {
    for (const p of a.ganHe.pairs) {
      console.log(`    ${p.ganZhi} → ${p.heHuaWuXing} (${p.pillars}) strength=${p.strength} adj=${p.isAdjacent}`)
    }
  }
  
  // 3.10 wuXingFlow
  console.log('  wuXingFlow:', a.wuXingFlow ? `✅ path=${a.wuXingFlow.path} smoothness=${a.wuXingFlow.smoothness}` : '❌')
  if (a.wuXingFlow) {
    console.log(`    finalDestination=${a.wuXingFlow.finalDestination} score=${a.wuXingFlow.smoothnessScore}`)
  }
  
  // 3.11 naYinAssessment
  console.log('  naYinAssessment:', a.naYinAssessment ? `✅ pattern=${a.naYinAssessment.pattern} quality=${a.naYinAssessment.patternQuality}` : '❌')
  if (a.naYinAssessment?.elements) {
    for (const el of a.naYinAssessment.elements) {
      console.log(`    ${el.pillar}: ${el.naYin}(${el.wuXing})`)
    }
  }
  
  // 3.12 daYunEvaluations
  console.log('  daYunEvaluations:', a.daYunEvaluations ? `✅ count=${a.daYunEvaluations.length}` : '❌')
  if (a.daYunEvaluations?.length > 0) {
    for (const dy of a.daYunEvaluations.slice(0, 3)) {
      console.log(`    ${dy.ganZhi} (${dy.startAge}-${dy.endAge}): ${dy.level} score=${dy.score} ${dy.isCurrent ? '[当前]' : ''}`)
    }
  }
  
  // 3.13 shenShaClassification
  console.log('  shenShaClassification:', a.shenShaClassification ? `✅ jiShen=${a.shenShaClassification.jiShen?.length} xiongSha=${a.shenShaClassification.xiongSha?.length}` : '❌')
  if (a.shenShaClassification) {
    console.log(`    ratio=${a.shenShaClassification.jiXiongRatio?.ratio}`)
    console.log(`    summary=${a.shenShaClassification.summary}`)
  }
  
  // 3.14 liuNianAssessments
  console.log('  liuNianAssessments:', a.liuNianAssessments ? `✅ count=${a.liuNianAssessments.length}` : '❌')
  if (a.liuNianAssessments?.length > 0) {
    for (const ln of a.liuNianAssessments.slice(0, 3)) {
      console.log(`    ${ln.year} ${ln.ganZhi}: ${ln.level} score=${ln.score} risk=${ln.riskLevel}`)
    }
  }
  
  // 汇总：检查14个子字段完整性
  const analysisFields = ['dayMasterStrength', 'geJuInfo', 'tiaoHou', 'yongShen', 'shiShenPower', 'shiShenCombination', 'diZhiRelations', 'mingJuLevel', 'ganHe', 'wuXingFlow', 'naYinAssessment', 'daYunEvaluations', 'shenShaClassification', 'liuNianAssessments']
  const missingFields = analysisFields.filter(f => !a[f])
  console.log('\n=== analysis 14个子字段完整性 ===')
  console.log(`总数: ${analysisFields.length}, 缺失: ${missingFields.length}`)
  if (missingFields.length > 0) {
    console.log('缺失字段:', missingFields.join(', '))
  } else {
    console.log('✅ 所有14个子字段均已生成')
  }
}