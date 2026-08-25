import { useRef, useState, useCallback } from 'react'
import { useChatContext } from './hooks/useChatContext'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import InputBar from './components/InputBar'
import FeatureContent from './components/FeatureContent'
import ArchiveLibraryPage from './components/ArchiveLibraryPage'
import KnowledgeBasePage from './components/KnowledgeBasePage'
import SystemManagementPage from './components/SystemManagementPage'
import LoginModal from './components/LoginModal'
import PolicyPage from './components/PolicyPage'
import type { InputBarHandle } from './components/InputBar'
import type { FeatureKey } from './context/ChatContext'
import './App.css'
// 拆分出的术数功能样式（需在 App.css 之后导入，保证层叠顺序）
import './styles/liuyao.css'
import './styles/meihua.css'
import './styles/huangli.css'

export type SidebarMode = 'icon' | 'full'

function App() {
  const { error, setError, selectedFeature, setSelectedFeature } = useChatContext()

  // 协议/政策页面路由（无 React Router，通过路径判断）
  const pathname = window.location.pathname
  if (pathname === '/meta-user-policy') {
    return <PolicyPage type="user" />
  }
  if (pathname === '/meta-private-policy') {
    return <PolicyPage type="privacy" />
  }

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('icon')
  const [featureResetCounter, setFeatureResetCounter] = useState(0)
  const inputBarRef = useRef<InputBarHandle>(null)

  const handleSelectFeature = (feature: FeatureKey) => {
    setSelectedFeature(feature)
    setFeatureResetCounter(c => c + 1)
    setSidebarMode('icon')
  }

  const handleBackToChat = () => {
    setSelectedFeature(null)
  }

  const toggleSidebar = useCallback(() => {
    setSidebarMode((prev) => (prev === 'icon' ? 'full' : 'icon'))
  }, [])

  const handleMainClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (sidebarMode === 'full' && e.target === e.currentTarget) {
      setSidebarMode('icon')
    }
  }, [sidebarMode])

  // 分屏布局：侧边栏 + 功能内容
  if (selectedFeature) {
    return (
      <div className="wendao-app">
        <Sidebar
          mode={sidebarMode}
          onToggleMode={toggleSidebar}
          onSelectFeature={handleSelectFeature}
          onBackToChat={handleBackToChat}
        />
        <main className="main-content feature-content-area" onClick={handleMainClick}>
          {selectedFeature === '知识库' ? (
            <KnowledgeBasePage />
          ) : selectedFeature === '档案库' ? (
            <ArchiveLibraryPage />
          ) : selectedFeature === '系统管理' ? (
            <SystemManagementPage />
          ) : (
            <FeatureContent feature={selectedFeature} resetTrigger={featureResetCounter} />
          )}
        </main>
        <LoginModal />
      </div>
    )
  }

  // 默认对话布局
  return (
    <div className="wendao-app">
      <Sidebar mode={sidebarMode} onToggleMode={toggleSidebar} onSelectFeature={handleSelectFeature} />

      <main className="main-content" onClick={handleMainClick}>
        <ChatArea
          onSelectFeature={handleSelectFeature}
        />

        {error && (
          <div className="error-toast">
            <span>{error}</span>
            <button type="button" className="icon-btn-sm" onClick={() => setError('')} aria-label="关闭">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <InputBar ref={inputBarRef} showSkillSelection={true} />
      </main>

      <LoginModal />
    </div>
  )
}

export default App