import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/global.css'

// 路由基路径: 跟随构建基路径, 支持子目录部署(如 GitHub Pages)
const BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={BASENAME}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
