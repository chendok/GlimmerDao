import type { SVGProps } from 'react'

/**
 * 公共图标组件 — 集中管理 SVG 图标，消除各组件内联 SVG 的重复。
 *
 * 使用方式：
 *   <Icon name="close" size={16} />
 *
 * 图标路径均采用 24x24 viewBox 的 lucide 风格线性图标，
 * 默认 stroke="currentColor"、strokeWidth=2，可继承父级颜色。
 */
export type IconName =
  | 'close'
  | 'trash'
  | 'file'
  | 'chat'
  | 'plus'
  | 'send'
  | 'search'
  | 'copy'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'menu'
  | 'edit'
  | 'download'
  | 'image'
  | 'upload'
  | 'refresh'
  | 'sparkles'
  | 'info'
  | 'warning'
  | 'user'
  | 'logout'
  | 'settings'
  | 'archive'
  | 'book'
  | 'mic'
  | 'grid'
  | 'folder'
  | 'sun'
  | 'moon'
  | 'brand'
  | 'shield'
  | 'palette'

/** 图标路径（lucide 风格） */
const ICON_PATHS: Record<IconName, string[]> = {
  close: [
    'M18 6 6 18',
    'M6 6l12 12',
  ],
  trash: [
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  ],
  file: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
  ],
  chat: [
    'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  ],
  plus: [
    'M12 5v14',
    'M5 12h14',
  ],
  send: [
    'M22 2 11 13',
    'M22 2 15 22l-4-9-9-4z',
  ],
  search: [
    'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
    'm21 21-4.35-4.35',
  ],
  copy: [
    'M9 9h11v11H9z',
    'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  ],
  check: [
    'M20 6 9 17l-5-5',
  ],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevron-left': ['m15 18-6-6 6-6'],
  menu: [
    'M4 6h16',
    'M4 12h16',
    'M4 18h16',
  ],
  edit: [
    'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  ],
  download: [
    'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
    'M7 10l5 5 5-5',
    'M12 15V3',
  ],
  image: [
    'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
    'm21 8-4-4H5a2 2 0 0 0-2 2v10',
    'm3 8 6 6 4-4 6 6',
  ],
  upload: [
    'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
    'M17 8l-5-5-5 5',
    'M12 3v12',
  ],
  refresh: [
    'M21 2v6h-6',
    'M3 12a9 9 0 0 1 15-6.7L21 8',
    'M3 22v-6h6',
    'M21 12a9 9 0 0 1-15 6.7L3 16',
  ],
  sparkles: [
    'm12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z',
  ],
  info: [
    'M12 16v-4',
    'M12 8h.01',
    'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  ],
  warning: [
    'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    'M12 9v4',
    'M12 17h.01',
  ],
  user: [
    'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2',
    'M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ],
  logout: [
    'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',
    'M16 17l5-5-5-5',
    'M21 12H9',
  ],
  settings: [
    'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  ],
  archive: [
    'M21 8v13H3V8',
    'M1 3h22v5H1z',
    'M10 12h4',
  ],
  book: [
    'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20',
  ],
  mic: [
    'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z',
    'M19 10v2a7 7 0 0 1-14 0v-2',
    'M12 19v3',
  ],
  grid: [
    'M3 3h7v7H3z',
    'M14 3h7v7h-7z',
    'M3 14h7v7H3z',
    'M14 14h7v7h-7z',
  ],
  folder: [
    'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  ],
  sun: [
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M12 2v2',
    'M12 20v2',
    'M4.93 4.93l1.41 1.41',
    'M17.66 17.66l1.41 1.41',
    'M2 12h2',
    'M20 12h2',
    'M6.34 17.66l-1.41 1.41',
    'M19.07 4.93l-1.41 1.41',
  ],
  moon: [
    'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  ],
  brand: [
    'M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2z',
    'M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15z',
  ],
  shield: [
    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  ],
  palette: [
    'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z',
    'M7.5 10.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z',
    'M10.5 7.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z',
    'M13.5 7.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z',
    'M16.5 10.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z',
  ],
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  name: IconName
  size?: number
}

export default function Icon({ name, size = 16, strokeWidth = 2, ...rest }: IconProps) {
  const paths = ICON_PATHS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
