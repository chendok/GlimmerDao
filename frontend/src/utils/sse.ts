/**
 * SSE 流解析工具 —— 从报告弹窗组件中抽取的共享纯函数
 *
 * 用于解析后端返回的 Server-Sent Events 流（event/data 格式），
 * 供 BaziReportModal / PhysiognomyReportModal 等复用。
 */

export type SSEEventHandler = (event: string, data: Record<string, unknown>) => void

/**
 * 解析 SSE 流。
 *
 * @param reader      响应体的 ReadableStream reader
 * @param abortSignal 中止信号，用于中断解析循环
 * @param onEvent     每个事件解析完成后的回调（event 名 + 解析后的 JSON 对象）
 * @param logPrefix   可选：JSON 解析失败时的日志前缀
 */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abortSignal: AbortSignal,
  onEvent: SSEEventHandler,
  logPrefix = '',
): Promise<void> {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let currentEvent = ''
  let currentData = ''

  const processEvent = (event: string, data: string) => {
    try {
      const parsed = JSON.parse(data)
      onEvent(event || 'message', parsed)
    } catch (e) {
      if (logPrefix) {
        console.warn(`[${logPrefix}] Failed to parse JSON:`, data, 'error:', e)
      }
      onEvent(event || 'message', { content: data })
    }
  }

  while (true) {
    if (abortSignal.aborted) break

    const { done, value } = await reader.read()
    if (done) {
      // 处理最后一条未完成的消息
      if (currentData) {
        processEvent(currentEvent, currentData)
      }
      break
    }

    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmedLine = line.trim()

      if (trimmedLine.startsWith('event: ')) {
        // 处理上一条未完成的事件
        if (currentData) {
          processEvent(currentEvent, currentData)
          currentData = ''
        }
        currentEvent = trimmedLine.slice(7).trim()
      } else if (trimmedLine.startsWith('data: ')) {
        const dataChunk = trimmedLine.slice(6)
        currentData += dataChunk
      } else if (trimmedLine === '') {
        // 空行表示事件结束
        if (currentData) {
          processEvent(currentEvent, currentData)
          currentData = ''
          currentEvent = ''
        }
      }
    }
  }
}
