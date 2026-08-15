import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const client = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

/** 上传视频与分析请求 */
export async function uploadAnalysis(
  file: File,
  athleteInfo: Record<string, unknown>,
  actionType: string,
): Promise<{ task_id: string }> {
  const form = new FormData()
  form.append('video', file)
  form.append('athlete_info', JSON.stringify(athleteInfo))
  form.append('action_type', actionType)
  const res = await client.post('/analysis/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
  return res.data
}

/** 轮询分析进度 */
export async function getProgress(taskId: string) {
  const res = await client.get(`/analysis/${taskId}/progress`)
  return res.data
}

/** 获取完整结果 */
export async function getResult(taskId: string) {
  const res = await client.get(`/analysis/${taskId}/result`)
  return res.data
}

/** 带骨骼叠加的视频地址 */
export function getAnnotatedVideoUrl(taskId: string): string {
  return `${API_BASE}/analysis/${taskId}/annotated-video`
}

/** 问题动作片段视频地址 */
export function getProblemMomentVideoUrl(taskId: string, clipIndex: number): string {
  return `${API_BASE}/analysis/${taskId}/problem-moment/${clipIndex}/video`
}

/** 文字版 PDF 报告地址 */
export function getPdfUrl(taskId: string): string {
  return `${API_BASE}/analysis/${taskId}/pdf`
}

/** 逐帧特征时间序列 */
export interface FrameFeature {
  frame: number
  time: number
  knee_flexion: number
  knee_valgus: number
  trunk_lean: number
  trunk_lateral: number
  com_y: number
}

export async function getTimeline(taskId: string): Promise<FrameFeature[]> {
  const res = await client.get(`/analysis/${taskId}/timeline`)
  return res.data
}

/** 历史分析记录 */
export interface HistoryRecord {
  task_id: string
  created_at: string
  action_type: string
  athlete_name: string
  overall_score: number
  overall_level: string
}

export async function getHistory(): Promise<HistoryRecord[]> {
  const res = await client.get('/analysis/history')
  return res.data
}

/** 支持的动作列表 */
export async function getActions() {
  const res = await client.get('/meta/actions')
  return res.data
}

/** 拍摄指导 */
export async function getGuide() {
  const res = await client.get('/meta/guide')
  return res.data
}

export default client
