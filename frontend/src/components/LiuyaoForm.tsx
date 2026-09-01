/**
 * 六爻占卜起卦表单组件
 *
 * 支持两种起卦方式：
 * 1. 铜钱摇卦：模拟6次三枚铜钱投掷，含动画效果
 * 2. 手工录入：六行爻位选择器，每行可选老阳/少阳/少阴/老阴
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import BackButton from './BackButton'
import BaziReportModal from './BaziReportModal'
import DivinationInfoModal from './DivinationInfoModal'
import {
  manualDivination,
  performLiuyaoPan,
  tossSingleYao,
  serializeLiuyaoContext,
  serializeLiuyaoJson,
  type LiuyaoResult,
  type CoinToss,
} from '../utils/liuyaoCalculator'
import HexagramSvg from './HexagramSvg'

interface LiuyaoFormProps {
  result: LiuyaoResult | null
  setResult: (r: LiuyaoResult | null) => void
  containerWidth: number
  onToggleCollapse?: () => void
  chartCollapsed?: boolean
  collapseNonce?: number
}

type TabMode = 'coin' | 'manual'

const YAO_OPTIONS = [
  { value: 9, label: '老阳 ⚊○', shortLabel: '老阳', desc: '三正面', coins: [true, true, true] },
  { value: 7, label: '少阳 ⚊', shortLabel: '少阳', desc: '一背二正', coins: [true, true, false] },
  { value: 8, label: '少阴 ⚋', shortLabel: '少阴', desc: '一正二背', coins: [true, false, false] },
  { value: 6, label: '老阴 ⚋×', shortLabel: '老阴', desc: '三背面', coins: [false, false, false] },
]

// 根据爻值获取铜钱图案和面序索引
function getYaoMeta(value: number | null) {
  if (value == null) return null
  return YAO_OPTIONS.find(o => o.value === value) ?? null
}

// 根据 3 枚铜钱计算爻值
function coinsToYao(coins: boolean[]): number {
  const heads = coins.filter(Boolean).length
  // 3正=老阳(9), 2正1背=少阳(7), 1正2背=少阴(8), 3背=老阴(6)
  if (heads === 3) return 9
  if (heads === 2) return 7
  if (heads === 1) return 8
  return 6
}

// 根据爻值获取对应铜钱配置
function yaoToCoins(value: number): boolean[] {
  switch (value) {
    case 9: return [true, true, true]   // 老阳
    case 7: return [true, true, false]  // 少阳
    case 8: return [true, false, false] // 少阴
    case 6: return [false, false, false] // 老阴
    default: return [true, true, true]
  }
}

export default function LiuyaoForm({ result, setResult, containerWidth, chartCollapsed, collapseNonce }: LiuyaoFormProps) {
  const [tab, setTab] = useState<TabMode>('coin')

  // 铜钱摇卦状态：逐爻滚动，由用户点击"停止"定格
  // phase: idle(未开始) → rolling(某一爻滚动中) → locking(已定一爻，过渡到下一爻) → ready(六爻已定，等待排盘) → panning(排盘中)
  type TossPhase = 'idle' | 'rolling' | 'locking' | 'ready' | 'panning'
  const [phase, setPhase] = useState<TossPhase>('idle')
  const [coinTosses, setCoinTosses] = useState<CoinToss[]>([])
  const [currentYaoIndex, setCurrentYaoIndex] = useState(0)
  const [rollingToss, setRollingToss] = useState<CoinToss | null>(null)

  // 追踪 interval / timer 引用，防止重复启动与组件卸载泄漏
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 手工录入状态：6 爻 × 3 铜钱（true=正, false=背），初始全为正
  const [manualCoins, setManualCoins] = useState<boolean[][]>(() =>
    Array.from({ length: 6 }, () => [true, true, true])
  )
  const [manualLocked, setManualLocked] = useState<boolean[]>(Array(6).fill(false))

  // 清理所有定时器（组件卸载时调用）
  const cleanupAll = useCallback(() => {
    if (rollIntervalRef.current) {
      clearInterval(rollIntervalRef.current)
      rollIntervalRef.current = null
    }
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
  }, [])

  useEffect(() => () => cleanupAll(), [cleanupAll])

  // 启动某一爻滚动动画（须在 early return 之前声明，保持 hook 调用顺序稳定）
  const startRolling = useCallback((yaoIndex: number) => {
    setCurrentYaoIndex(yaoIndex)
    setRollingToss(tossSingleYao())
    setPhase('rolling')
    // 快速循环显示随机铜钱组合，模拟摇卦滚动
    rollIntervalRef.current = setInterval(() => {
      setRollingToss(tossSingleYao())
    }, 90)
  }, [])

  // 结果展示
  if (result) {
    return (
      <LiuyaoResultView
        result={result}
        onBack={() => {
          setResult(null)
          // 返回后回到 ready 状态，保留六爻数据，用户可直接重新排盘或重置
          setPhase('ready')
        }}
        containerWidth={containerWidth}
        chartCollapsed={chartCollapsed}
        collapseNonce={collapseNonce}
      />
    )
  }

  // 开始摇卦：重置并启动第一爻
  const handleStart = () => {
    if (phase !== 'idle' && phase !== 'ready') return
    cleanupAll()
    setCoinTosses([])
    setCurrentYaoIndex(0)
    startRolling(0)
  }

  // 停止当前爻：定格结果，过渡到下一爻或排盘
  const handleStop = () => {
    if (phase !== 'rolling' || !rollingToss) return
    // 停止滚动
    if (rollIntervalRef.current) {
      clearInterval(rollIntervalRef.current)
      rollIntervalRef.current = null
    }
    const locked = rollingToss
    const newTosses = [...coinTosses, locked]
    setCoinTosses(newTosses)
    setRollingToss(null)

    const nextIndex = currentYaoIndex + 1
    if (nextIndex < 6) {
      // 短暂过渡后自动开始下一爻滚动
      setPhase('locking')
      transitionTimerRef.current = setTimeout(() => {
        startRolling(nextIndex)
      }, 700)
    } else {
      // 六爻完成，等待用户点击"排盘"
      setPhase('ready')
    }
  }

  // 摇卦按钮点击：idle/ready 时开始，rolling 时停止
  const handleTossClick = () => {
    if (phase === 'idle' || phase === 'ready') handleStart()
    else if (phase === 'rolling') handleStop()
  }

  // 排盘按钮点击：仅 ready 状态可执行
  const handlePanning = () => {
    if (phase !== 'ready') return
    setPhase('panning')
    const yaoString = coinTosses.map(t => t.result).join('')
    transitionTimerRef.current = setTimeout(() => {
      try {
        const pan = performLiuyaoPan(yaoString, 'coin', coinTosses)
        setResult(pan)
      } catch (e) {
        console.error('[LiuyaoForm] 排盘失败:', e)
        setPhase('idle')
        setCoinTosses([])
        setCurrentYaoIndex(0)
      }
    }, 600)
  }

  const handleManualSubmit = () => {
    const values = manualCoins.map(coinsToYao)
    if (values.length !== 6) return

    const yaoStr = values.join('')
    try {
      const normalized = manualDivination(yaoStr)
      const pan = performLiuyaoPan(normalized, 'manual')
      setResult(pan)
    } catch {
      // 输入无效，静默处理
    }
  }

  // 手工录入重置：仅清空手工录入状态，不影响铜钱摇卦数据
  const handleManualReset = () => {
    setManualCoins(Array.from({ length: 6 }, () => [true, true, true]))
    setManualLocked(Array(6).fill(false))
  }

  const isManualComplete = true // 手工录入初始即有合法默认值，用户可直接提交

  // 摇卦按钮文案与禁用状态
  const tossButtonLabel = (() => {
    switch (phase) {
      case 'rolling': return '停止'
      case 'locking': return '停止'
      case 'ready': return '重新摇卦'
      case 'panning': return '摇卦'
      default: return '摇卦'
    }
  })()
  const tossButtonDisabled = phase === 'locking' || phase === 'panning'

  // 排盘按钮文案与禁用状态
  const panButtonLabel = phase === 'panning' ? '排盘中' : '排盘'
  const panButtonDisabled = phase !== 'ready'

  return (
    <div className="feature-bazi">
      <div className="bazi-form-card liuyao-form-card">
        <div className="bazi-form-header">
          <h2 className="bazi-form-title">六爻占卜起卦</h2>
        </div>

        {/* 起卦方式切换 */}
        <div className="bazi-form-row">
          <label className="bazi-form-label">起卦方式</label>
          <div className="bazi-calendar-toggle">
            <button
              type="button"
              className={`bazi-calendar-btn${tab === 'coin' ? ' active' : ''}`}
              onClick={() => { setTab('coin') }}
            >
              铜钱摇卦
            </button>
            <button
              type="button"
              className={`bazi-calendar-btn${tab === 'manual' ? ' active' : ''}`}
              onClick={() => { setTab('manual') }}
            >
              手工录入
            </button>
          </div>
        </div>

        {/* 铜钱摇卦模式 */}
        {tab === 'coin' && (
          <div className="liuyao-coin-area">
            <div className="liuyao-coin-info">
              <p>点击"摇卦"启动，点击"停止"定格结果</p>
              <div className="liuyao-info-btns">
                <button
                  type="button"
                  className="liuyao-reset-btn"
                  onClick={handleTossClick}
                  disabled={tossButtonDisabled}
                >
                  {tossButtonLabel}
                </button>
              </div>
            </div>

            {/* 当前爻滚动动画 */}
            {phase === 'rolling' && rollingToss && (
              <div className="liuyao-tossing-animation">
                <span className="liuyao-tossing-text">
                  第 {currentYaoIndex + 1} 爻摇卦中：{rollingToss.label}
                </span>
                <span className="liuyao-toss-coins liuyao-tossing-coins">
                  {rollingToss.coins.map((c, j) => (
                    <span key={j} className={`liuyao-coin ${c ? 'heads' : 'tails'}`}>
                      {c ? '正' : '背'}
                    </span>
                  ))}
                </span>
              </div>
            )}

            {/* 过渡/排盘提示 */}
            {(phase === 'locking' || phase === 'panning') && coinTosses.length > 0 && (
              <div className="liuyao-tossing-animation">
                <span className="liuyao-tossing-text">
                  {phase === 'panning'
                    ? '六爻皆定，正在排盘...'
                    : `第 ${coinTosses.length} 爻已定：${coinTosses[coinTosses.length - 1]?.label}，准备下一爻`}
                </span>
              </div>
            )}

            {/* 已锁定结果列表 - 始终存在于 DOM 中 */}
            <div className="liuyao-tosses-display">
              {coinTosses.length > 0 ? coinTosses.filter(Boolean).map((toss, i) => (
                <div key={i} className="liuyao-toss-item">
                  <span className="liuyao-toss-label">{i === 0 ? '初' : i === 5 ? '上' : i + 1}爻</span>
                  <span className="liuyao-toss-coins">
                    {toss.coins && toss.coins.map((c, j) => (
                      <span key={j} className={`liuyao-coin ${c ? 'heads' : 'tails'}`}>
                        {c ? '正' : '背'}
                      </span>
                    ))}
                  </span>
                  <span className={`liuyao-toss-result ${toss.result === 6 || toss.result === 9 ? 'changing' : ''}`}>
                    {toss.label}
                  </span>
                </div>
              )) : (
                <div className="liuyao-tosses-empty">尚未开始摇卦</div>
              )}
            </div>

            <div className="liuyao-coin-actions">
              <button
                type="button"
                className={`bazi-submit-btn${phase === 'ready' ? ' liuyao-ready-btn' : ''}`}
                onClick={handlePanning}
                disabled={panButtonDisabled}
              >
                {panButtonLabel}
              </button>
            </div>
          </div>
        )}

        {/* 手工录入模式 */}
        {tab === 'manual' && (
          <div className="liuyao-manual-area">
            <div className="liuyao-coin-info">
              <p>点击铜钱可翻转正/背，点击其他区域循环切换爻属性</p>
              <button
                type="button"
                className="liuyao-reset-btn"
                onClick={handleManualReset}
              >
                重置
              </button>
            </div>

            <div className="liuyao-manual-rows">
              {manualCoins.map((coins, i) => {
                const yaoValue = coinsToYao(coins)
                const meta = getYaoMeta(yaoValue)
                const isChanging = yaoValue === 6 || yaoValue === 9
                const locked = manualLocked[i]

                const flipCoin = (coinIdx: number) => {
                  const next = manualCoins.map(c => [...c])
                  next[i][coinIdx] = !next[i][coinIdx]
                  setManualCoins(next)
                  const nextLocked = [...manualLocked]
                  nextLocked[i] = true
                  setManualLocked(nextLocked)
                }

                const cycleYao = () => {
                  const currentIdx = YAO_OPTIONS.findIndex(o => o.value === yaoValue)
                  const nextValue = YAO_OPTIONS[(currentIdx + 1) % YAO_OPTIONS.length].value
                  const next = manualCoins.map(c => [...c])
                  next[i] = yaoToCoins(nextValue)
                  setManualCoins(next)
                  const nextLocked = [...manualLocked]
                  nextLocked[i] = true
                  setManualLocked(nextLocked)
                }

                return (
                  <div
                    key={i}
                    className={`liuyao-toss-item manual-row${locked ? ' selected' : ''}`}
                    onClick={cycleYao}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); cycleYao() } }}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="liuyao-toss-label">{i === 0 ? '初' : i === 5 ? '上' : i + 1}爻</span>
                    <span className="liuyao-toss-coins">
                      {coins.map((heads, j) => (
                        <span
                          key={j}
                          className={`liuyao-coin ${heads ? 'heads' : 'tails'}`}
                          onClick={(e) => { e.stopPropagation(); flipCoin(j) }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); flipCoin(j) } }}
                          role="button"
                          tabIndex={0}
                          title="点击翻转"
                        >
                          {heads ? '正' : '背'}
                        </span>
                      ))}
                    </span>
                    <span className={`liuyao-toss-result${isChanging ? ' changing' : ''}`}>
                      {meta?.shortLabel ?? ''}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="liuyao-manual-actions">
              <button
                type="button"
                className="bazi-submit-btn"
                onClick={handleManualSubmit}
                disabled={!isManualComplete}
              >
                {isManualComplete ? '排盘' : '请选择六爻'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 结果展示组件 ──

function LiuyaoResultView({
  result,
  onBack,
  containerWidth,
  chartCollapsed,
  collapseNonce,
}: {
  result: LiuyaoResult
  onBack: () => void
  containerWidth: number
  chartCollapsed?: boolean
  collapseNonce?: number
}) {
  const { pan } = result
  const [cardExpanded, setCardExpanded] = useState(true)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)

  // 序列化排盘数据为上下文（用于解盘报告）
  const contextData = useMemo(() => {
    const text = serializeLiuyaoContext(result)
    const json = serializeLiuyaoJson(result)
    return `## 排盘 JSON 数据（结构化数据，优先基于此数据进行精确分析）\n\n\`\`\`json\n${json}\n\`\`\`\n\n---\n\n${text}`
  }, [result])

  // 纯 JSON 格式排盘数据（用于排盘信息弹窗，与注入 LLM 的数据一致）
  const jsonData = useMemo(() => serializeLiuyaoJson(result), [result])

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

  return (
    <div className="feature-bazi liuyao-result-feature">
      <div className="bazi-combined-card liuyao-result-card">
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
                六爻占卜排盘
                <span className="bazi-gender-tag">{result.dongYaoCount > 0 ? '动卦' : '静卦'}</span>
              </h2>
              <p className="bazi-desc">
                本卦 {pan.benGua.guaName} · {GetGuaDesc(pan.benGua.guaName)}
              </p>
              <p className="bazi-pattern-desc">
                互卦 <span className="bazi-pattern-value">{pan.huGua.guaName}</span>
                · 变卦 <span className="bazi-pattern-value">{result.dongYaoCount > 0 ? pan.zhiGua.guaName : '静卦'}</span>
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
            {/* 卦象向量图展示 */}
            <div className="liuyao-hexagram-section">
              <h3 className="liuyao-section-title">卦象图</h3>
              <div className="liuyao-hexagram-grid">
                <div className="liuyao-hexagram-card liuyao-hexagram-ben">
                  <div className="liuyao-hexagram-label">
                    <span className="liuyao-hexagram-tag">本卦</span>
                  </div>
                  <div className="liuyao-hexagram-svg-wrap">
                    <HexagramSvg
                      yaos={pan.benGua.yaoList.map(y => ({
                        yaoValue: y.yaoValue,
                        isMoving: y.isMoving,
                      }))}
                      size="md"
                    />
                  </div>
                  <div className="liuyao-hexagram-info">
                    <div className="liuyao-hexagram-name">{pan.benGua.guaName}</div>
                    <div className="liuyao-hexagram-desc">{GetGuaDesc(pan.benGua.guaName)}</div>
                    {pan.benGua.palace && (
                      <div className="liuyao-hexagram-palace">
                        {pan.benGua.palace} · {pan.benGua.palaceLevel}
                      </div>
                    )}
                  </div>
                </div>

                <div className="liuyao-hexagram-card liuyao-hexagram-hu">
                  <div className="liuyao-hexagram-label">
                    <span className="liuyao-hexagram-tag">互卦</span>
                  </div>
                  <div className="liuyao-hexagram-svg-wrap">
                    <HexagramSvg
                      yaos={pan.huGua.yaoList.map(y => ({
                        yaoValue: y.yaoValue,
                        isMoving: y.isMoving,
                      }))}
                      size="md"
                    />
                  </div>
                  <div className="liuyao-hexagram-info">
                    <div className="liuyao-hexagram-name">{pan.huGua.guaName}</div>
                    <div className="liuyao-hexagram-desc">{GetGuaDesc(pan.huGua.guaName)}</div>
                    {pan.huGua.palace && (
                      <div className="liuyao-hexagram-palace">
                        {pan.huGua.palace} · {pan.huGua.palaceLevel}
                      </div>
                    )}
                  </div>
                </div>

                <div className="liuyao-hexagram-card liuyao-hexagram-zhi">
                  <div className="liuyao-hexagram-label">
                    <span className="liuyao-hexagram-tag">变卦</span>
                    {result.dongYaoCount === 0 && (
                      <span className="liuyao-hexagram-static-tag">静</span>
                    )}
                  </div>
                  <div className="liuyao-hexagram-svg-wrap">
                    {result.dongYaoCount > 0 ? (
                      <HexagramSvg
                        yaos={pan.zhiGua.yaoList.map(y => ({
                          yaoValue: y.yaoValue,
                          isMoving: y.isMoving,
                        }))}
                        size="md"
                      />
                    ) : (
                      <HexagramSvg
                        yaos={pan.benGua.yaoList.map(y => ({
                          yaoValue: y.yaoValue,
                          isMoving: false,
                        }))}
                        size="md"
                      />
                    )}
                  </div>
                  <div className="liuyao-hexagram-info">
                    <div className="liuyao-hexagram-name">
                      {result.dongYaoCount > 0 ? pan.zhiGua.guaName : '静卦'}
                    </div>
                    <div className="liuyao-hexagram-desc">
                      {result.dongYaoCount > 0
                        ? GetGuaDesc(pan.zhiGua.guaName)
                        : '无动爻，以本卦为用'}
                    </div>
                    {result.dongYaoCount > 0 && pan.zhiGua.palace && (
                      <div className="liuyao-hexagram-palace">
                        {pan.zhiGua.palace} · {pan.zhiGua.palaceLevel}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 时间信息 */}
            <div className="bazi-info-panel">
              <h3 className="liuyao-section-title">基本信息</h3>
              <div className="liuyao-info-grid">
                <div className="bazi-info-row">
                  <span className="bazi-info-label">起卦时间</span>
                  <span className="bazi-info-value">{result.queryTime}</span>
                </div>
                <div className="bazi-info-row">
                  <span className="bazi-info-label">日干支</span>
                  <span className="bazi-info-value">{pan.ganZhiDay.tian}{pan.ganZhiDay.di}</span>
                </div>
                <div className="bazi-info-row">
                  <span className="bazi-info-label">月建</span>
                  <span className="bazi-info-value">{pan.monthJian}</span>
                </div>
                <div className="bazi-info-row">
                  <span className="bazi-info-label">旬空</span>
                  <span className="bazi-info-value">{pan.dayKong}</span>
                </div>
                <div className="bazi-info-row">
                  <span className="bazi-info-label">宫位</span>
                  <span className="bazi-info-value">{pan.benGua.palace}（{pan.benGua.palaceWuXing}）</span>
                </div>
                <div className="bazi-info-row">
                  <span className="bazi-info-label">卦身</span>
                  <span className="bazi-info-value">
                    {pan.benGua.shenYao
                      ? `第${pan.benGua.shenYao}爻`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* 六爻详情表 */}
            <div className="liuyao-detail-table">
              <h3 className="liuyao-detail-title">六爻详情</h3>
              <div className="liuyao-table">
                <div className="liuyao-table-header">
                  <span>爻位</span>
                  <span>纳甲</span>
                  <span>爻值</span>
                  <span>六亲</span>
                  <span>六神</span>
                  <span>世应</span>
                </div>
                {[...pan.benGua.yaoList].reverse().map((yao) => (
                  <div
                    key={yao.position}
                    className={`liuyao-table-row${yao.isMoving ? ' changing' : ''}${yao.shiYing === '世' ? ' shi' : ''}${yao.shiYing === '应' ? ' ying' : ''}`}
                  >
                    <span className="liuyao-table-pos">
                      {yao.position === 1 ? '初' : yao.position === 6 ? '上' : yao.position}
                    </span>
                    <span>{yao.naJia}</span>
                    <span>{yao.isMoving ? '⚊○' : yao.yaoValue === 7 ? '⚊' : '⚋'}</span>
                    <span>{yao.liuQin}</span>
                    <span>{yao.liuShou}</span>
                    <span className={`liuyao-table-shiying${yao.shiYing === '世' ? ' shi' : yao.shiYing === '应' ? ' ying' : ''}`}>
                      {yao.shiYing === '世' ? '世' : yao.shiYing === '应' ? '应' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 卦辞爻辞 */}
            <div className="liuyao-explanation">
              <h3 className="liuyao-section-title">卦辞参考</h3>
              {pan.benGua.guaCi && (
                <div className="liuyao-ci-block">
                  <div className="liuyao-ci-label">本卦辞</div>
                  <div className="liuyao-ci-text">{pan.benGua.guaCi}</div>
                </div>
              )}
              {pan.benGua.tuanCi && (
                <div className="liuyao-ci-block">
                  <div className="liuyao-ci-label">彖辞</div>
                  <div className="liuyao-ci-text">{pan.benGua.tuanCi}</div>
                </div>
              )}
              {pan.explanation && (
                <div className="liuyao-ci-block liuyao-ci-desc">
                  <div className="liuyao-ci-label">义理</div>
                  <div className="liuyao-ci-text">{pan.explanation}</div>
                </div>
              )}
              {result.dongYaoCount > 0 && pan.benGua.yaoCi && pan.benGua.yaoCi.length > 0 && (
                <div className="liuyao-ci-block">
                  <div className="liuyao-ci-label">动爻辞</div>
                  <div className="liuyao-yao-ci-list">
                    {pan.benGua.yaoList.filter(y => y.isMoving).map(y => (
                      <div key={y.position} className="liuyao-yao-ci-item">
                        <span className="liuyao-yao-ci-pos">
                          {y.position === 1 ? '初' : y.position === 6 ? '上' : y.position}爻
                        </span>
                        <span className="liuyao-yao-ci-text">
                          {pan.benGua.yaoCi[y.position - 1]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 解盘报告弹窗 */}
      {showReportModal && (
        <BaziReportModal
          chartType="六爻"
          chartName={`六爻占卜_${result.queryTime}`}
          contextData={contextData}
          archiveData={{
            name: `六爻占卜_${result.queryTime}`,
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
          title="六爻占卜排盘信息"
          chartType="六爻"
          chartName={`六爻占卜_${result.queryTime}`}
          contextData={contextData}
          jsonData={jsonData}
          archiveData={{
            name: `六爻占卜_${result.queryTime}`,
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

function GetGuaDesc(name: string): string {
  const descs: Record<string, string> = {
    '乾': '乾为天·纯阳', '坤': '坤为地·纯阴', '屯': '水雷屯·始生之难',
    '蒙': '山水蒙·启蒙', '需': '水天需·等待', '讼': '天水讼·争讼',
    '师': '地水师·统兵', '比': '水地比·亲附', '小畜': '风天小畜·小蓄',
    '履': '天泽履·践行', '泰': '地天泰·通泰', '否': '天地否·闭塞',
    '同人': '天火同人·合同', '大有': '火天大有·丰收', '谦': '地山谦·谦逊',
    '豫': '雷地豫·愉悦', '随': '泽雷随·顺从', '蛊': '山风蛊·整治',
    '临': '地泽临·临下', '观': '风地观·观察', '噬嗑': '火雷噬嗑·刑罚',
    '贲': '山火贲·文饰', '剥': '山地剥·剥落', '复': '地雷复·回复',
    '无妄': '天雷无妄·不妄', '大畜': '山天大畜·大蓄', '颐': '山雷颐·颐养',
    '大过': '泽风大过·过甚', '坎': '坎为水·重险', '离': '离为火·光明',
    '咸': '泽山咸·感应', '恒': '雷风恒·恒久', '遯': '天山遯·退避',
    '大壮': '雷天大壮·壮盛', '晋': '火地晋·前进', '明夷': '地火明夷·伤明',
    '家人': '风火家人·家庭', '睽': '火泽睽·乖离', '蹇': '水山蹇·艰难',
    '解': '雷水解·解除', '损': '山泽损·减损', '益': '风雷益·增益',
    '夬': '泽天夬·决断', '姤': '天风姤·邂逅', '萃': '泽地萃·聚集',
    '升': '地风升·上升', '困': '泽水困·困穷', '井': '水风井·养人',
    '革': '泽火革·变革', '鼎': '火风鼎·鼎新', '震': '震为雷·震动',
    '艮': '艮为山·止息', '渐': '风山渐·渐进', '归妹': '雷泽归妹·婚嫁',
    '丰': '雷火丰·丰盛', '旅': '火山旅·旅行', '巽': '巽为风·顺从',
    '兑': '兑为泽·喜悦', '涣': '风水涣·涣散', '节': '水泽节·节制',
    '中孚': '风泽中孚·诚信', '小过': '雷山小过·小过', '既济': '水火既济·已成',
    '未济': '火水未济·未成',
  }
  return descs[name] || ''
}
