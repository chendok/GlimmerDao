import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { getErrorMessage } from '../utils/helpers'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { BaziResult, DaYun, LiuNian, LiuYue, LiuRi, LiuShi, BaziSelectedFocus } from '../utils/baziCalculator'
import { serializeBaziJson } from '../utils/baziCalculator'
import { getShiShen, calcDayMasterStrength, calcPattern } from '../core/bazi'
import { useChartInfoModal } from '../hooks/useChartInfoModal'
import { useAuth } from '../context/AuthContext'
import { API_BASE, TOKEN_KEY } from '../utils/constants'
import { buildBaziSelection, buildChartInfoTitle, hasAnyFocus } from '../utils/chartInfoTitle'

// ── 五行颜色（UI 展示专用，与 BaziResult 保持一致） ──
const WU_XING_COLOR: Record<string, string> = {
  '木': '#7B9B6A', '火': '#C4614A', '土': '#C49A3C',
  '金': '#C9A84C', '水': '#5B8CC0',
}

// 神煞吉凶分类
const SHENSHA_JI = new Set([
  '天乙贵人', '太极贵人', '天德贵人', '月德贵人', '文昌贵人',
  '禄神', '金舆', '福星贵人', '将星', '红鸾', '天喜', '学堂',
  '天德合', '月德合', '天厨贵人', '德秀贵人', '国印贵人', '天赦',
  '天医', '六合', '三合',
])
const SHENSHA_XIONG = new Set([
  '羊刃', '桃花', '勾煞', '绞煞', '劫煞', '灾煞', '亡神',
  '孤辰', '寡宿', '天罗', '地网', '红艳煞', '披麻', '丧门',
  '破碎', '金刚', '魁罡', '十恶大败', '四废', '十灵日', '九丑日',
  '童子煞', '咸池', '空亡',
])

interface BaziInfoModalProps {
  result: BaziResult
  selectedDaYunIdx: number | null
  selectedLiuNian: number | null
  selectedLiuYue: number | null
  selectedLiuRi: number | null
  selectedLiuShi: number | null
  displayedLiuNianList: LiuNian[]
  displayedLiuYueList: LiuYue[]
  displayedLiuRiList: LiuRi[]
  displayedLiuShiList: LiuShi[]
  onClose: () => void
  archiveData: {
    name: string
    gender: string
    birth_datetime: string
    birthplace?: string | null
    calendar_type: string
    bazi_result?: Record<string, unknown> | null
    supplemental_info?: string | null
  }
  onSaved?: () => void
}

// ═══════════════════════════════════════════════
//  JSON 格式排盘信息生成（与 LLM 上下文一致）
//  十神/日主强弱/格局 统一从 core/bazi 导入（完整版算法）
// ═══════════════════════════════════════════════

/** 生成 JSON 格式的八字排盘信息（与注入 LLM 的数据完全一致，含用户选中的运限焦点） */
function generateBaziJson(result: BaziResult, selectedFocus: BaziSelectedFocus): string {
  const strength = calcDayMasterStrength(
    result.dayPillar.gan,
    result.monthPillar.zhi,
    result.yearPillar,
    result.monthPillar,
    result.hourPillar,
  )
  const pattern = calcPattern(result.dayPillar.gan, result.monthPillar.zhi)

  return '```json\n' + serializeBaziJson(result, {
    strengthLevel: strength.level,
    strengthScore: strength.score,
    strengthDetail: strength.detail,
    patternName: pattern,
  }, selectedFocus) + '\n```'
}

