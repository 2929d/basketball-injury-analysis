/**
 * 纯前端分析引擎 - 内部数据类型
 *
 * 与后端 models/schemas.py 对齐，但移除 pydantic 依赖，纯 TS 结构。
 * 最终 AnalysisResult 会转换为前端 types/index.ts 中的结构存储到 localStorage。
 */

// ============ 姿态识别 ============

export interface KP {
  name: string
  x: number
  y: number
  z: number
  visibility: number
}

export interface PoseFrame {
  frame_index: number
  timestamp_ms: number
  keypoints: Record<string, KP>
  image_width: number
  image_height: number
}

/** 分析目标诊断信息: 说明这次分析"骨骼锁在了谁身上" */
export interface PoseTargetInfo {
  /** 判定出的运动员 track id */
  track_id: number
  /** true = 按运动能量判别出运动员; false = 画面主要人形目标几乎静止(疑似墙上海报/大屏画面) */
  motion: boolean
  /** 参与判别的候选目标数量 */
  candidates: number
}

export interface PoseData {
  frames: PoseFrame[]
  fps: number
  total_frames: number
  skeleton_connections: string[][]
  /** 浏览器版附加: 分析目标判别结果 */
  target?: PoseTargetInfo
}

// ============ 轨迹 ============

export interface TrajectoryPoint {
  frame_index: number
  timestamp_ms: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  v: number
  ax: number
  ay: number
}

export interface JointTrajectory {
  joint_name: string
  side: string
  points: TrajectoryPoint[]
}

// ============ 动作阶段 ============

export type PhaseTypeStr =
  | '准备阶段'
  | '起跳阶段'
  | '腾空阶段'
  | '初次触地'
  | '落地缓冲'
  | '身体稳定'

export interface ActionPhase {
  phase_type: PhaseTypeStr
  start_frame: number
  end_frame: number
  start_time_ms: number
  end_time_ms: number
}

// ============ 动作类型 ============

export const ACTION_TYPES = [
  '双脚垂直跳跃落地',
  '单脚跳跃落地',
  '侧向移动后急停',
  '快速变向动作',
  '深蹲起跳与落地',
] as const

export type ActionType = (typeof ACTION_TYPES)[number]

// ============ 生物力学特征 ============

export interface KneeFeatures {
  initial_contact_flexion_deg: number
  max_flexion_deg: number
  valgus_deg: number
  lateral_displacement: number
  angular_velocity: number
  left_right_diff_deg: number
  knee_toe_alignment_deg: number
}

export interface HipFeatures {
  flexion_deg: number
  adduction_deg: number
  left_right_height_diff: number
  pelvic_tilt_deg: number
  stability: number
}

export interface AnkleFeatures {
  dorsiflexion_deg: number
  foot_landing_direction_deg: number
  left_right_contact_time_diff_ms: number
  ankle_sway_deg: number
  stabilization_time_ms: number
}

export interface TrunkFeatures {
  forward_lean_deg: number
  lateral_lean_deg: number
  shoulder_hip_axis_deviation_deg: number
  com_lateral_displacement: number
  upper_rotation_deg: number
}

export interface OverallFeatures {
  landing_buffer_time_ms: number
  com_drop_distance: number
  action_duration_ms: number
  bilateral_asymmetry: number
  stabilization_time_ms: number
  consistency: number
  fatigue_change: number
}

export interface BiomechanicsFeatures {
  knee: KneeFeatures
  hip: HipFeatures
  ankle: AnkleFeatures
  trunk: TrunkFeatures
  overall: OverallFeatures
}

// ============ 风险评估 ============

export type RiskLevel = '低风险' | '中风险' | '高风险'

export interface RiskItem {
  category: string
  score: number
  level: RiskLevel
  main_causes: string[]
  recommendations: string[]
  exercises: Exercise[]
  cause_codes: string[]
  athlete_adjustments: AthleteAdjustment[]
  base_score: number
  /** 该维度数据可信度 0-1（可识别指标权重 / 全部指标权重） */
  confidence?: number
  /** 因超出人体生理范围被剔除的指标说明（检测失败，未计入评分） */
  data_issues?: string[]
}

