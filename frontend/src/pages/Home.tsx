import { Link } from 'react-router-dom'
import './Home.css'

const features = [
  {
    icon: '🎯',
    title: '姿态识别',
    desc: '基于 MediaPipe Pose 实时检测人体 33 个关键点，精准还原运动姿态。',
    color: '#00b4d8',
  },
  {
    icon: '⚙️',
    title: '生物力学',
    desc: '计算关节角度、力矩、质心位移等生物力学指标，量化动作质量。',
    color: '#06d6a0',
  },
  {
    icon: '⚠️',
    title: '风险评估',
    desc: '规则引擎综合膝关节、踝关节、躯干控制等多维度，输出风险等级。',
    color: '#ff6b35',
  },
  {
    icon: '📊',
    title: '可视化报告',
    desc: '雷达图、时间轴、骨骼叠加视频，让分析结果一目了然。',
    color: '#7c5cff',
  },
]

const stats = [
  { num: '33', label: '人体关键点' },
  { num: '6', label: '风险维度' },
  { num: '4', label: '动作阶段' },
  { num: '0.1s', label: '采样间隔' },
]

export default function Home() {
  return (
    <div className="home">
      {/* Hero */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-content">
          <div className="hero-badge">Sports Tech × Computer Vision</div>
          <h1 className="hero-title">
            运动损伤
            <br />
            <span className="hero-grad">风险评估系统</span>
          </h1>
          <p className="hero-sub">
            基于计算机视觉与运动轨迹分析，通过一段普通视频即可完成运动损伤风险智能评估，
            为教练与运动员提供专业的生物力学反馈。
          </p>
          <div className="hero-actions">
            <Link to="/athlete" className="btn btn-primary btn-lg">
              <span>开始评估</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <Link to="/about" className="btn btn-ghost btn-lg">
              了解技术原理
            </Link>
          </div>
          <div className="hero-stats">
            {stats.map((s) => (
              <div className="hero-stat" key={s.label}>
                <strong>{s.num}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="page">
        <div className="section-title" style={{ fontSize: 22 }}>
          核心能力
        </div>
        <div className="grid grid-4">
          {features.map((f) => (
            <div className="feature-card" key={f.title}>
              <div
                className="feature-icon"
                style={{ background: `${f.color}1a`, color: f.color }}
              >
                <span>{f.icon}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline */}
      <section className="page">
        <div className="section-title" style={{ fontSize: 22 }}>
          分析流程
        </div>
        <div className="pipeline">
          {[
            { step: '01', title: '录入信息', desc: '运动员基础数据与训练状态' },
            { step: '02', title: '上传视频', desc: '动作录像与拍摄指导' },
            { step: '03', title: 'AI 分析', desc: '姿态识别与特征提取' },
            { step: '04', title: '查看报告', desc: '风险评分与可视化' },
          ].map((p, i) => (
            <div className="pipeline-step" key={p.step}>
              <div className="pipeline-num">{p.step}</div>
              <h4>{p.title}</h4>
              <p>{p.desc}</p>
              {i < 3 && <div className="pipeline-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
