/**
 * 麻衣神相排盘信息弹窗
 *
 * 与 BaziInfoModal / ZiweiInfoModal 保持一致的 UI 结构和交互：
 * - 复用 chart-info-overlay / chart-info-modal 等 CSS 类名
 * - 支持编辑/预览模式切换、复制、保存到档案库
 * - 生成 JSON 格式的麻衣神相排盘信息
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { getErrorMessage } from '../utils/helpers'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FaceFeatures } from '../utils/physiognomyFeatures'
import type { HandFeatures } from '../utils/handFeatures'
import type { PhysiognomyAnalysisType } from '../utils/serializePhysiognomyContext'
import { serializePhysiognomyJson } from '../utils/serializePhysiognomyContext'
import { useChartInfoModal } from '../hooks/useChartInfoModal'
import { useAuth } from '../context/AuthContext'
import { API_BASE, TOKEN_KEY } from '../utils/constants'
import { buildChartInfoTitle } from '../utils/chartInfoTitle'

interface PhysiognomyInfoModalProps {
  name: string
  gender: string
  analysisType: PhysiognomyAnalysisType
  captureMethod: 'camera' | 'upload'
  imageCount: number
  faceFeatures?: FaceFeatures | null
  handFeatures?: HandFeatures | null
  summary: string
  onClose: () => void
  onSaved?: () => void
}

// ═══════════════════════════════════════════════
//  JSON 格式化文本生成函数
// ═══════════════════════════════════════════════

/** 生成 JSON 格式的麻衣神相排盘信息（与注入 LLM 的数据一致） */
function generatePhysiognomyJson(
  name: string,
  gender: string,
  analysisType: PhysiognomyAnalysisType,
  captureMethod: 'camera' | 'upload',
  imageCount: number,
  faceFeatures?: FaceFeatures | null,
  handFeatures?: HandFeatures | null,
): string {
  return '```json\n' + serializePhysiognomyJson({
    name,
    gender,
    analysisType,
    captureMethod,
    imageCount,
    faceFeatures,
    handFeatures,
  }) + '\n```'
}

export default function PhysiognomyInfoModal({
  name,
  gender,
  analysisType,
  captureMethod,
  imageCount,
  faceFeatures,
  handFeatures,
  summary,
  onClose,
  onSaved,
}: PhysiognomyInfoModalProps) {
  const { isLoggedIn, openLoginModal } = useAuth()

  // ── 预生成 JSON 格式排盘信息 ──
  const displayText = useMemo(() => {
    return generatePhysiognomyJson(
      name, gender, analysisType, captureMethod, imageCount,
      faceFeatures, handFeatures,
    )
  }, [name, gender, analysisType, captureMethod, imageCount, faceFeatures, handFeatures])

  // 共享的弹窗通用逻辑（编辑切换/复制/关闭/ESC）
  const {
    copied, editMode, saving, setSaving, saveSuccess, setSaveSuccess,
    saveError, setSaveError, editText, setEditText, overlayRef,
    toggleEditMode, handleCopy, handleOverlayClick,
  } = useChartInfoModal({ previewText: displayText, onClose })

  // ── 保存排盘信息到档案库 ──
  const handleSave = useCallback(async () => {
    const infoContent = editMode ? editText : displayText

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

    const title = buildChartInfoTitle(name || '命主', '麻衣神相', {})

    const callSaveChartInfo = async (extra: { archive_id?: number } = {}): Promise<Response> => {
      return fetch(`${API_BASE}/chart-infos/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          chart_type: '麻衣神相',
          chart_name: name || '命主',
          selected_dayun: null,
          selected_liunian: null,
          selected_liuyue: null,
          selected_liuri: null,
          selected_liushi: null,
          has_focus: false,
          info_content: infoContent,
          ...extra,
        }),
      })
    }

    try {
      const res = await callSaveChartInfo()

      if (res.status === 404) {
        const errData = await res.json().catch(() => ({}))
        const detail = errData.detail || {}
        const errCode = typeof detail === 'object' && detail !== null ? detail.code : ''
        const errMsg = typeof detail === 'object' && detail !== null
          ? detail.message
          : (typeof detail === 'string' ? detail : '保存失败')

        if (errCode === 'ARCHIVE_NOT_FOUND') {
          // 无匹配档案：提示用户登录并前往档案库创建对应命主的档案，不静默自动创建。
          setSaveError('未找到对应档案，请登录后在档案库中创建该命主的档案')
          setTimeout(() => setSaveError(''), 3000)
          openLoginModal()
          return
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
  }, [editText, isLoggedIn, openLoginModal, name, onSaved])

  return (
    <div className="chart-info-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="chart-info-modal">
        {/* 顶部按钮区 */}
        <div className="chart-info-toolbar">
          <h2 className="chart-info-title">麻衣神相排盘信息</h2>
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
                {displayText}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
