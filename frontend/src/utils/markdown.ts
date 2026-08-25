/**
 * Markdown 转 HTML 工具函数
 * 用于报告下载（HTML/Word 格式）时的 Markdown 内容转换
 * 支持 GFM 表格、列表、标题、引用、分隔线等元素
 */

import { TOKEN_KEY } from './constants'

/**
 * 转义 HTML 特殊字符，防止 XSS 注入。
 * 仅转义 < > &，保留 Markdown 语法（* _ ` # | 等不含这些字符）。
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 处理行内 Markdown 格式（加粗、斜体、行内代码） */
export function processInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_([^_]+?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

/**
 * Markdown 转 HTML（用于 Word/HTML 下载）
 * 支持表格、列表、标题、引用、分隔线等 GFM 元素
 *
 * 关键设计：表格必须在换行符替换之前提取，
 * 否则换行符被转为 <br/> 后表格正则将无法匹配，
 * 导致表格以原始 Markdown 文本形式显示。
 */
export function convertMarkdownToHtml(md: string): string {
  // ── 0. 先转义原始 HTML 特殊字符，防止 XSS 注入 ──
  // 报告内容可能来自 LLM 生成或用户输入，下载为 HTML 后若含 <script> 等会被执行。
  // 转义 < > & 后，原始 HTML 标签失效，仅保留 Markdown 语法（* _ ` # | 等不受影响）。
  md = escapeHtml(md)

  // ── 1. 先提取并转换表格（在换行符被替换之前处理） ──
  // 使用 HTML 注释占位符保护表格 HTML，避免被后续的行内格式处理和换行转换破坏
  const tables: string[] = []
  let html = md.replace(
    /^\|([^\n]*)\|\s*\n\|[\s\-:|]+\|\s*\n((?:\|[^\n]*\|\s*\n?)+)/gm,
    (_match, header: string, body: string) => {
      const headerCells = header.split('|').map((c: string) => c.trim()).filter((c: string) => c !== '')
      const headerHtml =
        '<tr>' + headerCells.map((c: string) => `<th>${processInlineMarkdown(c)}</th>`).join('') + '</tr>'

      const bodyRows = body
        .trim()
        .split('\n')
        .filter((row: string) => row.trim())
        .map((row: string) => {
          // 去除行首尾的 | 后再分割，确保空单元格也能被正确处理
          const cleanRow = row.replace(/^\|/, '').replace(/\|\s*$/, '')
          const cells = cleanRow.split('|').map((c: string) => c.trim())
          return '<tr>' + cells.map((c: string) => `<td>${processInlineMarkdown(c)}</td>`).join('') + '</tr>'
        })
        .join('')

      const tableHtml = `<table>${headerHtml}${bodyRows}</table>`
      tables.push(tableHtml)
      // 使用 HTML 注释作为占位符，避免被行内格式处理（如 __粗体__、_斜体_）破坏
      // 注意：占位符中不能包含下划线 _，否则会被 processInlineMarkdown 误认为斜体
      return `\n\n<!--TABLEPLACEHOLDER${tables.length - 1}-->\n\n`
    }
  )

  // ── 2. 处理无序列表（连续的 - 或 * 开头的行） ──
  html = html.replace(/^(?:[ \t]*[-*][ \t]+.+(\n|$))+/gm, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map((line: string) => {
        const content = line.replace(/^[ \t]*[-*][ \t]+/, '')
        return `<li>${processInlineMarkdown(content)}</li>`
      })
      .join('')
    return `<ul>${items}</ul>`
  })

  // ── 3. 处理有序列表（连续的 数字. 开头的行） ──
  html = html.replace(/^(?:[ \t]*\d+\.[ \t]+.+(\n|$))+/gm, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map((line: string) => {
        const content = line.replace(/^[ \t]*\d+\.[ \t]+/, '')
        return `<li>${processInlineMarkdown(content)}</li>`
      })
      .join('')
    return `<ol>${items}</ol>`
  })

  // ── 4. 处理标题 ──
  html = html
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // ── 5. 处理其他块级元素 ──
  html = html
    .replace(/^---+$/gm, '<hr/>')
    .replace(/^━━.+$/gm, '<hr/>')
    .replace(/^\*\*\*$/gm, '<hr/>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')

  // ── 6. 处理行内格式 ──
  html = processInlineMarkdown(html)

  // ── 7. 转换段落和换行 ──
  html = html
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')

  // ── 8. 还原表格占位符 ──
  html = html.replace(/<!--TABLEPLACEHOLDER(\d+)-->/g, (_m, idx: string) => tables[parseInt(idx, 10)])

  // ── 9. 包装段落并清理冗余标签 ──
  html = '<p>' + html + '</p>'
  html = html.replace(/<p><\/p>/g, '<br/>')
  // 移除块级元素前后的 <p> 标签
  html = html.replace(/<p>(<(?:h[1-4]|table|blockquote|hr|pre|ul|ol|div)[^>]*>)/g, '$1')
  html = html.replace(/(<\/(?:h[1-4]|table|blockquote|pre|ul|ol|div)>)<\/p>/g, '$1')

  return html
}

/** 触发文件下载 */
export function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 从模板显示名称中提取简称（最多 3 个字）
 * 如 "01.精简版·本命运势精解报告" → "精简版"
 *    "麻衣神相·命相合参全书"   → "命相合"
 */
export function getTemplateShortName(templateName: string): string {
  if (!templateName) return '解盘'
  // 匹配 "XX.简称·..." 或 "XX.简称・..." 模式
  const match = templateName.match(/^\d+\.(.+?)[·・]/)
  if (match && match[1]) {
    return match[1].slice(0, 3)
  }
  // 匹配 "前缀·后缀" 模式，取后缀前 3 字
  const parts = templateName.split(/[·・]/)
  if (parts.length > 1 && parts[1].trim()) {
    return parts[1].trim().slice(0, 3)
  }
  // 兜底：取前 3 字
  return templateName.slice(0, 3)
}

/**
 * 将 Markdown 报告内容导出为 PDF 文件
 *
 * 通过后端 fpdf2 引擎在服务端直接渲染 Markdown → PDF：
 * - 文字可选中、可搜索、可复制
 * - 文件大小极小（纯文本，通常 < 100KB）
 * - 任意缩放不失真
 * - 完全独立于 HTML 实现
 *
 * @param markdownContent 报告内容（Markdown 格式）
 * @param fileName        下载文件名（不含扩展名）
 * @param title           报告标题
 * @param dateStr         生成日期
 * @param chartType       排盘类型
 * @param chartName       命主姓名
 * @param skillName       解盘技能名称
 */
export async function downloadPdf(
  markdownContent: string,
  fileName: string,
  title: string = '',
  dateStr: string = '',
  chartType: string = '',
  chartName: string = '',
  skillName: string = '',
): Promise<void> {
  // 给用户一个微小的视觉反馈延迟
  await new Promise(resolve => setTimeout(resolve, 200))

  const token = sessionStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const requestBody = {
    report_content: markdownContent,
    title: title || fileName,
    date_str: dateStr,
    chart_type: chartType,
    chart_name: chartName,
    skill_name: skillName,
  }

  // 动态获取 API_BASE 以避免循环依赖
  const { API_BASE } = await import('./constants')

  const response = await fetch(`${API_BASE}/reports/pdf/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(errData.detail || `PDF 生成失败 (HTTP ${response.status})`)
  }

  // 获取 PDF 二进制数据
  const blob = await response.blob()

  // 触发浏览器下载
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
