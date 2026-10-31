import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts'
import './Sneakers.css'
import { SNEAKERS, type Sneaker } from '../data/sneakerData'


const BRANDS = ['全部', ...Array.from(new Set(SNEAKERS.map((s) => s.brand)))]
const POSITIONS = ['全部', '后卫', '前锋', '中锋', '全能']
const BUDGETS = [
  { label: '全部', min: 0, max: 99999 },
  { label: '500元内', min: 0, max: 500 },
  { label: '500-800', min: 500, max: 800 },
  { label: '800-1200', min: 800, max: 1200 },
  { label: '1200以上', min: 1200, max: 99999 },
]
const SORTS = ['最新上架', '价格低→高', '价格高→低'] as const
const DATA_DATE = '2026-08-23'  // 数据更新日期
const PAGE_SIZE = 24

/* 生成近12个月标签 */
function monthLabels(): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getMonth() + 1}月`)
  }
  return out
}

/* ================= AI (DeepSeek) ================= */

const KEY_STORAGE = 'deepseek_api_key'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

async function askDeepSeek(apiKey: string, messages: ChatMsg[]): Promise<string> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            '你是一位资深篮球装备分析师，精通各类篮球鞋的缓震科技、支撑保护、抓地表现与价格行情。' +
            '请用简体中文回答，语言简洁、结构清晰，善用要点列表。价格建议以得物、识货等平台的实际行情为准并提醒用户比价。',
        },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.7,
      stream: false,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text.slice(0, 200) || '请求失败'}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('AI 未返回内容，请重试')
  return content as string
}

/* ================= 页面组件 ================= */

export default function Sneakers() {
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState('全部')
  const [position, setPosition] = useState('全部')
  const [budget, setBudget] = useState('全部')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('最新上架')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<Sneaker | null>(null)

  // AI 状态
  const [apiKey, setApiKey] = useState('')
  const [showKeyPanel, setShowKeyPanel] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        '你好！我是球鞋 AI 助手（DeepSeek 驱动）。可以问我：\n' +
        '· 「体重 80kg 的大前锋适合哪双鞋？」\n' +
        '· 「对比一下 KD 18 和驭帅 Ultra」\n' +
        '· 「500 元预算有什么推荐？」\n\n' +
        '首次使用请先点击上方「设置」填入 DeepSeek API Key。',
    },
  ])
  const [input, setInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  // 用户画像
  const [profilePos, setProfilePos] = useState('后卫')
  const [profileWeight, setProfileWeight] = useState('70')
  const [profileBudget, setProfileBudget] = useState('800')

  const labels = useMemo(monthLabels, [])

  useEffect(() => {
    const k = localStorage.getItem(KEY_STORAGE) || ''
    setApiKey(k)
    if (!k) setShowKeyPanel(true)
  }, [])

  // 筛选条件变化时重置分页
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, brand, position, budget, sort])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const b = BUDGETS.find((x) => x.label === budget)!
    const list = SNEAKERS.filter((s) => {
      if (q && !(`${s.name} ${s.brand} ${s.oneLiner} ${s.features.join(' ')}`.toLowerCase().includes(q))) return false
      if (brand !== '全部' && s.brand !== brand) return false
      if (position !== '全部' && !s.positions.includes(position)) return false
      if (s.current < b.min || s.current > b.max) return false
      return true
    })
    if (sort === '最新上架') list.sort((a, z) => z.year - a.year || a.current - z.current)
    else if (sort === '价格低→高') list.sort((a, z) => a.current - z.current)
    else if (sort === '价格高→低') list.sort((a, z) => z.current - a.current)
    return list
  }, [query, brand, position, budget, sort])

  const shown = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  const chartData = useMemo(() => {
    if (!selected) return []
    return selected.history.map((price, i) => ({ m: labels[i], price }))
  }, [selected, labels])

  const trend = useMemo(() => {
    if (!selected) return 0
    return selected.current - selected.history[0]
  }, [selected])

  /* 在识货搜索（网页直达） */
  const searchShihuo = (kw: string) => {
    window.open(`https://www.shihuo.cn/search?keyword=${encodeURIComponent(kw)}`, '_blank')
  }

  /* 得物：复制关键词 + 打开得物（网页版无搜索，App 内粘贴搜索） */
  const searchDewu = async (kw: string) => {
    try {
      await navigator.clipboard.writeText(kw)
      alert(`已复制「${kw}」\n\n得物网页版不支持搜索，已为你打开得物——\n请在得物 App 搜索框粘贴关键词即可查价。`)
    } catch {
      alert(`请在得物 App 中搜索：${kw}`)
    }
    window.open('https://www.dewu.com', '_blank')
  }

  const saveKey = () => {
    const k = keyInput.trim()
    localStorage.setItem(KEY_STORAGE, k)
    setApiKey(k)
    setShowKeyPanel(false)
  }

  /* AI：分析选中球鞋 */
  const analyzeShoe = (s: Sneaker) => {
    setSelected(s)
    const prompt =
      `请分析这双篮球鞋是否适合我：\n` +
      `球鞋：${s.name}（${s.brand}，发售价 ¥${s.retail}，当前参考价约 ¥${s.current}）\n` +
      `缓震：${s.cushioning}；重量：${s.weight}\n` +
      `我的情况：位置 ${profilePos}，体重 ${profileWeight}kg，预算约 ¥${profileBudget}\n` +
      `请从缓震保护、抓地、包裹、性价比四个角度给出分析，并给出购买建议（现在买还是等降价）。`
    sendToAI(prompt)
  }

  const sendToAI = async (raw?: string) => {
    const text = (raw ?? input).trim()
    if (!text) return
    if (!apiKey) {
      setShowKeyPanel(true)
      setAiError('请先设置 DeepSeek API Key')
      return
    }
    setInput('')
    setAiError('')
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setAiLoading(true)
    try {
      const reply = await askDeepSeek(apiKey, next.slice(-12))
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : '请求失败'
      setAiError(
        msg.includes('401') ? 'API Key 无效，请检查后重新设置' :
        msg.includes('network') || msg.includes('Failed to fetch') ? '网络请求失败，请检查网络后重试' : msg
      )
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="page sneakers-page">
      <h1 className="snk-title">👟 球鞋推荐中心</h1>
      <p className="snk-intro">
        根据你的<b>位置、体重、打法与预算</b>挑选实战篮球鞋。点击球鞋查看
        <b>价格走势</b>与详细配置，可一键跳转 <b>识货</b> / <b>得物</b> 比价，
        并支持 <b>AI（DeepSeek）</b> 智能咨询。
      </p>
      <div className="snk-update-bar">
        <span className="snk-update-badge">🆕 已更新至 2025-2026 最新款</span>
        <span className="snk-update-date">数据更新日期：{DATA_DATE}</span>
        <span className="snk-update-tip">价格走势为参考行情，实时价格请点击「识货比价」或「得物查价」</span>
      </div>

      {/* 搜索与筛选 */}
      <div className="card snk-search-card">
        <div className="snk-search-row">
          <input
            className="snk-input snk-search-input"
            placeholder="搜索球鞋，如：KD 18、欧文、䨻、缓震…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn snk-btn-search" onClick={() => searchShihuo(query.trim() || '篮球鞋')}>
            🔎 识货搜索「{query.trim() || '篮球鞋'}」
          </button>
          <button className="btn snk-btn-dewu" onClick={() => searchDewu(query.trim() || '篮球鞋')}>
            得物查价
          </button>
        </div>
        <div className="snk-filters">
          <div className="snk-filter-group">
            <span className="snk-filter-label">品牌</span>
            {BRANDS.map((b) => (
              <button
                key={b}
                className={`snk-chip ${brand === b ? 'active' : ''}`}
                onClick={() => setBrand(b)}
              >
                {b}
              </button>
            ))}
          </div>
          <div className="snk-filter-group">
            <span className="snk-filter-label">位置</span>
            {POSITIONS.map((p) => (
              <button
                key={p}
                className={`snk-chip ${position === p ? 'active' : ''}`}
                onClick={() => setPosition(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="snk-filter-group">
            <span className="snk-filter-label">预算</span>
            {BUDGETS.map((b) => (
              <button
                key={b.label}
                className={`snk-chip ${budget === b.label ? 'active' : ''}`}
                onClick={() => setBudget(b.label)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div className="snk-count-row">
          <p className="snk-count">
            共 {filtered.length} 款球鞋{filtered.length > visibleCount && ` · 已显示 ${shown.length} 款`}
          </p>
          <select
            className="snk-select snk-sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as (typeof SORTS)[number])}
          >
            {SORTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* 球鞋卡片网格 */}
      <div className="snk-grid">
        {shown.map((s) => (
          <div key={s.id} className="snk-card card" onClick={() => setSelected(s)}>
            {s.year >= 2025 && <span className="snk-new-badge">NEW {s.year}</span>}
            <div className="snk-card-head">
              <span className="snk-brand">{s.brand}</span>
              <span className="snk-price">¥{s.current}</span>
            </div>
            <h3 className="snk-name">{s.name}</h3>
            <p className="snk-oneliner">{s.oneLiner}</p>
            <div className="snk-tags">
              {s.positions.map((p) => (
                <span key={p} className="snk-tag">{p}</span>
              ))}
              <span className="snk-tag dim">发售价 ¥{s.retail}</span>
            </div>
            <div className="snk-ratings">
              {s.ratings.map((r) => (
                <div key={r.label} className="snk-rating-row">
                  <span className="snk-rating-label">{r.label}</span>
                  <div className="snk-rating-bar">
                    <div className="snk-rating-fill" style={{ width: `${(r.score / 5) * 100}%` }} />
                  </div>
                  <span className="snk-rating-num">{r.score}</span>
                </div>
              ))}
            </div>
            <button className="btn snk-btn-detail" onClick={(e) => { e.stopPropagation(); setSelected(s) }}>
              查看详情与价格走势 →
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="snk-empty card">
            <p>没有找到匹配的球鞋 😥</p>
            <p className="dim">试试调整筛选条件，或直接用上方识货/得物搜索。</p>
          </div>
        )}
      </div>

      {/* 加载更多 */}
      {filtered.length > visibleCount && (
        <div className="snk-load-more">
          <button className="btn snk-btn-ghost" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
            加载更多（还有 {filtered.length - visibleCount} 款）
          </button>
        </div>
      )}

      {/* ============ AI 助手 ============ */}
      <div className="card snk-ai-card">
        <div className="snk-ai-head">
          <h2>🤖 AI 球鞋顾问</h2>
          <div className="snk-ai-actions">
            {apiKey && <span className="snk-key-ok">✓ 已配置 DeepSeek</span>}
            <button className="btn snk-btn-ghost" onClick={() => { setKeyInput(apiKey); setShowKeyPanel(!showKeyPanel) }}>
              ⚙ 设置
            </button>
          </div>
        </div>

        {showKeyPanel && (
          <div className="snk-key-panel">
            <div className="snk-key-guide">
              <p className="snk-key-guide-title">📋 首次使用？照着下面 4 步做，约 2 分钟搞定（免费注册，用多少充多少）</p>
              <ol>
                <li>
                  打开官网{' '}
                  <a href="https://platform.deepseek.com/" target="_blank" rel="noreferrer">
                    platform.deepseek.com →点此直达←
                  </a>
                  ，用手机号或邮箱注册并登录
                </li>
                <li>（建议）左侧菜单点「充值」，充 ¥10 即可用很久；不充值也能创建 Key，但没余额无法调用</li>
                <li>左侧菜单点「API Keys」→ 点「创建 API Key」→ 随便起个名字（如"球鞋"）→ 确认</li>
                <li>
                  <b>立刻复制弹出的 Key</b>（以 sk- 开头，只显示这一次），粘贴到下面输入框，点「保存」即可
                </li>
              </ol>
              <p className="dim">
                Key 仅保存在你自己浏览器里，不会上传服务器，别人看不到也用不了。换设备或清除浏览器数据后需重新填一次。
                遇到「余额不足」就去官网充值；「Key 无效」就重新创建一个。
              </p>
            </div>
            <div className="snk-key-row">
              <input
                className="snk-input"
                type="password"
                placeholder="sk-..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button className="btn snk-btn-primary" onClick={saveKey}>保存</button>
            </div>
          </div>
        )}

        {/* 用户画像 */}
        <div className="snk-profile">
          <span className="snk-filter-label">我的画像：</span>
          <select className="snk-select" value={profilePos} onChange={(e) => setProfilePos(e.target.value)}>
            {['后卫', '前锋', '中锋'].map((p) => <option key={p}>{p}</option>)}
          </select>
          <input
            className="snk-input snk-profile-num" type="number" min="35" max="160"
            value={profileWeight} onChange={(e) => setProfileWeight(e.target.value)}
            title="体重"
          />
          <span className="dim">kg</span>
          <input
            className="snk-input snk-profile-num" type="number" min="200" max="3000" step="100"
            value={profileBudget} onChange={(e) => setProfileBudget(e.target.value)}
            title="预算"
          />
          <span className="dim">元预算</span>
          <button
            className="btn snk-btn-ghost"
            onClick={() => sendToAI(`我的情况：位置${profilePos}，体重${profileWeight}kg，预算约¥${profileBudget}。请推荐 3 款最适合我的实战篮球鞋，说明理由和大致行情价。`)}
          >
            让 AI 按画像推荐
          </button>
        </div>

        {/* 对话区 */}
        <div className="snk-chat">
          {messages.map((m, i) => (
            <div key={i} className={`snk-msg ${m.role}`}>
              <div className="snk-msg-bubble">{m.content}</div>
            </div>
          ))}
          {aiLoading && (
            <div className="snk-msg assistant">
              <div className="snk-msg-bubble snk-typing">AI 正在思考…</div>
            </div>
          )}
        </div>
        {aiError && <p className="snk-error">⚠ {aiError}</p>}
        <div className="snk-chat-input-row">
          <input
            className="snk-input snk-chat-input"
            placeholder="问 AI：例如「KD 18 和全城12 怎么选？」"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendToAI() }}
          />
          <button className="btn snk-btn-primary" onClick={() => sendToAI()} disabled={aiLoading}>
            发送
          </button>
        </div>
      </div>

      <p className="snk-disclaimer">
        * 价格走势为基于市场行情的参考数据（示意），实际价格请以得物 / 识货实时报价为准；
        球鞋评价基于公开测评口碑整理，仅供参考。
      </p>

      {/* ============ 详情弹窗 ============ */}
      {selected && (
        <div className="snk-modal-mask" onClick={() => setSelected(null)}>
          <div className="snk-modal card" onClick={(e) => e.stopPropagation()}>
            <button className="snk-modal-close" onClick={() => setSelected(null)}>✕</button>

            <div className="snk-modal-head">
              <div>
                <span className="snk-brand">{selected.brand}</span>
                <h2>{selected.name}</h2>
                <p className="snk-oneliner">{selected.oneLiner}</p>
              </div>
              <div className="snk-modal-price">
                <span className="snk-price-now">¥{selected.current}</span>
                <span className="snk-price-trend">
                  较12个月前 {trend >= 0 ? '↑ +' : '↓ '}{trend} 元
                </span>
                <span className="snk-price-retail dim">发售价 ¥{selected.retail}</span>
              </div>
            </div>

            <h3 className="snk-section-title">📈 近12个月价格走势（参考行情）</h3>
            <div className="snk-chart">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="m" tick={{ fontSize: 10, fill: '#6b7280' }} interval={1} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#6b7280' }} width={52} />
                  <Tooltip formatter={(v: number | string) => [`¥${v}`, '参考价']} />
                  <Line type="monotone" dataKey="price" stroke="#12b3d6" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <h3 className="snk-section-title">📋 配置与评分</h3>
            <div className="snk-specs">
              <div className="snk-spec"><span className="dim">缓震科技</span><b>{selected.cushioning}</b></div>
              <div className="snk-spec"><span className="dim">单只重量</span><b>{selected.weight}</b></div>
              <div className="snk-spec"><span className="dim">适合位置</span><b>{selected.positions.join(' / ')}</b></div>
              <div className="snk-spec"><span className="dim">适合人群</span><b>{selected.footType}</b></div>
            </div>
            <div className="snk-ratings snk-modal-ratings">
              {selected.ratings.map((r) => (
                <div key={r.label} className="snk-rating-row">
                  <span className="snk-rating-label">{r.label}</span>
                  <div className="snk-rating-bar">
                    <div className="snk-rating-fill" style={{ width: `${(r.score / 5) * 100}%` }} />
                  </div>
                  <span className="snk-rating-num">{r.score}/5</span>
                </div>
              ))}
            </div>

            <h3 className="snk-section-title">✨ 特点</h3>
            <ul className="snk-features">
              {selected.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>

            <div className="snk-modal-actions">
              <button className="btn snk-btn-buy shihuo" onClick={() => searchShihuo(selected.searchKey)}>
                🔗 识货比价
              </button>
              <button className="btn snk-btn-buy dewu" onClick={() => searchDewu(selected.searchKey)}>
                🔗 得物查价
              </button>
              <button
                className="btn snk-btn-primary"
                onClick={() => analyzeShoe(selected)}
                disabled={aiLoading}
              >
                🤖 AI 分析这双鞋
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
