/**
 * 档案库管理系统主页面
 *
 * 作为档案库功能的入口页面，整合左侧列表（ArchiveListPanel）和右侧详情（ArchiveDetailPanel），
 * 实现整体布局、状态管理、表单弹窗控制及响应式适配。
 *
 * - 大屏（≥960px）：左右分栏，左侧列表 + 右侧详情同时可见
 * - 小屏（<960px）：单栏视图，通过 mobileView 在列表/详情间切换
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useArchive, type ArchiveItem } from '../context/ArchiveContext'
import { useAuth } from '../context/AuthContext'
import ArchiveListPanel from './ArchiveListPanel'
import ArchiveDetailPanel from './ArchiveDetailPanel'
import ArchiveFormModal from './ArchiveFormModal'
import ConfirmDialog from './ConfirmDialog'
import LoginPrompt from './LoginPrompt'

const MOBILE_BREAKPOINT = 960

type MobileView = 'list' | 'detail'

export default function ArchiveLibraryPage() {
  const { archives, deleteArchive, fetchArchives } = useArchive()
  const { isLoggedIn, openLoginModal } = useAuth()

  // 选中状态
  const [selectedArchiveId, setSelectedArchiveId] = useState<number | null>(null)

  // 表单弹窗状态
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // 响应式：移动端视图切换
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  )
  const [mobileView, setMobileView] = useState<MobileView>('list')

  // 全局提示（轻量 Toast）
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)

  // 确认弹窗状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message: string
    confirmText?: string
    danger?: boolean
    onConfirm: () => void
  }>({ open: false, title: '', message: '', onConfirm: () => {} })

  const showConfirm = useCallback((config: {
    title: string
    message: string
    confirmText?: string
    danger?: boolean
    onConfirm: () => void
  }) => {
    setConfirmDialog({ open: true, ...config })
  }, [])

  const closeConfirm = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, open: false }))
  }, [])

  // ── 响应式断点监听 ──
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobile(mobile)
      // 切换到大屏时重置移动视图
      if (!mobile) setMobileView('list')
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ── Toast 自动消失 ──
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type })
  }, [])

  // ── 登录后首次加载档案列表 ──
  useEffect(() => {
    if (isLoggedIn) {
      fetchArchives()
    }
  }, [isLoggedIn, fetchArchives])

  // 当前选中的档案对象（用于表单回填）
  const selectedArchive = useMemo(
    () => archives.find((a) => a.id === selectedArchiveId) || null,
    [archives, selectedArchiveId]
  )

  // ── 选择档案 ──
  const handleSelect = useCallback((id: number) => {
    setSelectedArchiveId(id)
    if (isMobile) setMobileView('detail')
  }, [isMobile])

  // ── 新增档案 ──
  const handleAddNew = useCallback(() => {
    if (!isLoggedIn) {
      openLoginModal()
      return
    }
    setEditingId(null)
    setFormModalOpen(true)
  }, [isLoggedIn, openLoginModal])

  // ── 编辑档案 ──
  const handleEdit = useCallback(() => {
    if (!selectedArchiveId) return
    setEditingId(selectedArchiveId)
    setFormModalOpen(true)
  }, [selectedArchiveId])

  // ── 删除单个档案 ──
  const handleDelete = useCallback(() => {
    if (!selectedArchiveId) return
    const archiveName = selectedArchive?.name || '该档案'
    showConfirm({
      title: '删除档案',
      message: `确定要删除「${archiveName}」的档案吗？关联的报告将保留但解除关联。`,
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        const ok = await deleteArchive(selectedArchiveId)
        if (ok) {
          showToast('档案已删除', 'success')
          setSelectedArchiveId(null)
          if (isMobile) setMobileView('list')
        } else {
          showToast('删除失败，请稍后重试', 'error')
        }
        closeConfirm()
      },
    })
  }, [selectedArchiveId, selectedArchive, deleteArchive, showToast, isMobile, showConfirm, closeConfirm])

  // ── 表单提交成功回调 ──
  const handleFormSuccess = useCallback((archive: ArchiveItem) => {
    showToast(editingId !== null ? '档案已更新' : '档案已新增', 'success')
    setSelectedArchiveId(archive.id)
  }, [editingId, showToast])

  // ── 移动端返回列表 ──
  const handleBackToList = useCallback(() => {
    setMobileView('list')
  }, [])

  // ── 未登录提示 ──
  if (!isLoggedIn) {
    return (
      <div className="ak-page ak-page-locked">
        <LoginPrompt />
      </div>
    )
  }

  return (
    <div className="ak-page">
      {/* 顶部标题栏（仅移动端显示，大屏由列表/详情自带头部） */}
      {isMobile && (
        <div className="ak-mobile-header">
          {mobileView === 'detail' && selectedArchiveId ? (
            <button type="button" className="ak-mobile-back" onClick={handleBackToList}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              档案列表
            </button>
          ) : (
            <h2 className="ak-mobile-title">档案库</h2>
          )}
        </div>
      )}

      {/* 主体布局：大屏左右分栏，小屏单栏切换 */}
      <div className={`ak-layout${isMobile ? ' mobile' : ''}`}>
        {/* 左侧列表 */}
        <div className={`ak-layout-left${isMobile && mobileView === 'detail' ? ' hidden' : ''}`}>
          <ArchiveListPanel
            selectedArchiveId={selectedArchiveId}
            onSelect={handleSelect}
            onAddNew={handleAddNew}
          />
        </div>

        {/* 右侧详情 */}
        <div className={`ak-layout-right${isMobile && mobileView === 'list' ? ' hidden' : ''}`}>
          <ArchiveDetailPanel
            archiveId={selectedArchiveId}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onBack={isMobile ? handleBackToList : undefined}
          />
        </div>
      </div>

      {/* 新增/编辑表单弹窗 */}
      <ArchiveFormModal
        isOpen={formModalOpen}
        editingId={editingId}
        initialData={editingId !== null ? selectedArchive : null}
        onClose={() => setFormModalOpen(false)}
        onSuccess={handleFormSuccess}
      />

      {/* 确认弹窗（删除等危险操作） */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        danger={confirmDialog.danger}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
      />

      {/* 轻量 Toast */}
      {toast && (
        <div className={`ak-toast ak-toast-${toast.type}`}>
          <span>{toast.msg}</span>
          <button type="button" className="ak-toast-close" onClick={() => setToast(null)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
