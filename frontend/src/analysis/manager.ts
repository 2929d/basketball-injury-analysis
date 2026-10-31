/**
 * 本地分析任务管理器
 *
 * 替代后端"上传→轮询进度"模型:
 * - startLocalAnalysis: 在浏览器后台启动分析, 返回 taskId
 * - getLocalTaskState:  供 /analysis/:taskId 页面轮询进度与实时骨骼预览
 * - getLocalVideoUrl:   供 /report/:taskId 页面回放原始视频(仅当次会话有效)
 *
 * 任务状态仅存内存; 分析完成后的结果由 pipeline 持久化到 localStorage,
 * 因此报告页刷新后仍可查看, 但视频 blob URL 会随会话失效。
 */
import type { AnalysisResult, AthleteInfo, AnalysisStatus } from './types'
import { runLocalAnalysis } from './pipeline'

export interface LocalTaskState {
  taskId: string
  status: AnalysisStatus
  progress: number
  message: string
  /** 实时骨骼预览画布(分析引擎每帧更新) */
  previewCanvas: HTMLCanvasElement | null
  result: AnalysisResult | null
  error: string
  startedAt: number
}

const activeTasks = new Map<string, LocalTaskState>()
/** taskId -> 原始视频 blob URL(仅当次会话) */
const videoUrls = new Map<string, string>()

/** 启动一次本地分析, 立即返回 taskId, 分析在后台执行 */
export function startLocalAnalysis(
  file: File,
  athlete: AthleteInfo,
  actionType: string,
): string {
  const taskId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const state: LocalTaskState = {
    taskId,
    status: 'queued',
    progress: 0,
    message: '正在准备分析…',
    previewCanvas: null,
    result: null,
    error: '',
    startedAt: Date.now(),
  }
  activeTasks.set(taskId, state)
  videoUrls.set(taskId, URL.createObjectURL(file))

  runLocalAnalysis(
    taskId,
    file,
    athlete,
    actionType,
    (update) => {
      state.status = update.status
      state.progress = update.progress
      state.message = update.message
      if (update.status === 'error') {
        state.error = update.message
      }
    },
    (_frameIndex, canvas) => {
      // 分析引擎每帧把"视频帧+骨骼"画到自己的画布上, 这里持有引用供预览页拷贝
      state.previewCanvas = canvas
    },
  )
    .then((result) => {
      // 若管线内部以 error 状态收尾(如视频质量不合格), 不要覆盖为 done
      if (state.status !== 'error') {
        state.status = 'done'
        state.progress = 100
        state.message = '分析完成'
      }
      state.result = result
      // 保留状态 30 分钟供查看, 之后清理内存(结果已在 localStorage)
      setTimeout(() => {
        activeTasks.delete(taskId)
        const url = videoUrls.get(taskId)
        if (url) URL.revokeObjectURL(url)
        videoUrls.delete(taskId)
      }, 30 * 60 * 1000)
    })
    .catch((e: unknown) => {
      state.status = 'error'
      state.error = e instanceof Error ? e.message : '分析过程中出现错误'
      state.message = state.error
    })

  return taskId
}

/** 获取进行中/刚完成的分析任务状态(内存态, 刷新后不可用) */
export function getLocalTaskState(taskId: string): LocalTaskState | undefined {
  return activeTasks.get(taskId)
}

/** 获取该任务对应的原始视频 blob URL(仅当次会话) */
export function getLocalVideoUrl(taskId: string): string | undefined {
  return videoUrls.get(taskId)
}
