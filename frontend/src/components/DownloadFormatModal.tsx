import { createPortal } from 'react-dom'
import Icon from './Icon'

/**
 * 下载格式选择弹窗（HTML / PDF）
 *
 * 从 BaziReportModal / PhysiognomyReportModal 中抽取的共享 UI，
 * 用于报告下载时选择 HTML 或 PDF 格式。
 */
interface DownloadFormatModalProps {
  open: boolean
  /** 弹窗标题展示的报告名称（如 "张三 - 八字解盘报告"） */
  title: string
  downloading: boolean
  onClose: () => void
  onDownloadHtml: () => void
  onDownloadPdf: () => void
}

export default function DownloadFormatModal({
  open,
  title,
  downloading,
  onClose,
  onDownloadHtml,
  onDownloadPdf,
}: DownloadFormatModalProps) {
  if (!open) return null

  return createPortal(
    <div className="download-format-overlay" onClick={() => !downloading && onClose()}>
      <div
        className="download-format-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="download-format-header">
          <h3>选择下载格式</h3>
          {!downloading && (
            <button
              type="button"
              className="download-format-close"
              onClick={onClose}
              aria-label="关闭"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <div className="download-format-body">
          <p className="download-format-title">{title}</p>
          <div className="download-format-options">
            <button
              type="button"
              className="download-format-option"
              onClick={onDownloadHtml}
              disabled={downloading}
            >
              <div className="download-format-icon html">
                <Icon name="file" size={28} />
              </div>
              <div className="download-format-info">
                <span className="download-format-name">HTML 网页</span>
                <span className="download-format-desc">可在浏览器中直接查看，保留排版样式</span>
              </div>
            </button>
            <button
              type="button"
              className="download-format-option"
              onClick={onDownloadPdf}
              disabled={downloading}
            >
              <div className="download-format-icon pdf">
                <Icon name="file" size={28} />
              </div>
              <div className="download-format-info">
                <span className="download-format-name">PDF 文档</span>
                <span className="download-format-desc">排版固定，适合打印和存档，文字可搜索</span>
              </div>
              {downloading && <span className="download-format-loading">生成中...</span>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
