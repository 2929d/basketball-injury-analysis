import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AthleteInfo } from '../types'
import './Athlete.css'

const SPORTS = [
  '篮球', '足球', '排球', '田径', '羽毛球', '乒乓球', '网球', '游泳',
  '体操', '武术', '滑雪', '举重', '其他',
]
const LEVELS = ['业余', '校队', '专业', '精英', '职业']
const LEGS = ['左腿', '右腿', '双腿均衡']

const STORAGE_KEY = 'athlete_info'

const defaultInfo: AthleteInfo = {
  age: '',
  gender: '男',
  height_cm: '',
  weight_kg: '',
  sport: '篮球',
  level: '校队',
  dominant_leg: '右腿',
  injury_history: '',
  current_pain: '',
  weekly_training_freq: '',
  fatigue_level: 3,
}

function loadInfo(): AthleteInfo {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultInfo, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return defaultInfo
}

export default function Athlete() {
  const navigate = useNavigate()
  const [info, setInfo] = useState<AthleteInfo>(loadInfo)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (k: keyof AthleteInfo, v: AthleteInfo[keyof AthleteInfo]) =>
    setInfo((p) => ({ ...p, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!info.age || Number(info.age) < 6 || Number(info.age) > 80)
      e.age = '请输入 6-80 之间的年龄'
    if (!info.height_cm || Number(info.height_cm) < 100 || Number(info.height_cm) > 250)
      e.height_cm = '身高范围 100-250 cm'
    if (!info.weight_kg || Number(info.weight_kg) < 30 || Number(info.weight_kg) > 200)
      e.weight_kg = '体重范围 30-200 kg'
    if (!info.weekly_training_freq && info.weekly_training_freq !== 0)
      e.weekly_training_freq = '请输入每周训练频率'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(info))
    navigate('/upload')
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>运动员信息录入</h1>
        <p>填写运动员基础数据与训练状态，用于个性化风险评估</p>
      </div>

      <div className="athlete-layout">
        <div className="card athlete-form">
          <div className="form-row">
            <div className="field">
              <label>年龄</label>
              <input
                className="input"
                type="number"
                value={info.age}
                onChange={(e) => set('age', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="如 22"
              />
              {errors.age && <div className="err">{errors.age}</div>}
            </div>
            <div className="field">
              <label>性别</label>
              <select
                className="select"
                value={info.gender}
                onChange={(e) => set('gender', e.target.value)}
              >
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>身高 (cm)</label>
              <input
                className="input"
                type="number"
                value={info.height_cm}
                onChange={(e) =>
                  set('height_cm', e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="如 178"
              />
              {errors.height_cm && <div className="err">{errors.height_cm}</div>}
            </div>
            <div className="field">
              <label>体重 (kg)</label>
              <input
                className="input"
                type="number"
                value={info.weight_kg}
                onChange={(e) =>
                  set('weight_kg', e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="如 72"
              />
              {errors.weight_kg && <div className="err">{errors.weight_kg}</div>}
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>体育项目</label>
              <select
                className="select"
                value={info.sport}
                onChange={(e) => set('sport', e.target.value)}
              >
                {SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>运动水平</label>
              <select
                className="select"
                value={info.level}
                onChange={(e) => set('level', e.target.value)}
              >
                {LEVELS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>惯用腿</label>
              <select
                className="select"
                value={info.dominant_leg}
                onChange={(e) => set('dominant_leg', e.target.value)}
              >
                {LEGS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>本周训练频率 (次/周)</label>
              <input
                className="input"
                type="number"
                value={info.weekly_training_freq}
                onChange={(e) =>
                  set(
                    'weekly_training_freq',
                    e.target.value === '' ? '' : Number(e.target.value),
                  )
                }
                placeholder="如 5"
              />
              {errors.weekly_training_freq && (
                <div className="err">{errors.weekly_training_freq}</div>
              )}
            </div>
          </div>

          <div className="field">
            <label>既往伤病史</label>
            <textarea
              className="textarea"
              value={info.injury_history}
              onChange={(e) => set('injury_history', e.target.value)}
              placeholder="如：右膝关节半月板损伤（2023年）、左踝扭伤等"
            />
          </div>

          <div className="field">
            <label>当前疼痛部位</label>
            <textarea
              className="textarea"
              value={info.current_pain}
              onChange={(e) => set('current_pain', e.target.value)}
              placeholder="如：无 / 膝关节前侧轻微疼痛 / 跟腱酸胀等"
            />
          </div>

          <div className="field">
            <label>疲劳程度：{info.fatigue_level} / 10</label>
            <input
              className="slider"
              type="range"
              min={0}
              max={10}
              value={info.fatigue_level}
              onChange={(e) => set('fatigue_level', Number(e.target.value))}
            />
            <div className="slider-labels">
              <span>0 充沛</span>
              <span>5 一般</span>
              <span>10 极度疲劳</span>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary btn-lg" onClick={handleSubmit}>
              下一步：上传视频
            </button>
          </div>
        </div>

        <aside className="card athlete-side">
          <h3 className="section-title">为什么要这些信息</h3>
          <ul className="side-list">
            <li>
              <strong>年龄 / 体重</strong>：用于估算关节负荷与生长发育阶段风险。
            </li>
            <li>
              <strong>惯用腿</strong>：判断左右侧发力不对称是否为生理性。
            </li>
            <li>
              <strong>伤病 / 疼痛</strong>：结合病史给出针对性建议，规避高风险动作。
            </li>
            <li>
              <strong>训练频率 / 疲劳</strong>：疲劳状态下动作变形是损伤主因之一。
            </li>
          </ul>
          <div className="side-tip">
            所有数据仅用于本次分析，保存在浏览器本地会话中。
          </div>
        </aside>
      </div>
    </div>
  )
}
