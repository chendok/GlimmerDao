import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { getErrorMessage } from '../utils/helpers'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ZiweiResult, GongInfo, StarInfo, ZiweiDaXian, ZiweiLiuNian, ZiweiLiuYue, ZiweiLiuRi, ZiweiLiuShi } from '../utils/ziweiCalculator'
import { serializeZiweiJson } from '../utils/ziweiCalculator'
import { ZHI_WX } from '../core/mingli'
import { useChartInfoModal } from '../hooks/useChartInfoModal'
import { useAuth } from '../context/AuthContext'
import { API_BASE, TOKEN_KEY } from '../utils/constants'
import { buildZiweiSelection, buildChartInfoTitle, hasAnyFocus } from '../utils/chartInfoTitle'

// ── 星曜颜色 ──
const STAR_COLORS: Record<string, string> = {
  '主星': '#E8C34D',
  '辅星': '#5B9BD5',
  '吉星': '#6BAF6B',
  '煞星': '#D4735E',
  '四化': '#C084FC',
  '杂星': '#9CA3AF',
}

const STATUS_COLORS: Record<string, string> = {
  '庙': '#6BAF6B',
  '旺': '#E8C34D',
  '平': '#9CA3AF',
  '陷': '#D4735E',
  '得地': '#5B9BD5',
  '落陷': '#D4735E',
}

const SI_HUA_COLORS: Record<string, string> = {
  '化禄': '#FF0000',
  '化权': '#FF0000',
  '化科': '#FF0000',
  '化忌': '#FF0000',
}

const WU_XING_COLOR: Record<string, string> = {
  '木': '#7B9B6A', '火': '#C4614A', '土': '#C49A3C',
  '金': '#C9A84C', '水': '#5B8CC0',
}

interface ZiweiInfoModalProps {
  result: ZiweiResult
  daXianList: ZiweiDaXian[]
  selectedDaXianIdx: number | null
  selectedLiuNian: number | null
  selectedLiuYue: number | null
  selectedLiuRi: number | null
  selectedLiuShi: number | null
  displayedLiuNianList: ZiweiLiuNian[]
  displayedLiuYueList: ZiweiLiuYue[]
  displayedLiuRiList: ZiweiLiuRi[]
  displayedLiuShiList: ZiweiLiuShi[]
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

/** 生成 JSON 格式的紫微斗数排盘信息（与注入 LLM 的数据一致） */
function generateZiweiJson(
  result: ZiweiResult,
  daXianList: ZiweiDaXian[],
  selDaXian: ZiweiDaXian | null,
  selLiuNian: ZiweiLiuNian | null,
  selLiuYue: ZiweiLiuYue | null,
  selLiuRi: ZiweiLiuRi | null,
  selLiuShi: ZiweiLiuShi | null,
): string {
  return '```json\n' + serializeZiweiJson(result, daXianList, {
    daXian: selDaXian ? { startAge: selDaXian.startAge, endAge: selDaXian.endAge, gan: selDaXian.gan, zhi: selDaXian.zhi, gongName: selDaXian.gongName } : null,
    liuNian: selLiuNian ? { year: selLiuNian.year, gan: selLiuNian.gan, zhi: selLiuNian.zhi, gongName: selLiuNian.gongName } : null,
    liuYue: selLiuYue ? { month: selLiuYue.month, gan: selLiuYue.gan, zhi: selLiuYue.zhi, gongName: selLiuYue.gongName } : null,
    liuRi: selLiuRi ? { day: selLiuRi.day, gan: selLiuRi.gan, zhi: selLiuRi.zhi, gongName: selLiuRi.gongName } : null,
    liuShi: selLiuShi ? { zhi: selLiuShi.zhi, gan: selLiuShi.gan, gongName: selLiuShi.gongName } : null,
  }) + '\n```'
}

export default function ZiweiInfoModal({
  result,
  daXianList,
  selectedDaXianIdx,
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
}: ZiweiInfoModalProps) {
  const { isLoggedIn, openLoginModal } = useAuth()

  // ── 辅助：获取选中焦点 ──
  const selDaXian = selectedDaXianIdx !== null ? (daXianList[selectedDaXianIdx] ?? null) : null
  const selLiuNian = selectedLiuNian !== null
    ? (displayedLiuNianList.find(item => item.year === selectedLiuNian) ?? null) : null
  const selLiuYue = selectedLiuYue !== null
    ? (displayedLiuYueList.find(item => item.month === selectedLiuYue) ?? null) : null
  const selLiuRi = selectedLiuRi !== null
    ? (displayedLiuRiList.find(item => item.day === selectedLiuRi) ?? null) : null
  const selLiuShi = selectedLiuShi !== null
    ? (displayedLiuShiList.find(item => item.hour === selectedLiuShi) ?? null) : null

  const hasFocus = !!(selDaXian || selLiuNian || selLiuYue || selLiuRi || selLiuShi)

  // 生年四化列表
  const natalSiHuaList = Object.entries(result.siHuaMap).map(([star, siHua]) => ({ star, siHua }))

  // ── 预生成 Markdown 文本 ──
  const markdownText = useMemo(() => {
    return generateZiweiJson(result, daXianList, selDaXian, selLiuNian, selLiuYue, selLiuRi, selLiuShi)
  }, [result, daXianList, selDaXian, selLiuNian, selLiuYue, selLiuRi, selLiuShi])

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
    const selection = buildZiweiSelection(selDaXian, selLiuNian, selLiuYue, selLiuRi, selLiuShi)
    const title = buildChartInfoTitle(result.name, '紫微', selection)

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
          chart_type: '紫微',
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
              supplemental_info: archiveData.supplemental_info,
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
  }, [editMode, editText, markdownText, isLoggedIn, openLoginModal, result.name, selDaXian, selLiuNian, selLiuYue, selLiuRi, selLiuShi, archiveData, onSaved])

  return (
    <div className="chart-info-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="chart-info-modal">
        {/* 顶部按钮区 */}
        <div className="chart-info-toolbar">
          <h2 className="chart-info-title">紫微斗数排盘信息</h2>
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