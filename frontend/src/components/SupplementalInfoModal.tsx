import { useEffect, useState } from 'react'

interface SupplementalInfoModalProps {
  name: string
  initialValue?: string | null
  onSave: (value: string) => Promise<void>
  onClose: () => void
}

export default function SupplementalInfoModal({ name, initialValue, onSave, onClose }: SupplementalInfoModalProps) {
  const [value, setValue] = useState(initialValue || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setValue(initialValue || ''), [initialValue])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(value.trim())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="report-modal-overlay" onMouseDown={onClose}>
      <div className="report-modal supplemental-info-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="supplemental-info-header">
          <div className="supplemental-info-header-text">
            <h3>个人补充信息</h3>
            <p>人员档案 · {name}</p>
          </div>
          <button type="button" className="supplemental-info-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="supplemental-info-body">
          <p className="supplemental-info-hint">可填写已知经历、现实情况、特殊背景等信息。命理问答和报告生成时会优先参考这些内容。</p>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={10000}
            placeholder="请输入个人补充信息……"
            rows={10}
            autoFocus
          />
          <div className="supplemental-info-footer">
            <span className="count">{value.length}/10000</span>
            {error && <span className="supplemental-info-error">{error}</span>}
            <button type="button" className="report-primary-btn" onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