export interface Exercise {
  name: string
  steps: string
  dose: string
  video: string
}

export interface AthleteAdjustment {
  factor: string
  delta: number
  reason: string
}

export interface RiskResult {
  overall_score: number
  overall_level: RiskLevel
  high_risk_action_probability: number
  /** 整体数据完整度 0-1，低于 0.7 说明有较多指标未能可靠识别 */
  data_confidence?: number
  items: RiskItem[]
  summary: string
  plain_summary: string
  action_guide: string
  training_plan: TrainingDay[]
  gear_recommendations: GearRec
}

export interface TrainingExercise {
  name: string
  dose: string
  purpose: string
}

export interface TrainingDay {
  day: string
  focus: string
  exercises: TrainingExercise[]
}

export interface GearProtector {
  name: string
  desc: string
  scene: string
  level?: string
}

export interface ShoeModel {
  name: string
  brand: string
  highlight: string
}

export interface GearShoe {
  feature: string
  desc: string
  reason: string
  models: ShoeModel[]
}

export interface GearRec {
  protectors: GearProtector[]
  shoes: GearShoe[]
}

// ============ 视频质量 ============

export interface VideoQualityIssue {
  code: string
  message: string
  severity: string
}

export interface VideoQualityResult {
  passed: boolean
  issues: VideoQualityIssue[]
  person_detected: boolean
  avg_confidence: number
  brightness: number
  fps: number
  width: number
  height: number
  duration_sec: number
}

// ============ 运动员信息 ============

export interface AthleteInfo {
  age: number | ''
  gender: string
  height_cm: number | ''
  weight_kg: number | ''
  sport: string
  level: string
  dominant_leg: string
  injury_history: string
  current_pain: string
  weekly_training_freq: number | ''
  fatigue_level: number
}

// ============ 问题时刻 ============

export interface ProblemMoment {
  frame: number
  timestamp: number
  issue: string
  value: number
  description: string
  clip_index: number
}

// ============ 逐帧时间线（报告页逐帧分析用） ============

export interface FrameTimelinePoint {
  frame: number
  time: number
  knee_flexion: number
  knee_valgus: number
  trunk_lean: number
  trunk_lateral: number
  com_y: number
}

// ============ 完整分析结果（与前端 types 兼容） ============

export interface AnalysisResult {
  task_id: string
  athlete_info: AthleteInfo
  action_type: string
  video_quality: VideoQualityResult
  pose: {
    fps: number
    total_frames: number
    skeleton_connections: string[][]
    annotated_video_path: string
  } | null
  trajectories: JointTrajectory[]
  phases: ActionPhase[]
  features: BiomechanicsFeatures | null
  risk: RiskResult | null
  problem_moments: ProblemMoment[]
  /** 浏览器版附加: 全部姿态帧(用于报告页骨骼叠加回放), 帧数过多时可为空 */
  pose_frames?: PoseFrame[]
  /** 浏览器版附加: 逐帧特征时间线(报告页逐帧分析用) */
  timeline?: FrameTimelinePoint[]
  /** 浏览器版附加: 本次分析锁定的目标是否可靠(报告页据此提示"骨骼可能不在运动员身上") */
  analysis_target?: PoseTargetInfo
  action_validity: {
    score: number
    is_valid: boolean
    com_height_range: number
    messages: string[]
  }
  created_at: string
}

// ============ 进度回调 ============

export type AnalysisStatus =
  | 'queued'
  | 'quality_checking'
  | 'posing'
  | 'extracting'
  | 'scoring'
  | 'done'
  | 'error'

export interface ProgressUpdate {
  status: AnalysisStatus
  progress: number
  message: string
}

export type ProgressCallback = (update: ProgressUpdate) => void
