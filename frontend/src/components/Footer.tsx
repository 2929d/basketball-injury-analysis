import './Footer.css'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>© {new Date().getFullYear()} 运动损伤风险评估系统</span>
        <span className="dot">·</span>
        <span>基于计算机视觉与生物力学分析</span>
        <span className="dot">·</span>
        <span>仅用于演示，非医学诊断</span>
      </div>
    </footer>
  )
}
