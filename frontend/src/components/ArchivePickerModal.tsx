import ReactDOM from 'react-dom'
import ArchivePickerList from './ArchivePickerList'
import type { ArchiveItem } from '../context/ArchiveContext'

interface ArchivePickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectArchive: (archive: ArchiveItem) => void
}

export default function ArchivePickerModal({
  isOpen,
  onClose,
  onSelectArchive,
}: ArchivePickerModalProps) {
  if (!isOpen) return null

  return ReactDOM.createPortal(
    <div className="bazi-archive-overlay" onClick={onClose}>
      <div className="bazi-archive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bazi-archive-modal-header">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
              <path d="M9 18a2 2 0 0 1-2-2V2h10l4 4v10a2 2 0 0 1-2 2h-3" />
              <path d="M3 7v14a2 2 0 0 0 2 2h12" />
              <path d="M14 22v-4a2 2 0 0 0-2-2h0a2 2 0 0 0-2 2v4" />
            </svg>
            从档案库中选择
          </h3>
          <button
            type="button"
            className="bazi-archive-modal-close"
            onClick={onClose}
            title="关闭"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="bazi-archive-modal-body">
          <ArchivePickerList
            onSelectArchive={(archive: ArchiveItem) => {
              onSelectArchive(archive)
              onClose()
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