export default function BaziInfoModal({
  result,
  selectedDaYunIdx,
  selectedLiuNian,
  selectedLiuYue,
  selectedLiuRi,
  selectedLiuShi,
  displayedLiuNianList,
  displayedLiuYueList,
  displayedLiuRiList,
  displayedLiuShiList,
  onClose,
  archiveData,
  onSaved,
}: BaziInfoModalProps) {
  const { isLoggedIn, openLoginModal } = useAuth()

  // ── 辅助：获取选中焦点 ──
  const selDaYun = selectedDaYunIdx !== null ? (result.daYunList?.[selectedDaYunIdx] ?? null) : null
  const selLiuNian = selectedLiuNian !== null
    ? (displayedLiuNianList.find(item => item.year === selectedLiuNian) ?? null) : null
  const selLiuYue = selectedLiuYue !== null
    ? (displayedLiuYueList.find(item => item.month === selectedLiuYue) ?? null) : null
  const selLiuRi = selectedLiuRi !== null
    ? (displayedLiuRiList.find(item => item.day === selectedLiuRi) ?? null) : null
  const selLiuShi = selectedLiuShi !== null
    ? (displayedLiuShiList.find(item => item.hourIndex === selectedLiuShi) ?? null) : null

  const hasFocus = !!(selDaYun || selLiuNian || selLiuYue || selLiuRi || selLiuShi)

  // ── 预生成 JSON 格式排盘信息（与注入 LLM 的数据一致，跟随选中运限）──
  const markdownText = useMemo(() => {
    return generateBaziJson(result, {
      daYun: selDaYun,
      liuNian: selLiuNian,
      liuYue: selLiuYue,
      liuRi: selLiuRi,
      liuShi: selLiuShi,
    })
  }, [result, selDaYun, selLiuNian, selLiuYue, selLiuRi, selLiuShi])

  // 共享的弹窗通用逻辑（编辑切换/复制/关闭/ESC）
  const {
    copied, editMode, saving, setSaving, saveSuccess, setSaveSuccess,
    saveError, setSaveError, editText, setEditText, overlayRef,
    toggleEditMode, handleCopy, handleOverlayClick,
  } = useChartInfoModal({ previewText: markdownText, onClose })

  // ── 保存排盘信息到档案库 ──
  const handleSave = useCallback(async () => {
    const infoContent = editMode ? editText : markdownText

    // 前端数据验证
    if (!infoContent.trim()) {
      setSaveError('排盘信息内容为空，无法保存')
      setTimeout(() => setSaveError(''), 3000)
      return
    }
    if (!isLoggedIn) {
      openLoginModal()
      return
    }

    const token = sessionStorage.getItem(TOKEN_KEY)
    if (!token) {
      openLoginModal()
      return
    }

    setSaving(true)
    setSaveError('')

    // 构建时间维度选择快照与标题
    const selection = buildBaziSelection(selDaYun, selLiuNian, selLiuYue, selLiuRi, selLiuShi)
    const title = buildChartInfoTitle(result.name, '八字', selection)

    // 内部辅助：调用保存排盘信息接口
    const callSaveChartInfo = async (extra: { archive_id?: number } = {}): Promise<Response> => {
      return fetch(`${API_BASE}/chart-infos/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          chart_type: '八字',
          chart_name: result.name,
          selected_dayun: selection.dayun,
          selected_liunian: selection.liunian,
          selected_liuyue: selection.liuyue,
          selected_liuri: selection.liuri,
          selected_liushi: selection.liushi,
          has_focus: hasAnyFocus(selection),
          info_content: infoContent,
          ...extra,
        }),
      })
    }

    try {
      const res = await callSaveChartInfo()

      if (res.status === 404) {
        // 可能是档案不存在，解析错误码
        const errData = await res.json().catch(() => ({}))
        const detail = errData.detail || {}
        const errCode = typeof detail === 'object' && detail !== null ? detail.code : ''
        const errMsg = typeof detail === 'object' && detail !== null
          ? detail.message
          : (typeof detail === 'string' ? detail : '保存失败')

        if (errCode === 'ARCHIVE_NOT_FOUND') {
          // 弹窗确认：是否自动保存到档案库（分类为"其他"）
          const confirmed = window.confirm(
            `${errMsg}\n\n是否自动保存到档案库（分类为"其他"）？`
          )
          if (!confirmed) return

          // 1. 自动创建档案（分类为"其他"）
          const archiveRes = await fetch(`${API_BASE}/archives/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              ...archiveData,
              group_name: '其他',
            }),
          })
          if (!archiveRes.ok) {
            const archiveErr = await archiveRes.json().catch(() => ({}))
            throw new Error(
              (typeof archiveErr.detail === 'object' ? archiveErr.detail?.message : archiveErr.detail) ||
              '自动保存档案失败'
            )
          }
          const archive = await archiveRes.json()

          // 2. 携带 archive_id 重新保存排盘信息
          const retryRes = await callSaveChartInfo({ archive_id: archive.id })
          if (!retryRes.ok) {
            const retryErr = await retryRes.json().catch(() => ({}))
            throw new Error(
              (typeof retryErr.detail === 'object' ? retryErr.detail?.message : retryErr.detail) ||
              `排盘信息保存失败 (HTTP ${retryRes.status})`
            )
          }
        } else {
          throw new Error(errMsg || '保存失败')
        }
      } else if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const detail = errData.detail
        const errMsg = typeof detail === 'object' && detail !== null
          ? detail.message
          : (typeof detail === 'string' ? detail : (errData.message || `保存失败 (HTTP ${res.status})`))
        throw new Error(errMsg)
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      onSaved?.()
    } catch (e: unknown) {
      setSaveError(getErrorMessage(e) || '保存失败，请重试')
      setTimeout(() => setSaveError(''), 3000)
    } finally {
      setSaving(false)
    }
  }, [editMode, editText, markdownText, isLoggedIn, openLoginModal, result.name, selDaYun, selLiuNian, selLiuYue, selLiuRi, selLiuShi, archiveData, onSaved])

  return (
    <div className="chart-info-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="chart-info-modal">
        {/* 顶部按钮区 */}
        <div className="chart-info-toolbar">
          <h2 className="chart-info-title">八字排盘信息</h2>
          <div className="chart-info-toolbar-actions">
            {/* 编辑/预览切换按钮 */}
            <button
              type="button"
              className={`chart-info-mode-btn ${editMode ? 'editing' : ''}`}
              onClick={toggleEditMode}
              title={editMode ? '切换到预览模式' : '切换到编辑模式'}
            >
              {editMode ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  预览
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  编辑
                </>
              )}
            </button>
            {/* 复制按钮 */}
            <button
              type="button"
              className={`chart-info-copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  已复制
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  复制
                </>
              )}
            </button>
            <button type="button" className="chart-info-close-btn" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* 主体内容区 */}
        <div className="chart-info-content">
          {editMode ? (
            <textarea
              className="chart-info-editor"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <div className="chart-info-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdownText}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}