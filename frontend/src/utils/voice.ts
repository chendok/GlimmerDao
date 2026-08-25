/**
 * 语音识别纯工具函数 —— 从 InputBar 中抽取的共享逻辑
 *
 * 包含语音文本清洗、停止指令检测等无副作用纯函数。
 */

/** 清洗语音识别文本：过滤异常字符、控制字符、未配对代理对 */
export function cleanRecognizedText(text: string): string {
  return text
    .replace(/\uFFFD/g, '')           // Unicode 替换字符
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')  // 控制字符（保留 \t \n）
    .replace(/[\uD800-\uDFFF]/g, '')  // 未配对代理对
    .replace(/[\u200B-\u200F\uFEFF]/g, '')  // 零宽字符 / BOM
    .replace(/\s+/g, ' ')             // 合并连续空白
    .trim()
}

/** 前端停止指令检测正则 —— 用于快速响应（<500ms） */
const STOP_COMMAND_RE = /(?:停止录入|停止录音|结束录音|退出录音|关闭录音|停止识别|结束录入|完成录入|录入完成|录音完成|停止语音|结束语音|语音停止|停止说话|停止录入吧|结束录入吧|停止吧|结束吧)$/

/** 简略停止指令（需要更严格的上下文检查 + 长度限制）
 *  使用 lookbehind 避免消耗句末助词字符（了/啦/吧/啊/呢/吗/哦/哟） */
const STOP_SHORT_RE = /(?:^|[。，？！,.\s]|(?<=[了啦吧啊呢吗哦哟]))(停止|结束)(?:录音|录入|识别|语音)?(?:吧)?$/
const STOP_SHORT_MAX_PREFIX_LEN = 8

/** 检测文本中是否包含停止指令，返回清理后的文本 */
export function detectStopCommand(text: string): { isStop: boolean; cleanedText: string } {
  if (!text) return { isStop: false, cleanedText: text }

  // 完整停止指令匹配
  if (STOP_COMMAND_RE.test(text)) {
    const cleaned = text.replace(STOP_COMMAND_RE, '').replace(/[，,。！？\s]+$/, '').trim()
    return { isStop: true, cleanedText: cleaned }
  }

  // 简略停止指令匹配（需要长度检查，避免误触发）
  const shortMatch = text.match(STOP_SHORT_RE)
  if (shortMatch && shortMatch.index !== undefined) {
    const beforeStop = text.slice(0, shortMatch.index)
    if (beforeStop.length <= STOP_SHORT_MAX_PREFIX_LEN) {
      const cleaned = text.replace(STOP_SHORT_RE, '').replace(/[，,。！？\s]+$/, '').trim()
      return { isStop: true, cleanedText: cleaned }
    }
  }

  return { isStop: false, cleanedText: text }
}
