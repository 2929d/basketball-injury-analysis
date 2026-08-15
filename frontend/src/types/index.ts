// 运动损伤风险评估系统 - 类型定义

export type RiskLevel = '低风险' | '中风险' | '高风险'

export type AnalysisStatus =
  | 'queued'
  | 'quality_checking'
  | 'posing'
  | 'extracting'
  | 'scoring'
  | 'done'
  | 'error'

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

export interface VideoQualityIssue {
  code: string
  message: string
  severity: string
}

export interface VideoQuality {
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

export interface Trajectory {
  joint_name: string
  side: string
  points: TrajectoryPoint[]
}

export interface Phase {
  phase_type: string
  start_frame: number
  end_frame: number
  start_time_ms: number
  end_time_ms: number
}

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

export interface Features {
  knee: KneeFeatures
  hip: HipFeatures
  ankle: AnkleFeatures
  trunk: TrunkFeatures
  overall: OverallFeatures
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

export interface RiskItem {
  category: string
  score: number
  level: RiskLevel
  main_causes: string[]
  recommendations: string[]
  exercises?: Exercise[]
  athlete_adjustments?: AthleteAdjustment[]
  base_score?: number
}

export interface GearProtector {
  name: string
  desc: string
  scene: string
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
  models?: ShoeModel[]
}

export interface GearRecommendations {
  protectors: GearProtector[]
  shoes: GearShoe[]
}

export interface Risk {
  overall_score: number
  overall_level: RiskLevel
  high_risk_action_probability: number
  items: RiskItem[]
  summary: string
  plain_summary?: string
  action_guide?: string
  training_plan?: TrainingDay[]
  gear_recommendations?: GearRecommendations
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

export interface ProblemMoment {
  frame: number
  timestamp: number
  issue: string
  value: number
  description: string
  clip_index: number
}

export interface AnalysisResult {
  task_id: string
  athlete_info: {
    age: number
    gender: string
    height_cm: number
    weight_kg: number
    sport: string
    level: string
    dominant_leg: string
    injury_history: string
    current_pain: string
    weekly_training_freq: number
    fatigue_level: number
  }
  action_type: string
  video_quality: VideoQuality
  pose: {
    fps: number
    total_frames: number
    skeleton_connections: string[][]
    annotated_video_path: string
  } | null
  trajectories: Trajectory[]
  phases: Phase[]
  features: Features | null
  risk: Risk | null
  problem_moments?: ProblemMoment[]
  created_at: string
}

export interface ProgressResponse {
  task_id: string
  status: AnalysisStatus
  progress: number
  message: string
  result: AnalysisResult | null
}

export interface ActionOption {
  value: string
  label: string
  desc: string
}

export interface GuideItem {
  title: string
  content: string
}
