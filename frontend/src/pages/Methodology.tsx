import { useEffect, useState } from 'react'
import axios from 'axios'
import './Methodology.css'

interface ValidateResult {
  model_loaded: boolean
  method: string
  feature_source: string
  ml_framework: string
  shap_enabled: boolean
  feature_count: number
  feature_names: string[]
  baseline_accuracy: number | null
  current_avg_prediction: number | null
  data_source: string
  honesty_statement: string
}

interface Methodology {
  system_type: string
  pipeline: string[]
  what_we_do: string[]
  what_we_do_NOT: string[]
  threshold_basis: Record<string, { standard: string; ref: string }>
  references: { id: number; title: string; authors: string; key: string }[]
  roadmap_to_ml: string[]
  limitation_statement: string
}

export default function Methodology() {
  const [validate, setValidate] = useState<ValidateResult | null>(null)
  const [method, setMethod] = useState<Methodology | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      axios.get('/api/v1/validate'),
      axios.get('/api/v1/methodology'),
    ]).then(([v, m]) => {
      setValidate(v.data)
      setMethod(m.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="page"><p>加载中...</p></div>

  return (
    <div className="page methodology-page">
      <h1 className="meth-title">🔍 系统方法论与可信度验证</h1>
      <p className="meth-intro">
        本页面<strong>诚实、透明</strong>地展示系统的真实能力与局限。
        可信度建立在"透明+可验证"，而非"假装用了ML"。
      </p>

      {/* 系统自检 */}
      {validate && (
        <div className="card meth-card">
          <h2>⚡ 系统自检结果（实时）</h2>
          <div className="meth-grid">
            <div className="meth-item">
              <span className="meth-label">是否加载ML模型</span>
              <span className={`meth-value ${validate.model_loaded ? 'ok' : 'warn'}`}>
                {validate.model_loaded ? '✅ 是' : '❌ 否（规则评估）'}
              </span>
            </div>
            <div className="meth-item">
              <span className="meth-label">评估方法</span>
              <span className="meth-value">{validate.method}</span>
            </div>
            <div className="meth-item">
              <span className="meth-label">特征来源</span>
              <span className="meth-value">{validate.feature_source}</span>
            </div>
            <div className="meth-item">
              <span className="meth-label">ML框架</span>
              <span className={`meth-value ${validate.ml_framework === 'none' ? 'warn' : 'ok'}`}>
                {validate.ml_framework}
              </span>
            </div>
            <div className="meth-item">
              <span className="meth-label">SHAP解释性</span>
              <span className={`meth-value ${validate.shap_enabled ? 'ok' : 'warn'}`}>
                {validate.shap_enabled ? '✅ 已启用' : '❌ 未启用'}
              </span>
            </div>
            <div className="meth-item">
              <span className="meth-label">特征数量</span>
              <span className="meth-value">{validate.feature_count} 个</span>
            </div>
            <div className="meth-item">
              <span className="meth-label">基准准确率</span>
              <span className="meth-value warn">
                {validate.baseline_accuracy ?? '无（非ML模型）'}
              </span>
            </div>
            <div className="meth-item">
              <span className="meth-label">当前平均风险评分</span>
              <span className="meth-value">{validate.current_avg_prediction ?? '无数据'} 分</span>
            </div>
          </div>
          <div className="meth-statement">
            <strong>诚实声明：</strong>{validate.honesty_statement}
          </div>
        </div>
      )}

      {/* 系统能力 */}
      {method && (
        <>
          <div className="card meth-card">
            <h2>✅ 系统真实能力（我们做到了什么）</h2>
            <ul className="meth-list do">
              {method.what_we_do.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>

          <div className="card meth-card">
            <h2>❌ 系统局限性（我们没做到什么）</h2>
            <ul className="meth-list dont">
              {method.what_we_do_NOT.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>

          <div className="card meth-card">
            <h2>📋 系统工作流程</h2>
            <ol className="meth-pipeline">
              {method.pipeline.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </div>

          <div className="card meth-card">
            <h2>📚 评估阈值学术依据</h2>
            <table className="meth-table">
              <thead><tr><th>指标</th><th>学界标准</th><th>参考文献</th></tr></thead>
              <tbody>
                {Object.entries(method.threshold_basis).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v.standard}</td>
                    <td className="ref">{v.ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card meth-card">
            <h2>🛤️ 升级为真正ML系统的路线图</h2>
            <ol className="meth-roadmap">
              {method.roadmap_to_ml.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
            <div className="meth-statement">{method.limitation_statement}</div>
          </div>
        </>
      )}
    </div>
  )
}
