/**
 * 梅花易数起卦表单组件
 *
 * 支持三种起卦方式：
 * 1. 时间起卦：基于当前时间自动生成卦象
 * 2. 数字起卦：接收用户输入的数字组合
 * 3. 文字起卦：通过汉字笔画转换
 */

import { useState, useMemo, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { Lunar } from 'lunar-javascript'
import BackButton from './BackButton'
import BaziReportModal from './BaziReportModal'
import DivinationInfoModal from './DivinationInfoModal'
import PickerColumn from './PickerColumn'
import {
  timeDivination,
  numberDivination,
  textDivination,
  buildMeihuaResult,
  serializeMeihuaContext,
  serializeMeihuaJson,
  type MeihuaResult,
} from '../utils/meihuaCalculator'
import HexagramSvg, { composeLiuYaoYaos } from './HexagramSvg'

interface MeihuaFormProps {
  result: MeihuaResult | null
  setResult: (r: MeihuaResult | null) => void
  containerWidth: number
  onToggleCollapse?: () => void
  chartCollapsed?: boolean
  collapseNonce?: number
}

type TabMode = 'time' | 'number' | 'text'

export default function MeihuaForm({ result, setResult, containerWidth, chartCollapsed, collapseNonce }: MeihuaFormProps) {
  const [tab, setTab] = useState<TabMode>('time')

  // 数字起卦状态
  const [num1, setNum1] = useState('')
  const [num2, setNum2] = useState('')
  const [num3, setNum3] = useState('')

  // 文字起卦状态
  const [textInput, setTextInput] = useState('')

  // 时间起卦：自定义时间选择弹窗
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [customTime, setCustomTime] = useState<Date | null>(null)
  const [calendarType, setCalendarType] = useState<'公历' | '农历'>('公历')
  // 弹窗内临时选择值
  const [tempYear, setTempYear] = useState('')
  const [tempMonth, setTempMonth] = useState('')
  const [tempDay, setTempDay] = useState('')
  const [tempHour, setTempHour] = useState('')
  const [tempMinute, setTempMinute] = useState('')

  if (result) {
    return (
      <MeihuaResultView
        result={result}
        onBack={() => setResult(null)}
        containerWidth={containerWidth}
        chartCollapsed={chartCollapsed}
        collapseNonce={collapseNonce}
      />
    )
  }

  const handleTimeDivination = () => {
    const dt = customTime ?? new Date()
    const data = timeDivination(dt)
    const res = buildMeihuaResult(data, 'time', {
      timeInput: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
    })
    setResult(res)
  }

  // 打开时间选择弹窗：初始化为当前选择时间或系统当前时间
  const openTimeModal = () => {
    const base = customTime ?? new Date()
    if (calendarType === '农历') {
      // 农历模式：将公历 Date 转为农历年月日
      const lunar = Lunar.fromDate(base)
      setTempYear(String(lunar.getYear()))
      setTempMonth(String(lunar.getMonth()))
      setTempDay(String(lunar.getDay()))
      const h = base.getHours()
      setTempHour(h === 0 ? '24' : String(h).padStart(2, '0'))
      setTempMinute('00')
    } else {
      setTempYear(String(base.getFullYear()))
      setTempMonth(String(base.getMonth() + 1).padStart(2, '0'))
      setTempDay(String(base.getDate()).padStart(2, '0'))
      const h = base.getHours()
      setTempHour(h === 0 ? '24' : String(h).padStart(2, '0'))
      setTempMinute(String(base.getMinutes()).padStart(2, '0'))
    }
    setShowTimeModal(true)
  }

  // 确认时间选择
  const confirmTime = () => {
    const y = parseInt(tempYear)
    const m = parseInt(tempMonth)
    const d = parseInt(tempDay)
    const h = parseInt(tempHour) === 24 ? 0 : parseInt(tempHour)
    const min = calendarType === '农历' ? 0 : parseInt(tempMinute)
    if (!y || !m || !d) return

    let date: Date
    if (calendarType === '农历') {
      // 农历转公历：使用 lunar-javascript 的 Lunar.fromYmdHms 转换
      const lunar = Lunar.fromYmdHms(y, m, d, h, min, 0)
      const solar = lunar.getSolar()
      date = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour(), solar.getMinute())
    } else {
      date = new Date(y, m - 1, d, h, min)
    }
    setCustomTime(date)
    setShowTimeModal(false)
  }

  // 格式化当前显示时间
  const formatTimeDisplay = () => {
    const dt = customTime ?? new Date()
    const prefix = customTime ? '所选时间' : '当前时间'
    return `${prefix}：${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
  }

  const handleNumberDivination = () => {
    const n = parseInt(num1 + num2 + num3) || 0
    if (n <= 0) return
    const data = numberDivination(n)
    const res = buildMeihuaResult(data, 'number', { numberInput: n })
    setResult(res)
  }

  const handleTextDivination = () => {
    if (!textInput.trim()) return
    const data = textDivination(textInput.trim())
    const res = buildMeihuaResult(data, 'text', { textInput: textInput.trim() })
    setResult(res)
  }

  const isNumberValid = num1 && num2 && num3
    && !isNaN(parseInt(num1)) && !isNaN(parseInt(num2)) && !isNaN(parseInt(num3))

  return (
    <div className="feature-bazi">
      <div className="bazi-form-card meihua-form-card">
        <div className="bazi-form-header">
          <h2 className="bazi-form-title">梅花易数起卦</h2>
        </div>

        {/* 起卦方式切换 */}
        <div className="bazi-form-row">
          <label className="bazi-form-label">起卦方式</label>
          <div className="bazi-calendar-toggle">
            <button
              type="button"
              className={`bazi-calendar-btn${tab === 'time' ? ' active' : ''}`}
              onClick={() => setTab('time')}
            >
              时间起卦
            </button>
            <button
              type="button"
              className={`bazi-calendar-btn${tab === 'number' ? ' active' : ''}`}
              onClick={() => setTab('number')}
            >
              数字起卦
            </button>
            <button
              type="button"
              className={`bazi-calendar-btn${tab === 'text' ? ' active' : ''}`}
              onClick={() => setTab('text')}
            >
              文字起卦
            </button>
          </div>
        </div>

        {/* 时间起卦 */}
        {tab === 'time' && (
          <div className="meihua-method-panel">
            <p className="meihua-method-desc">
              点击下方时间可选择公历或农历，系统自动换算为农历年月日时，按照《梅花易数》时间起卦法生成卦象。
            </p>
            <div
              className="meihua-current-time meihua-time-trigger"
              onClick={openTimeModal}
              role="button"
              tabIndex={0}
              title="点击选择时间"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTimeModal() } }}
            >
              {formatTimeDisplay()}
            </div>
            <button
              type="button"
              className="bazi-submit-btn"
              onClick={handleTimeDivination}
            >
              开始起卦
            </button>
          </div>
        )}

        {/* 时间选择弹窗 */}
        {showTimeModal && tab === 'time' && (
          <MeihuaTimeModal
            calendarType={calendarType}
            onCalendarChange={setCalendarType}
            tempYear={tempYear}
            tempMonth={tempMonth}
            tempDay={tempDay}
            tempHour={tempHour}
            tempMinute={tempMinute}
            onTempYearChange={setTempYear}
            onTempMonthChange={setTempMonth}
            onTempDayChange={setTempDay}
            onTempHourChange={setTempHour}
            onTempMinuteChange={setTempMinute}
            onConfirm={confirmTime}
            onClose={() => setShowTimeModal(false)}
          />
        )}

        {/* 数字起卦 */}
        {tab === 'number' && (
          <div className="meihua-method-panel">
            <p className="meihua-method-desc">
              请输入三个数字，分别对应上卦、下卦和动爻。数字将自动取除以8或6的余数来确定卦象。
            </p>
            <div className="meihua-number-inputs">
              <div className="meihua-number-field">
                <label>上卦数字</label>
                <input
                  type="number"
                  className="bazi-form-input"
                  placeholder="1-999"
                  value={num1}
                  onChange={e => setNum1(e.target.value)}
                  min={1}
                  max={999}
                />
              </div>
              <div className="meihua-number-field">
                <label>下卦数字</label>
                <input
                  type="number"
                  className="bazi-form-input"
                  placeholder="1-999"
                  value={num2}
                  onChange={e => setNum2(e.target.value)}
                  min={1}
                  max={999}
                />
              </div>
              <div className="meihua-number-field">
                <label>动爻数字</label>
                <input
                  type="number"
                  className="bazi-form-input"
                  placeholder="1-999"
                  value={num3}
                  onChange={e => setNum3(e.target.value)}
                  min={1}
                  max={999}
                />
              </div>
            </div>
            <button
              type="button"
              className="bazi-submit-btn"
              onClick={handleNumberDivination}
              disabled={!isNumberValid}
            >
              开始起卦
            </button>
          </div>
        )}

        {/* 文字起卦 */}
        {tab === 'text' && (
          <div className="meihua-method-panel">
            <p className="meihua-method-desc">
              输入汉字，系统将根据汉字笔画数自动转换为卦象。上卦取前半部分，下卦取后半部分，总笔画数定动爻。
            </p>
            <div className="meihua-text-area">
              <textarea
                className="bazi-form-input"
                placeholder="请输入要占卜的汉字（如：前程、婚姻、事业...）"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                rows={3}
              />
            </div>
            <button
              type="button"
              className="bazi-submit-btn"
              onClick={handleTextDivination}
              disabled={!textInput.trim()}
            >
              开始起卦
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 结果展示组件（与八字排盘统一风格）──

function MeihuaResultView({
  result,
  onBack,
  containerWidth,
  chartCollapsed,
  collapseNonce,
}: {
  result: MeihuaResult
  onBack: () => void
  containerWidth: number
  chartCollapsed?: boolean
  collapseNonce?: number
}) {
  const [cardExpanded, setCardExpanded] = useState(true)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)

  // 序列化排盘数据为上下文（用于解盘报告）
  const contextData = useMemo(() => {
    const text = serializeMeihuaContext(result)
    const json = serializeMeihuaJson(result)
    return `## 排盘 JSON 数据（结构化数据，优先基于此数据进行精确分析）\n\n\`\`\`json\n${json}\n\`\`\`\n\n---\n\n${text}`
  }, [result])

  // 纯 JSON 格式排盘数据（用于排盘信息弹窗，与注入 LLM 的数据一致）
  const jsonData = useMemo(() => serializeMeihuaJson(result), [result])

  useEffect(() => {
    if (chartCollapsed !== undefined) {
      setCardExpanded(!chartCollapsed)
    }
  }, [chartCollapsed])

  useEffect(() => {
    if (collapseNonce !== undefined && collapseNonce > 0) {
      setCardExpanded(false)
    }
  }, [collapseNonce])

  const methodLabel = result.method === 'time' ? '时间起卦' : result.method === 'number' ? '数字起卦' : '文字起卦'

  return (
    <div className="feature-bazi meihua-result-feature">
      <div className="bazi-combined-card meihua-result-card">
        {/* 卡片头部：返回 + 标题 + 展开/收缩 */}
        <div className="bazi-card-header" onClick={() => setCardExpanded(!cardExpanded)}>
          <div className="bazi-left-actions" onClick={(e) => e.stopPropagation()}>
            <BackButton onClick={() => onBack()} />
            <button
              type="button"
              className="bazi-toolbar-btn"
              title="排盘信息"
              onClick={() => setShowInfoModal(true)}
            >
              排盘信息
            </button>
          </div>

          <div className="bazi-card-title">
            <div className="bazi-info-card">
              <h2 className="bazi-name">
                梅花易数排盘
                <span className="bazi-gender-tag">{methodLabel}</span>
              </h2>
              <p className="bazi-desc">
                本卦 {result.benGua.name} · {result.benGua.upper.name}上{result.benGua.lower.name}下
              </p>
              <p className="bazi-pattern-desc">
                体用 <span className="bazi-pattern-value">{result.tiYong.relation}</span>
                · 吉凶 <span className={`bazi-pattern-value ${result.tiYong.isAuspicious ? 'auspicious' : 'inauspicious'}`}>{result.tiYong.isAuspicious ? '吉' : '凶'}</span>
              </p>
            </div>
          </div>

          <div className="bazi-card-actions" onClick={(e) => e.stopPropagation()}>
            {/* 解盘报告按钮 - 位于展开/收缩按钮左侧 */}
            <button
              type="button"
              className="bazi-toolbar-btn"
              onClick={(e) => { e.stopPropagation(); setShowReportModal(true); }}
            >
              解盘报告
            </button>
            <button
              type="button"
              className="bazi-expand-btn"
              aria-expanded={cardExpanded}
              onClick={() => setCardExpanded(!cardExpanded)}
            >
              {cardExpanded ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 卡片内容区：可展开/收缩 */}
        <div className={`bazi-card-content ${cardExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="bazi-chart-content-wrapper">
            {/* 三卦向量图展示 */}
            <div className="liuyao-hexagram-section">
              <h3 className="liuyao-section-title">卦象图</h3>
              <div className="liuyao-hexagram-grid">
                <div className="liuyao-hexagram-card liuyao-hexagram-ben">
                  <div className="liuyao-hexagram-label">
                    <span className="liuyao-hexagram-tag">本卦</span>
                    <span className="liuyao-hexagram-stage-label">（当前）</span>
                  </div>
                  <div className="liuyao-hexagram-svg-wrap">
                    <HexagramSvg
                      yaos={composeLiuYaoYaos(
                        result.benGua.upper.name,
                        result.benGua.lower.name
                      )}
                      size="sm"
                    />
                  </div>
                  <div className="liuyao-hexagram-info">
                    <div className="liuyao-hexagram-name">{result.benGua.name}</div>
                    <div className="liuyao-hexagram-desc">
                      {result.benGua.upper.name}上{result.benGua.lower.name}下
                      · {result.benGua.upper.element}
                    </div>
                  </div>
                </div>

                <div className="liuyao-hexagram-card liuyao-hexagram-hu">
                  <div className="liuyao-hexagram-label">
                    <span className="liuyao-hexagram-tag">互卦</span>
                    <span className="liuyao-hexagram-stage-label">（过程）</span>
                  </div>
                  <div className="liuyao-hexagram-svg-wrap">
                    <HexagramSvg
                      yaos={composeLiuYaoYaos(
                        result.huGua.upper.name,
                        result.huGua.lower.name
                      )}
                      size="sm"
                    />
                  </div>
                  <div className="liuyao-hexagram-info">
                    <div className="liuyao-hexagram-name">{result.huGua.name}</div>
                    <div className="liuyao-hexagram-desc">
                      {result.huGua.upper.name}上{result.huGua.lower.name}下
                      · {result.huGua.upper.element}
                    </div>
                  </div>
                </div>

                <div className="liuyao-hexagram-card liuyao-hexagram-zhi">
                  <div className="liuyao-hexagram-label">
                    <span className="liuyao-hexagram-tag">变卦</span>
                    <span className="liuyao-hexagram-stage-label">（结果）</span>
                  </div>
                  <div className="liuyao-hexagram-svg-wrap">
                    <HexagramSvg
                      yaos={composeLiuYaoYaos(
                        result.bianGua.upper.name,
                        result.bianGua.lower.name
                      )}
                      size="sm"
                    />
                  </div>
                  <div className="liuyao-hexagram-info">
                    <div className="liuyao-hexagram-name">{result.bianGua.name}</div>
                    <div className="liuyao-hexagram-desc">
                      第{result.dongYao}爻动 · {result.bianGua.upper.element}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 起卦信息 */}
            <div className="bazi-info-panel">
              <h3 className="liuyao-section-title">基本信息</h3>
              <div className="liuyao-info-grid">
                <div className="bazi-info-row">
                  <span className="bazi-info-label">起卦方式</span>
                  <span className="bazi-info-value">{methodLabel}</span>
                </div>
                <div className="bazi-info-row">
                  <span className="bazi-info-label">起卦时间</span>
                  <span className="bazi-info-value">{result.queryTime}</span>
                </div>
                {result.numberInput !== undefined && (
                  <div className="bazi-info-row">
                    <span className="bazi-info-label">输入数字</span>
                    <span className="bazi-info-value">{result.numberInput}</span>
                  </div>
                )}
                {result.textInput && (
                  <div className="bazi-info-row">
                    <span className="bazi-info-label">输入文字</span>
                    <span className="bazi-info-value">{result.textInput}</span>
                  </div>
                )}
                <div className="bazi-info-row">
                  <span className="bazi-info-label">动爻位置</span>
                  <span className="bazi-info-value">第{result.dongYao}爻</span>
                </div>
                <div className="bazi-info-row">
                  <span className="bazi-info-label">五行</span>
                  <span className="bazi-info-value">
                    上{result.benGua.upper.element} · 下{result.benGua.lower.element}
                  </span>
                </div>
              </div>
            </div>

            {/* 体用分析 */}
            <div className="meihua-tiyong-panel">
              <h3 className="liuyao-section-title">体用生克分析</h3>
              <div className="meihua-tiyong-cards">
                <div className={`meihua-tiyong-card ti${result.tiYong.isAuspicious ? ' auspicious' : ' inauspicious'}`}>
                  <div className="meihua-tiyong-svg-wrap">
                    <HexagramSvg
                      yaos={composeLiuYaoYaos(result.tiYong.tiGua.name, result.tiYong.tiGua.name)}
                      size="sm"
                    />
                  </div>
                  <div className="meihua-tiyong-label">体卦（自身）</div>
                  <div className="meihua-tiyong-name">{result.tiYong.tiGua.name}</div>
                  <div className="meihua-tiyong-element">{result.tiYong.tiGua.element}行</div>
                </div>
                <div className="meihua-tiyong-relation">
                  <div className="meihua-tiyong-relation-label">{result.tiYong.relation}</div>
                  <div className={`meihua-tiyong-verdict ${result.tiYong.isAuspicious ? 'auspicious' : 'inauspicious'}`}>
                    {result.tiYong.isAuspicious ? '吉' : '凶'}
                  </div>
                </div>
                <div className={`meihua-tiyong-card yong${result.tiYong.isAuspicious ? ' auspicious' : ' inauspicious'}`}>
                  <div className="meihua-tiyong-svg-wrap">
                    <HexagramSvg
                      yaos={composeLiuYaoYaos(result.tiYong.yongGua.name, result.tiYong.yongGua.name)}
                      size="sm"
                    />
                  </div>
                  <div className="meihua-tiyong-label">用卦（之事）</div>
                  <div className="meihua-tiyong-name">{result.tiYong.yongGua.name}</div>
                  <div className="meihua-tiyong-element">{result.tiYong.yongGua.element}行</div>
                </div>
              </div>
              <div className="meihua-tiyong-detail">
                {result.tiYong.detail}
              </div>
            </div>

            {/* 卦象详情 */}
            <div className="meihua-gua-detail">
              <h3 className="liuyao-section-title">三卦详解</h3>
              <div className="meihua-gua-grid">
                <div className="meihua-gua-item">
                  <div className="meihua-gua-stage">本卦（当前）</div>
                  <div className="meihua-gua-body">
                    <div>上卦：{result.benGua.upper.name}（{result.benGua.upper.element}·{result.benGua.upper.nature}）</div>
                    <div>下卦：{result.benGua.lower.name}（{result.benGua.lower.element}·{result.benGua.lower.nature}）</div>
                    <div className="meihua-gua-nature">卦象：{result.benGua.upper.nature}上{result.benGua.lower.nature}下</div>
                  </div>
                </div>
                <div className="meihua-gua-item">
                  <div className="meihua-gua-stage">互卦（过程）</div>
                  <div className="meihua-gua-body">
                    <div>上卦：{result.huGua.upper.name}（{result.huGua.upper.element}·{result.huGua.upper.nature}）</div>
                    <div>下卦：{result.huGua.lower.name}（{result.huGua.lower.element}·{result.huGua.lower.nature}）</div>
                    <div className="meihua-gua-nature">卦象：{result.huGua.upper.nature}上{result.huGua.lower.nature}下</div>
                  </div>
                </div>
                <div className="meihua-gua-item">
                  <div className="meihua-gua-stage">变卦（结果）</div>
                  <div className="meihua-gua-body">
                    <div>上卦：{result.bianGua.upper.name}（{result.bianGua.upper.element}·{result.bianGua.upper.nature}）</div>
                    <div>下卦：{result.bianGua.lower.name}（{result.bianGua.lower.element}·{result.bianGua.lower.nature}）</div>
                    <div className="meihua-gua-nature">动爻：第{result.dongYao}爻 · {result.bianGua.upper.nature}上{result.bianGua.lower.nature}下</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 解盘报告弹窗 */}
      {showReportModal && (
        <BaziReportModal
          chartType="梅花易数"
          chartName={`梅花易数_${result.queryTime}`}
          contextData={contextData}
          archiveData={{
            name: `梅花易数_${result.queryTime}`,
            gender: '未知',
            birth_datetime: result.queryTime,
            birthplace: null,
            calendar_type: '公历',
            bazi_result: result as unknown as Record<string, unknown>,
          }}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* 排盘信息弹窗 */}
      {showInfoModal && (
        <DivinationInfoModal
          title="梅花易数排盘信息"
          chartType="梅花易数"
          chartName={`梅花易数_${result.queryTime}`}
          contextData={contextData}
          jsonData={jsonData}
          archiveData={{
            name: `梅花易数_${result.queryTime}`,
            gender: '未知',
            birth_datetime: result.queryTime,
            birthplace: null,
            calendar_type: '公历',
            bazi_result: result as unknown as Record<string, unknown>,
          }}
          onClose={() => setShowInfoModal(false)}
        />
      )}
    </div>
  )
}

// ── 时间选择弹窗（与八字出生时间输入框风格一致，支持公历/农历）──

function MeihuaTimeModal({
  calendarType,
  onCalendarChange,
  tempYear,
  tempMonth,
  tempDay,
  tempHour,
  tempMinute,
  onTempYearChange,
  onTempMonthChange,
  onTempDayChange,
  onTempHourChange,
  onTempMinuteChange,
  onConfirm,
  onClose,
}: {
  calendarType: '公历' | '农历'
  onCalendarChange: (t: '公历' | '农历') => void
  tempYear: string
  tempMonth: string
  tempDay: string
  tempHour: string
  tempMinute: string
  onTempYearChange: (v: string) => void
  onTempMonthChange: (v: string) => void
  onTempDayChange: (v: string) => void
  onTempHourChange: (v: string) => void
  onTempMinuteChange: (v: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  const isLunar = calendarType === '农历'

  const yearOptions = useMemo(() => {
    if (isLunar) {
      const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
      const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
      const ganzhi60 = Array.from({ length: 60 }, (_, i) => `${GAN[i % 10]}${ZHI[i % 12]}`)
      const years: { value: string; label: string }[] = []
      for (let y = 1950; y <= 2050; y++) {
        const ganzhi = ganzhi60[(y - 4) % 60]
        years.push({ value: String(y), label: `${y} ${ganzhi}` })
      }
      return years
    }
    return Array.from({ length: 201 }, (_, i) => {
      const y = 1950 + i
      return { value: String(y), label: String(y) }
    })
  }, [isLunar])

  const monthOptions = useMemo(() => {
    if (isLunar) {
      const lunarMonths = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']
      return lunarMonths.map((m, i) => ({ value: String(i + 1), label: m }))
    }
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      return { value: String(m), label: m.toString().padStart(2, '0') }
    })
  }, [isLunar])

  const dayOptions = useMemo(() => {
    if (isLunar) {
      const lunarDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']
      return lunarDays.map((d, i) => ({ value: String(i + 1), label: d }))
    }
    return Array.from({ length: 31 }, (_, i) => {
      const d = i + 1
      return { value: String(d), label: d.toString().padStart(2, '0') }
    })
  }, [isLunar])

  const hourOptions = useMemo(() => {
    const shichenList = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时']
    const result: { value: string; label: string }[] = []
    for (let i = 1; i <= 24; i++) {
      const h = i.toString().padStart(2, '0')
      let label: string
      if (isLunar) {
        const shichenIdx = Math.floor((i % 24) / 2)
        label = `${h} ${shichenList[shichenIdx]}`
      } else {
        label = i === 24 ? '24时(子时)' : `${h}时`
      }
      result.push({ value: h, label })
    }
    return result
  }, [isLunar])

  const minuteOptions = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => {
      const m = i.toString().padStart(2, '0')
      return { value: m, label: m }
    }),
  [],
  )

  const isValid = tempYear && tempMonth && tempDay && tempHour

  return ReactDOM.createPortal(
    <div className="bazi-datetime-overlay" onClick={onClose}>
      <div className="bazi-datetime-modal-picker" onClick={(e) => e.stopPropagation()}>
        <div className="bazi-dt-top-bar">
          <div className="bazi-dt-calendar-toggle">
            {(['公历', '农历'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`bazi-dt-calendar-btn${calendarType === t ? ' active' : ''}`}
                onClick={() => onCalendarChange(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="bazi-dt-close-btn"
            onClick={onClose}
            title="关闭"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="bazi-dt-picker-body">
          <div className="bazi-dt-picker-columns">
            <PickerColumn
              label="年"
              options={yearOptions}
              value={tempYear}
              onChange={onTempYearChange}
            />
            <PickerColumn
              label="月"
              options={monthOptions}
              value={tempMonth}
              onChange={onTempMonthChange}
            />
            <PickerColumn
              label="日"
              options={dayOptions}
              value={tempDay}
              onChange={onTempDayChange}
            />
            <PickerColumn
              label="时"
              options={hourOptions}
              value={tempHour}
              onChange={onTempHourChange}
            />
            {/* 公历才显示分钟列 */}
            {!isLunar && (
              <PickerColumn
                label="分"
                options={minuteOptions}
                value={tempMinute}
                onChange={onTempMinuteChange}
              />
            )}
          </div>
        </div>

        <div className="bazi-dt-bottom-bar">
          <button
            type="button"
            className="bazi-dt-confirm-btn"
            onClick={onConfirm}
            disabled={!isValid}
          >
            确定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}