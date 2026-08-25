/**
 * 档案库导出工具
 *
 * 支持导出格式：
 * - JSON：单个档案完整数据（含关联的排盘信息/报告/麻衣神相记录）
 * - JSON：档案列表基本信息数组
 * - CSV：档案列表基本信息
 */
import { API_BASE, TOKEN_KEY } from './constants'
import { downloadFile } from './markdown'
import type { ArchiveItem } from '../context/ArchiveContext'

function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

/** 获取档案的关联数据（排盘信息 + 报告 + 麻衣神相） */
async function fetchRelatedRecords(archiveId: number) {
  const token = getToken()
  if (!token) return { chartInfos: [], reports: [], physiognomy: [] }
  const headers = { Authorization: `Bearer ${token}` }

  const buildUrl = (endpoint: string) =>
    `${API_BASE}/${endpoint}/?archive_id=${archiveId}&page_size=200`

  try {
    const [chartInfosRes, reportsRes, physioRes] = await Promise.all([
      fetch(buildUrl('chart-infos'), { headers }),
      fetch(buildUrl('reports'), { headers }),
      fetch(buildUrl('physiognomy/archives'), { headers }),
    ])

    const [chartInfos, reports, physio] = await Promise.all([
      chartInfosRes.ok ? chartInfosRes.json() : { items: [] },
      reportsRes.ok ? reportsRes.json() : { items: [] },
      physioRes.ok ? physioRes.json() : { items: [] },
    ])

    return {
      chartInfos: chartInfos.items || [],
      reports: reports.items || [],
      physiognomy: physio.items || [],
    }
  } catch {
    return { chartInfos: [], reports: [], physiognomy: [] }
  }
}

/** 导出单个档案完整数据（含关联记录）为 JSON */
export async function exportArchiveFull(archive: ArchiveItem): Promise<void> {
  const related = await fetchRelatedRecords(archive.id)
  const payload = {
    archive,
    chartInfos: related.chartInfos,
    reports: related.reports,
    physiognomy: related.physiognomy,
    exportedAt: new Date().toISOString(),
  }
  const content = JSON.stringify(payload, null, 2)
  const safeName = archive.name.replace(/[<>:"/\\|?*]/g, '_')
  downloadFile(content, `档案_${safeName}_${archive.id}.json`, 'application/json')
}

/** 导出多个档案完整数据为 JSON（含关联记录） */
export async function exportArchivesFull(archives: ArchiveItem[]): Promise<void> {
  const results = await Promise.all(
    archives.map(async (a) => {
      const related = await fetchRelatedRecords(a.id)
      return { archive: a, ...related }
    })
  )
  const payload = {
    archives: results,
    exportedAt: new Date().toISOString(),
    total: results.length,
  }
  const content = JSON.stringify(payload, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  downloadFile(content, `档案批量导出_${date}.json`, 'application/json')
}

/** 导出档案列表基本信息为 JSON */
export function exportArchivesJson(archives: ArchiveItem[]): void {
  const payload = {
    archives: archives.map((a) => ({
      id: a.id,
      name: a.name,
      gender: a.gender,
      birth_datetime: a.birth_datetime,
      birthplace: a.birthplace,
      calendar_type: a.calendar_type,
      group_name: a.group_name,
      created_at: a.created_at,
      updated_at: a.updated_at,
    })),
    exportedAt: new Date().toISOString(),
    total: archives.length,
  }
  const content = JSON.stringify(payload, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  downloadFile(content, `档案列表_${date}.json`, 'application/json')
}

/** CSV 字段转义：含逗号、引号、换行的字段需用双引号包裹 */
function escapeCsvField(value: string): string {
  if (value == null) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** 导出档案列表基本信息为 CSV */
export function exportArchivesCsv(archives: ArchiveItem[]): void {
  const headers = ['ID', '姓名', '性别', '出生时间', '出生地', '历法', '分组', '创建时间', '更新时间']
  const rows = archives.map((a) =>
    [
      String(a.id),
      a.name,
      a.gender,
      a.birth_datetime,
      a.birthplace || '',
      a.calendar_type,
      a.group_name || '',
      a.created_at,
      a.updated_at,
    ]
      .map(escapeCsvField)
      .join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const date = new Date().toISOString().slice(0, 10)
  downloadFile(csv, `档案列表_${date}.csv`, 'text/csv')
}
