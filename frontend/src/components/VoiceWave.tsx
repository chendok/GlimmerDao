import { useEffect, useRef, useCallback, useMemo } from 'react'

export type WaveStyle = 'sine' | 'sawtooth' | 'smooth'

export interface VoiceWaveProps {
  /** 音量 0-1 */
  volume: number
  /** 波浪样式 */
  waveStyle?: WaveStyle
  /** 波浪颜色，默认 currentColor */
  color?: string
  /** 波浪层数 1-5 */
  waveCount?: number
  /** 动画速度倍率 */
  speed?: number
  /** 基础透明度 0-1 */
  opacity?: number
  /** SVG 宽度（viewBox） */
  width?: number
  /** SVG 高度（viewBox） */
  height?: number
}

/** 根据样式计算 y 偏移（相对于中线的位移，正值向下） */
function calcYOffset(
  x: number,
  w: number,
  amplitude: number,
  frequency: number,
  phase: number,
  style: WaveStyle,
): number {
  const t = (x / w) * frequency * 2 * Math.PI + phase

  switch (style) {
    case 'sawtooth': {
      const normalized = ((t / (2 * Math.PI)) % 1 + 1) % 1
      return amplitude * (2 * normalized - 1)
    }
    case 'smooth': {
      const v =
        Math.sin(t) * 0.6 +
        Math.sin(t * 2.3 + 1.5) * 0.25 +
        Math.sin(t * 0.4 + 0.8) * 0.15
      return amplitude * v
    }
    case 'sine':
    default: {
      return amplitude * Math.sin(t)
    }
  }
}

/** 生成描边波形路径 —— 从左到右围绕中线振荡 */
function generateWavePath(
  numPoints: number,
  w: number,
  h: number,
  amplitude: number,
  frequency: number,
  phase: number,
  style: WaveStyle,
): string {
  const step = w / (numPoints - 1)
  const centerY = h / 2

  const firstOffset = calcYOffset(0, w, amplitude, frequency, phase, style)
  let d = `M 0 ${(centerY + firstOffset).toFixed(1)}`

  for (let i = 1; i < numPoints; i++) {
    const x = i * step
    const offset = calcYOffset(x, w, amplitude, frequency, phase, style)
    d += ` L ${x.toFixed(1)} ${(centerY + offset).toFixed(1)}`
  }

  return d
}

/** 音量阈值 */
const MIN_VOLUME_THRESHOLD = 0.02
/** 空闲振幅占高度比例 */
const IDLE_AMPLITUDE_RATIO = 0.15
/** 最大振幅占高度比例 */
const MAX_AMPLITUDE_RATIO = 0.42

/** 每层波浪的配置 */
const WAVE_CONFIGS = [
  { freq: 1.0, phaseShift: 0, strokeWidth: 1.8 },
  { freq: 1.7, phaseShift: Math.PI * 0.35, strokeWidth: 1.2 },
  { freq: 2.5, phaseShift: Math.PI * 0.75, strokeWidth: 0.8 },
  { freq: 3.2, phaseShift: Math.PI * 1.15, strokeWidth: 0.6 },
  { freq: 0.55, phaseShift: Math.PI * 1.55, strokeWidth: 0.5 },
]

export default function VoiceWave({
  volume,
  waveStyle = 'smooth',
  color = 'currentColor',
  waveCount = 3,
  speed = 1,
  opacity = 0.85,
  width = 100,
  height = 24,
}: VoiceWaveProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const phaseRef = useRef(0)
  const rafRef = useRef(0)
  const numPoints = 80

  const gradientId = useMemo(
    () => `voice-wave-grad-${Math.random().toString(36).slice(2, 8)}`,
    [],
  )
  const glowId = useMemo(
    () => `voice-wave-glow-${Math.random().toString(36).slice(2, 8)}`,
    [],
  )

  const animate = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return

    const effectiveVolume = Math.max(volume, MIN_VOLUME_THRESHOLD)
    const normalizedVolume = Math.min(effectiveVolume, 1)

    // 音量映射：空闲微弱波动，说话时非线性放大
    const amplitudeRatio =
      normalizedVolume < MIN_VOLUME_THRESHOLD * 3
        ? IDLE_AMPLITUDE_RATIO
        : IDLE_AMPLITUDE_RATIO +
          (MAX_AMPLITUDE_RATIO - IDLE_AMPLITUDE_RATIO) *
            Math.pow(normalizedVolume, 0.55)

    const amplitude = amplitudeRatio * height

    const paths = svg.querySelectorAll('path')
    for (let i = 0; i < Math.min(waveCount, WAVE_CONFIGS.length); i++) {
      const cfg = WAVE_CONFIGS[i]
      const phase = phaseRef.current * cfg.freq * speed + cfg.phaseShift
      const d = generateWavePath(
        numPoints, width, height, amplitude, cfg.freq, phase, waveStyle,
      )
      if (paths[i]) {
        paths[i].setAttribute('d', d)
      }
    }

    phaseRef.current += 0.045 * speed
    rafRef.current = requestAnimationFrame(animate)
  }, [volume, waveStyle, waveCount, speed, width, height, numPoints])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [animate])

  const layers = Math.min(waveCount, WAVE_CONFIGS.length)

  return (
    <svg
      ref={svgRef}
      className="voice-wave-svg"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      width={width}
      height={height}
      aria-hidden="true"
    >
      <defs>
        {/* 描边渐变：水平方向颜色微变，增加层次感 */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity={opacity * 0.6} />
          <stop offset="30%" stopColor={color} stopOpacity={opacity} />
          <stop offset="70%" stopColor={color} stopOpacity={opacity} />
          <stop offset="100%" stopColor={color} stopOpacity={opacity * 0.6} />
        </linearGradient>

        {/* 发光滤镜 */}
        <filter id={glowId} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {Array.from({ length: layers }, (_, i) => {
        const cfg = WAVE_CONFIGS[i]
        const layerOpacity = Math.max(0.15, opacity - i * 0.18)
        const idleAmplitude = IDLE_AMPLITUDE_RATIO * height
        return (
          <path
            key={i}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={cfg.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={layerOpacity}
            filter={i === 0 ? `url(#${glowId})` : undefined}
            d={generateWavePath(
              numPoints, width, height,
              idleAmplitude, cfg.freq, cfg.phaseShift, waveStyle,
            )}
          />
        )
      })}
    </svg>
  )
}