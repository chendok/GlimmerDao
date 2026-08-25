import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tokens.css'
import { ChatProvider } from './context/ChatProvider'
import { AuthProvider } from './context/AuthContext'
import { ArchiveProvider } from './context/ArchiveContext'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ArchiveProvider>
        <ChatProvider>
          <App />
        </ChatProvider>
      </ArchiveProvider>
    </AuthProvider>
  </React.StrictMode>,
)