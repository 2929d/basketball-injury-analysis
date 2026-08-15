import { Link, NavLink } from 'react-router-dom'
import './Navbar.css'

const navs = [
  { to: '/', label: '首页' },
  { to: '/athlete', label: '开始评估' },
  { to: '/ml-predict', label: 'ML预测' },
  { to: '/history', label: '历史记录' },
  { to: '/methodology', label: '系统方法论' },
  { to: '/about', label: '关于' },
]

export default function Navbar() {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-logo">
            <svg viewBox="0 0 64 64" width="30" height="30">
              <defs>
                <linearGradient id="navg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#00b4d8" />
                  <stop offset="1" stopColor="#06d6a0" />
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="30" fill="url(#navg)" />
              <path
                d="M32 14 L32 50 M20 26 L44 26 M22 44 L32 50 L42 44"
                stroke="#fff"
                strokeWidth="3.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="brand-text">
            <strong>运动损伤风险评估系统</strong>
            <small>CV-Based Injury Risk Analysis</small>
          </span>
        </Link>
        <nav className="nav-links">
          {navs.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}
