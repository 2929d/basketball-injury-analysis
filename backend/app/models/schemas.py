"""
数据模型契约 —— 所有模块的接口基础。
所有跨模块数据结构在此定义，确保姿态识别 / 轨迹 / 阶段 / 生物力学 / 风险评估 / API 之间类型一致。
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ============================================================
# 枚举
# ============================================================
class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"


class RiskLevel(str, Enum):
    LOW = "低风险"
    MEDIUM = "中风险"
    HIGH = "高风险"


class ActionType(str, Enum):
    DOUBLE_LEG_LANDING = "双脚垂直跳跃落地"
    SINGLE_LEG_LANDING = "单脚跳跃落地"
    LATERAL_STOP = "侧向移动后急停"
    CUTTING = "快速变向动作"
    SQUAT_JUMP = "深蹲起跳与落地"


class PhaseType(str, Enum):
    PREPARATION = "准备阶段"
    TAKEOFF = "起跳阶段"
    FLIGHT = "腾空阶段"
    INITIAL_CONTACT = "初次触地"
    LANDING = "落地缓冲"
    STABILIZATION = "身体稳定"


# ============================================================
# 运动员信息（辅助变量）
# ============================================================
class AthleteInfo(BaseModel):
    age: int = Field(..., ge=6, le=80)
    gender: Gender
    height_cm: float = Field(..., gt=100, lt=250)
    weight_kg: float = Field(..., gt=20, lt=200)
    sport: str = "篮球"
    level: str = "业余"                      # 业余/校队/专业
    dominant_leg: str = "右"                  # 左/右/双
    injury_history: str = ""
    current_pain: bool = False
    weekly_training_freq: int = 0
    fatigue_level: int = Field(0, ge=0, le=10)   # 0-10 主观疲劳

    # 兼容前端中文输入: gender "男"/"女" -> "male"/"female"
    @field_validator("gender", mode="before")
    @classmethod
    def _norm_gender(cls, v):
        if isinstance(v, str):
            m = {"男": "male", "male": "male", "女": "female", "female": "female"}
            return m.get(v.strip(), v)
        return v

    # 兼容前端字符串输入: "无"/"没有"/"" -> False, 其他描述 -> True
    @field_validator("current_pain", mode="before")
    @classmethod
    def _norm_pain(cls, v):
        if isinstance(v, bool):
            return v
        if v is None:
            return False
        if isinstance(v, (int, float)):
            return bool(v)
        s = str(v).strip()
        return s not in ("", "无", "没有", "否", "无疼痛", "none", "None")

    # 兼容前端空字符串数值: "" -> 0 (age/height/weight 由前端校验保证有值)
    @field_validator("age", "height_cm", "weight_kg", "weekly_training_freq", "fatigue_level", mode="before")
    @classmethod
    def _norm_num(cls, v):
        if v is None or v == "":
            return 0
        return v


# ============================================================
# 姿态识别
# ============================================================
class KeyPoint(BaseModel):
    name: str
    x: float                                 # 归一化坐标 [0,1]
    y: float
    z: float = 0.0                           # 相对深度
    visibility: float = 0.0                  # 0-1


class PoseFrame(BaseModel):
    frame_index: int
    timestamp_ms: float
    keypoints: dict[str, KeyPoint]
    image_width: int
    image_height: int


class PoseResult(BaseModel):
    frames: list[PoseFrame]
    fps: float
    total_frames: int
    skeleton_connections: list[list[str]]
    annotated_video_path: Optional[str] = None


# ============================================================
# 轨迹
# ============================================================
class TrajectoryPoint(BaseModel):
    frame_index: int
    timestamp_ms: float
    x: float
    y: float
    z: float = 0.0
    vx: float = 0.0                          # 像素/帧
    vy: float = 0.0
    v: float = 0.0                           # 合速度
    ax: float = 0.0
    ay: float = 0.0


class JointTrajectory(BaseModel):
    joint_name: str
    side: str                                # left / right / center
    points: list[TrajectoryPoint]


# ============================================================
# 动作阶段
# ============================================================
class ActionPhase(BaseModel):
    phase_type: PhaseType
    start_frame: int
    end_frame: int
    start_time_ms: float
    end_time_ms: float


# ============================================================
# 生物力学特征
# ============================================================
class KneeFeatures(BaseModel):
    initial_contact_flexion_deg: float       # 初次触地膝关节屈曲角
    max_flexion_deg: float                   # 最大膝关节屈曲角
    valgus_deg: float                        # 膝关节内扣(外翻)程度
    lateral_displacement: float              # 膝关节横向偏移(归一化)
    angular_velocity: float                  # 膝关节角速度 deg/s
    left_right_diff_deg: float               # 左右膝屈曲差
    knee_toe_alignment_deg: float            # 膝-脚尖方向一致性偏差


class HipFeatures(BaseModel):
    flexion_deg: float
    adduction_deg: float                     # 内收(+)/外展(-)
    left_right_height_diff: float            # 左右髋高度差(归一化)
    pelvic_tilt_deg: float                   # 骨盆倾斜
    stability: float                         # 髋部稳定性(0-1, 越高越稳)


class AnkleFeatures(BaseModel):
    dorsiflexion_deg: float                  # 踝背屈
    foot_landing_direction_deg: float        # 足部落地方向
    left_right_contact_time_diff_ms: float   # 左右脚触地时间差
    ankle_sway_deg: float                    # 踝关节晃动
    stabilization_time_ms: float             # 足部稳定时间


class TrunkFeatures(BaseModel):
    forward_lean_deg: float                  # 躯干前倾
    lateral_lean_deg: float                  # 躯干侧倾
    shoulder_hip_axis_deviation_deg: float   # 肩髋轴线偏差
    com_lateral_displacement: float          # 重心横向偏移(归一化)
    upper_rotation_deg: float                # 上半身旋转


class OverallFeatures(BaseModel):
    landing_buffer_time_ms: float            # 落地缓冲时间
    com_drop_distance: float                 # 重心下降距离(归一化)
    action_duration_ms: float                # 动作完成时间
    bilateral_asymmetry: float               # 左右不对称指数 0-1
    stabilization_time_ms: float             # 稳定所需时间
    consistency: float                       # 多次动作一致性 0-1
    fatigue_change: float                    # 疲劳前后动作变化 0-1


class BiomechanicsFeatures(BaseModel):
    knee: KneeFeatures
    hip: HipFeatures
    ankle: AnkleFeatures
    trunk: TrunkFeatures
    overall: OverallFeatures


# ============================================================
# 风险评估
# ============================================================
class RiskItem(BaseModel):
    category: str                            # 膝关节/踝关节/髋关节/躯干控制/左右不对称/动作稳定性
    score: float                             # 0-100, 越高越危险
    level: RiskLevel
    main_causes: list[str]
    recommendations: list[str]
    exercises: list[dict] = Field(default_factory=list)   # 训练动作[{name,steps,dose,video}]
    cause_codes: list[str] = Field(default_factory=list)  # 风险成因码(用于个性化护具匹配)
    athlete_adjustments: list[dict] = Field(default_factory=list)  # 运动员信息调整明细[{factor,delta,reason}]
    base_score: float = 0.0                                  # 运动员信息调整前的基础分


class RiskAssessmentResult(BaseModel):
    overall_score: float                     # 0-100
    overall_level: RiskLevel
    high_risk_action_probability: float      # 0-1 高风险动作模式概率
    items: list[RiskItem]
    summary: str
    plain_summary: str = ""                                     # 大白话总结(面向普通人)
    action_guide: str = ""                                      # 动作要领大白话(腿怎么弯弯多少)
    training_plan: list = Field(default_factory=list)          # 个性化周训练计划
    gear_recommendations: dict = Field(default_factory=dict)   # 护具球鞋推荐 {protectors, shoes}


# ============================================================
# 视频质量检测
# ============================================================
class VideoQualityIssue(BaseModel):
    code: str
    message: str
    severity: str                            # warning / error


class VideoQualityResult(BaseModel):
    passed: bool
    issues: list[VideoQualityIssue]
    person_detected: bool
    avg_confidence: float
    brightness: float                        # 0-255 均值
    fps: float
    width: int
    height: int
    duration_sec: float


# ============================================================
# 完整分析结果
# ============================================================
class ProblemMoment(BaseModel):
    """问题动作时刻(供截取片段回放)"""
    frame: int                                # 问题帧索引
    timestamp: float                          # 时间戳(秒)
    issue: str                                # 问题类型: 膝内扣/躯干侧倾/踝晃动/落地瞬间
    value: float                              # 问题指标值
    description: str                          # 通俗描述
    clip_index: int = 0                       # 片段索引(对应视频文件)


class AnalysisResult(BaseModel):
    task_id: str
    athlete_info: AthleteInfo
    action_type: ActionType
    video_quality: VideoQualityResult
    pose: Optional[PoseResult] = None
    trajectories: list[JointTrajectory] = Field(default_factory=list)
    phases: list[ActionPhase] = Field(default_factory=list)
    features: Optional[BiomechanicsFeatures] = None
    risk: Optional[RiskAssessmentResult] = None
    problem_moments: list[ProblemMoment] = Field(default_factory=list)   # 问题动作时刻
    action_validity: dict = Field(default_factory=dict)               # 动作有效性评估(防止走路误识别)
    created_at: str


# 分析进度（用于前端轮询）
class AnalysisProgress(BaseModel):
    task_id: str
    status: str                              # queued/quality_checking/posing/extracting/scoring/done/error
    progress: int                            # 0-100
    message: str
    result: Optional[AnalysisResult] = None
