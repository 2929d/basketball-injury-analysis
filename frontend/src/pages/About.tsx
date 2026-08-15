import './About.css'

const stack = [
  {
    icon: '👁️',
    title: 'MediaPipe Pose',
    desc: 'Google 开源的实时人体姿态估计模型，可检测 33 个人体关键点，覆盖头、躯干、四肢主要关节，单帧推理在普通设备上即可达到实时性能。',
  },
  {
    icon: '📐',
    title: 'Savitzky-Golay 滤波',
    desc: '对关节坐标时间序列进行平滑去噪，在保留运动学特征峰值的同时抑制高频抖动，提升后续角度与速度计算的稳定性。',
  },
  {
    icon: '🦵',
    title: '生物力学规则引擎',
    desc: '依据运动医学文献构建规则库，将膝关节屈曲/外翻、踝背屈、躯干前倾等指标映射到损伤风险等级，给出可解释的评估结论。',
  },
  {
    icon: '🎯',
    title: '多维度风险评分',
    desc: '综合膝关节、踝关节、髋关节、躯干控制、左右对称性、动作稳定性 6 个维度，输出 0-100 的综合风险评分与改进建议。',
  },
]

const limits = [
  '本系统仅作为运动技术分析与风险参考，不能替代医学诊断或专业医师意见。',
  '姿态识别精度受拍摄角度、光线、遮挡影响，建议按拍摄指导录制视频。',
  '风险评分基于通用规则，对特殊人群（如术后康复）需结合临床判断。',
  '当前版本支持单视频分析，多人同框场景建议裁剪后再上传。',
]

export default function About() {
  return (
    <div className="page about">
      <div className="page-header">
        <h1>关于本系统</h1>
        <p>基于计算机视觉与生物力学分析的运动损伤风险评估方案</p>
      </div>

      {/* 技术架构图示 */}
      <div className="card about-banner">
        <div className="about-banner-text">
          <h2>从一段视频到一份专业报告</h2>
          <p>
            系统将普通运动视频作为输入，经过质量检测、姿态识别、特征提取、风险评分四步处理，
            最终生成包含骨骼叠加视频、风险雷达图、生物力学指标的可视化报告。
          </p>
        </div>
        <div className="about-banner-flow">
          {['视频输入', '姿态识别', '特征提取', '风险评分', '可视化报告'].map((s, i) => (
            <div className="flow-node" key={s}>
              <span>{s}</span>
              {i < 4 && <span className="flow-arrow">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 技术栈 */}
      <div className="about-block">
        <div className="section-title" style={{ fontSize: 20 }}>
          技术栈
        </div>
        <div className="grid grid-2">
          {stack.map((s) => (
            <div className="card stack-card" key={s.title}>
              <div className="stack-icon">{s.icon}</div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 风险评分逻辑说明 */}
      <div className="about-block">
        <div className="section-title" style={{ fontSize: 20 }}>
          风险等级说明
        </div>
        <div className="card risk-legend">
          <div className="risk-legend-item">
            <span className="risk-dot" style={{ background: 'var(--color-low)' }} />
            <div>
              <strong>低风险 (0-33)</strong>
              <p>动作模式良好，生物力学指标在安全区间，可按计划继续训练。</p>
            </div>
          </div>
          <div className="risk-legend-item">
            <span className="risk-dot" style={{ background: 'var(--color-mid)' }} />
            <div>
              <strong>中风险 (34-66)</strong>
              <p>存在部分风险因素，建议针对性调整训练内容并加强薄弱环节训练。</p>
            </div>
          </div>
          <div className="risk-legend-item">
            <span className="risk-dot" style={{ background: 'var(--color-high)' }} />
            <div>
              <strong>高风险 (67-100)</strong>
              <p>动作模式存在明显损伤风险，建议暂停高强度训练并咨询专业人员。</p>
            </div>
          </div>
        </div>
      </div>

      {/* 局限性说明 */}
      <div className="about-block">
        <div className="section-title" style={{ fontSize: 20 }}>
          使用须知与局限性
        </div>
        <div className="card limits-card">
          <ul>
            {limits.map((l, i) => (
              <li key={i}>
                <span className="limit-icon">!</span>
                {l}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="about-foot">
        <div>© {new Date().getFullYear()} 运动损伤风险评估系统 · 体育科技 × AI 演示项目</div>
      </div>
    </div>
  )
}
