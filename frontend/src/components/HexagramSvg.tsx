/**
 * HexagramSvg — 传统六爻卦象 SVG 渲染组件
 *
 * 以传统方式渲染 6 爻卦象：
 * - 初爻在最底，上爻在最顶
 * - 阳爻(7/9/1)：实线 ━━━━
 * - 阴爻(6/8/0)：断线 ━━ ━━
 * - 动爻(6/9)：阳动(○)、阴动(×) 标记
 *
 * 支持两种输入格式：
 * 1. yaoValues: number[] — 六爻值数组 [6|7|8|9, ...]，index 0=上爻, index 5=初爻
 * 2. yaos: {yaoValue: number, isMoving?: boolean}[] — 同上但带 isMoving
 */

export interface HexagramYao {
  yaoValue: number
  isMoving?: boolean
}

interface HexagramSvgProps {
  /** 爻值数组，index 0 = 上爻，index 5 = 初爻（从上到下排列） */
  yaoValues?: number[]
  /** 带动爻标记的爻数据，同上顺序 */
  yaos?: HexagramYao[]
  /** 卦名（可选，显示在底部） */
  guaName?: string
  /** 尺寸模式 */
  size?: 'sm' | 'md' | 'lg'
  /** 高亮动爻 */
  highlight?: boolean
}

/** 八卦三爻阴阳映射：[上爻, 中爻, 下爻]，1=阳，0=阴 */
export const BAGUA_YAOS: Record<string, [number, number, number]> = {
  '乾': [1, 1, 1],
  '兑': [1, 1, 0],
  '离': [1, 0, 1],
  '震': [1, 0, 0],
  '巽': [0, 1, 1],
  '坎': [0, 1, 0],
  '艮': [0, 0, 1],
  '坤': [0, 0, 0],
}

/** 将 yaoValue (6/7/8/9) 转换为阴阳：true=阳，false=阴 */
function yaoValueToYangYin(v: number): boolean {
  return v === 7 || v === 9
}

/** 判断 yaoValue 是否为动爻 */
function isMovingYaoValue(v: number): boolean {
  return v === 6 || v === 9
}

/**
 * 将上下卦三爻合成为六爻数组
 * @param upperName 上卦名（八卦名）
 * @param lowerName 下卦名（八卦名）
 * @returns 6 爻值数组，index 0=上爻(上卦的上爻)，index 5=初爻(下卦的下爻)
 */
export function composeLiuYaoYaos(
  upperName: string,
  lowerName: string
): HexagramYao[] {
  const upperYaos = BAGUA_YAOS[upperName] || [0, 0, 0]
  const lowerYaos = BAGUA_YAOS[lowerName] || [0, 0, 0]
  // 上卦三爻 + 下卦三爻，index 0 = 上卦上爻
  return [...upperYaos, ...lowerYaos].map(v => ({ yaoValue: v ? 7 : 8 }))
}

export default function HexagramSvg({
  yaoValues,
  yaos: yaosProp,
  guaName,
  size = 'md',
  highlight = true,
}: HexagramSvgProps) {
  const processedYaos: HexagramYao[] = (() => {
    if (yaosProp && yaosProp.length === 6) {
      return yaosProp
    }
    if (yaoValues && yaoValues.length === 6) {
      return yaoValues.map(v => ({
        yaoValue: v,
        isMoving: isMovingYaoValue(v),
      }))
    }
    return []
  })()

  if (processedYaos.length === 0) return null

  const sizeMap = {
    sm: { width: 60, height: 84, lineGap: 11, lineLen: 40, strokeW: 2.5, fontSize: 9 },
    md: { width: 76, height: 108, lineGap: 14, lineLen: 52, strokeW: 3, fontSize: 10 },
    lg: { width: 92, height: 136, lineGap: 17, lineLen: 66, strokeW: 3.5, fontSize: 12 },
  }
  const s = sizeMap[size]

  const centerX = s.width / 2
  const topPad = 6
  const startY = topPad + s.strokeW / 2

  return (
    <svg
      width={s.width}
      height={s.height + (guaName ? s.fontSize + 6 : 0)}
      viewBox={`0 0 ${s.width} ${s.height + (guaName ? s.fontSize + 6 : 0)}`}
      xmlns="http://www.w3.org/2000/svg"
      className="hexagram-svg"
    >
      {processedYaos.map((yao, i) => {
        // index 0 = 上爻(最顶)，index 5 = 初爻(最底)
        // 渲染顺序从上到下
        const y = startY + i * s.lineGap
        const isYang = yaoValueToYangYin(yao.yaoValue)
        const isMoving = yao.isMoving ?? isMovingYaoValue(yao.yaoValue)
        const halfLen = s.lineLen / 2

        const lineColor = isMoving
          ? (isYang ? 'hsl(var(--color-error))' : 'hsl(var(--color-accent))')
          : 'hsl(var(--color-text-primary))'

        return (
          <g key={i}>
            {isYang ? (
              // 阳爻：实线
              <line
                x1={centerX - halfLen}
                y1={y}
                x2={centerX + halfLen}
                y2={y}
                stroke={lineColor}
                strokeWidth={s.strokeW}
                strokeLinecap="round"
              />
            ) : (
              // 阴爻：两段断线
              <>
                <line
                  x1={centerX - halfLen}
                  y1={y}
                  x2={centerX - s.strokeW * 1.2}
                  y2={y}
                  stroke={lineColor}
                  strokeWidth={s.strokeW}
                  strokeLinecap="round"
                />
                <line
                  x1={centerX + s.strokeW * 1.2}
                  y1={y}
                  x2={centerX + halfLen}
                  y2={y}
                  stroke={lineColor}
                  strokeWidth={s.strokeW}
                  strokeLinecap="round"
                />
              </>
            )}
            {/* 动爻标记 */}
            {isMoving && (
              <circle
                cx={centerX}
                cy={y + s.lineGap * 0.55}
                r={s.strokeW * 1.4}
                fill="none"
                stroke={isYang ? 'hsl(var(--color-error))' : 'hsl(var(--color-accent))'}
                strokeWidth={s.strokeW * 0.7}
                className={highlight ? 'hexagram-moving-marker' : ''}
              />
            )}
          </g>
        )
      })}
      {guaName && (
        <text
          x={centerX}
          y={s.height + s.fontSize}
          textAnchor="middle"
          fill="hsl(var(--color-text-secondary))"
          fontSize={s.fontSize}
          fontFamily="var(--font-sans)"
          fontWeight="var(--weight-semibold)"
        >
          {guaName}
        </text>
      )}
    </svg>
  )
}
