"""
篮球投篮动作分析系统 — ShootingAnalyzer
========================================

基于 MediaPipe Pose 33 关键点的投篮动作量化分析引擎，
提供肘部角度、屈膝角度、肩髋内扣角度、出手高度等核心指标，
自动识别投篮四阶段（屈膝下蹲 → 起跳升力 → 顶肘压腕 → 随挥跟进），
输出风险评估与发力链热力图。

依赖: numpy, pandas, matplotlib(可选)
可选: mediapipe, opencv-python (视频关键点提取)

Author: NBA-level Performance Analysis
License: MIT
"""

from __future__ import annotations

import os
import warnings
from typing import Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd

try:
    import matplotlib
    import matplotlib.pyplot as plt
    from matplotlib.figure import Figure
    from matplotlib.patches import Patch
    # macOS / Linux 中文字体
    for _font in ['Arial Unicode MS', 'PingFang SC', 'STHeiti',
                  'Heiti TC', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei']:
        try:
            matplotlib.font_manager.findfont(_font, fallback_to_default=False)
            plt.rcParams['font.sans-serif'] = [_font] + plt.rcParams['font.sans-serif']
            break
        except Exception:
            continue
    plt.rcParams['axes.unicode_minus'] = False
    _HAS_MPL = True
except ImportError:
    _HAS_MPL = False


# ──────────────────────────────────────────────
# MediaPipe Pose 33 关键点索引
# ──────────────────────────────────────────────
MP_LANDMARKS: Dict[str, int] = {
    'nose': 0,
    'left_shoulder': 11, 'right_shoulder': 12,
    'left_elbow': 13, 'right_elbow': 14,
    'left_wrist': 15, 'right_wrist': 16,
    'left_hip': 23, 'right_hip': 24,
    'left_knee': 25, 'right_knee': 26,
    'left_ankle': 27, 'right_ankle': 28,
    'left_heel': 29, 'right_heel': 30,
    'left_foot_index': 31, 'right_foot_index': 32,
}


class ShootingAnalyzer:
    """
    NBA 级篮球投篮动作分析器。

    基于 MediaPipe Pose 提取的 33 个人体关键点，计算投篮动作的核心
    生物力学指标，自动识别动作阶段并评估损伤风险。

    Attributes:
        shooter_hand: 投篮惯用手 ('right' 或 'left')。
        smooth_window: 滑动平均窗口大小（帧，奇数）。
        min_visibility: 关键点可见性阈值。
        fps: 视频帧率。

    Example:
        >>> analyzer = ShootingAnalyzer(shooter_hand='right', smooth_window=5)
        >>> keypoints = ShootingAnalyzer.extract_keypoints_from_video('shot.mp4')
        >>> df = analyzer.analyze_sequence(keypoints, fps=30)
        >>> summary = analyzer.get_summary(df)
        >>> print(summary['Risk_Assessment'])
        >>> analyzer.plot_kinetic_chain(df, keypoints)
    """

    LANDMARKS = MP_LANDMARKS

    # ── 阶段标签 ──
    PHASE_IDLE = '待机'
    PHASE_SQUAT = '屈膝下蹲'
    PHASE_LIFT = '起跳升力'
    PHASE_RELEASE = '顶肘压腕'
    PHASE_FOLLOW = '随挥跟进'

    # ═══════════════════════════════════════════════
    #  初始化
    # ═══════════════════════════════════════════════

    def __init__(
        self,
        shooter_hand: str = 'right',
        smooth_window: int = 5,
        min_visibility: float = 0.5,
        fps: float = 30.0,
        calibration_angles: Optional[Dict[str, float]] = None,
    ) -> None:
        """
        初始化投篮分析器。

        Args:
            shooter_hand: 投篮惯用手，``'right'`` 使用右侧关键点，
                ``'left'`` 使用左侧关键点。
            smooth_window: 滑动平均窗口（帧），自动强制为奇数。
                越大越平滑但延迟越高，推荐 3–7。
            min_visibility: MediaPipe visibility 置信度阈值 (0–1)，
                低于此值的关键点视为遮挡，用线性插值补全。
            fps: 视频帧率（帧/秒），用于速度与时间计算。
            calibration_angles: 可选的校准阈值字典，覆盖默认值。
                可用键: ``'elbow_over_extend'`` (默认 165.0)、
                ``'knee_insufficient'`` (默认 90.0)、
                ``'elbow_straight'`` (默认 175.0)。

        Raises:
            ValueError: ``shooter_hand`` 不合法或 ``smooth_window`` < 1。
        """
        if shooter_hand not in ('right', 'left'):
            raise ValueError(
                f"shooter_hand 必须为 'right' 或 'left'，got '{shooter_hand}'"
            )
        if smooth_window < 1:
            raise ValueError('smooth_window 必须 >= 1')

        self.shooter_hand = shooter_hand
        self.smooth_window = (
            smooth_window if smooth_window % 2 == 1 else smooth_window + 1
        )
        self.min_visibility = min_visibility
        self.fps = fps

        # 选择投篮侧关键点
        prefix = 'right' if shooter_hand == 'right' else 'left'
        opp = 'left' if prefix == 'right' else 'right'
        self._idx: Dict[str, int] = {
            'shoulder': MP_LANDMARKS[f'{prefix}_shoulder'],
            'elbow': MP_LANDMARKS[f'{prefix}_elbow'],
            'wrist': MP_LANDMARKS[f'{prefix}_wrist'],
            'hip': MP_LANDMARKS[f'{prefix}_hip'],
            'knee': MP_LANDMARKS[f'{prefix}_knee'],
            'ankle': MP_LANDMARKS[f'{prefix}_ankle'],
            'foot_index': MP_LANDMARKS[f'{prefix}_foot_index'],
            'shoulder_opp': MP_LANDMARKS[f'{opp}_shoulder'],
            'hip_opp': MP_LANDMARKS[f'{opp}_hip'],
            'left_hip': MP_LANDMARKS['left_hip'],
            'right_hip': MP_LANDMARKS['right_hip'],
        }

        # 校准阈值
        self._calibration: Dict[str, float] = {
            'elbow_over_extend': 165.0,   # 出手肘角 > 此值 → 过度伸直
            'knee_insufficient': 90.0,    # 屈膝深度 < 此值 → 发力不足
            'elbow_straight': 175.0,      # 完全伸直参考值
        }
        if calibration_angles:
            self._calibration.update(calibration_angles)

        # 缓存（供 plot 使用）
        self._last_coords: Optional[np.ndarray] = None
        self._last_release_frame: int = 0

    # ═══════════════════════════════════════════════
    #  角度计算（向量化 + atan2）
    # ═══════════════════════════════════════════════

    @staticmethod
    def _angle_atan2_batch(
        a: np.ndarray, b: np.ndarray, c: np.ndarray,
    ) -> np.ndarray:
        """
        向量化计算三点夹角（b 为顶点），使用 ``atan2`` 处理象限。

        在 x-y 平面投影上计算，结果范围 [0, 180] 度。
        ``atan2`` 相较 ``acos`` 的优势：当角度接近 0° 或 180° 时
        数值更稳定（``acos`` 在端点处导数趋于无穷）。

        Args:
            a: 起点坐标，shape (N, 2+)。
            b: 顶点坐标，shape (N, 2+)。
            c: 终点坐标，shape (N, 2+)。

        Returns:
            角度数组，shape (N,)，单位度，范围 [0, 180]。
        """
        ba = a[:, :2] - b[:, :2]
        bc = c[:, :2] - b[:, :2]

        ang_ba = np.arctan2(ba[:, 1], ba[:, 0])
        ang_bc = np.arctan2(bc[:, 1], bc[:, 0])

        diff = ang_bc - ang_ba
        deg = np.abs(np.degrees(diff))
        return np.where(deg > 180.0, 360.0 - deg, deg)

    # ═══════════════════════════════════════════════
    #  平滑与插值
    # ═══════════════════════════════════════════════

    def _smooth_1d(self, arr: np.ndarray) -> np.ndarray:
        """
        滑动平均平滑（镜像填充，输出与输入等长）。

        Args:
            arr: shape (N,) 一维信号（已插值，无 NaN）。

        Returns:
            平滑后数组，shape (N,)。
        """
        w = self.smooth_window
        if w <= 1 or len(arr) < w:
            return arr.copy()

        pad = w // 2
        padded = np.pad(arr, pad, mode='reflect')
        kernel = np.ones(w) / w
        return np.convolve(padded, kernel, mode='valid')

    def _interpolate_nans(self, arr: np.ndarray) -> np.ndarray:
        """
        线性插值补全 NaN（端点用最近值填充）。

        Args:
            arr: shape (N,) 一维数组。

        Returns:
            补全后数组。若全为 NaN 则原样返回。
        """
        arr = arr.astype(np.float64).copy()
        valid = ~np.isnan(arr)
        if valid.sum() == 0 or valid.sum() == len(arr):
            return arr

        arr[~valid] = np.interp(
            np.where(~valid)[0],
            np.where(valid)[0],
            arr[valid],
        )
        return arr

    def _smooth_column(self, arr: np.ndarray) -> np.ndarray:
        """先插值 NaN，再滑动平均。"""
        return self._smooth_1d(self._interpolate_nans(arr))

    # ═══════════════════════════════════════════════
    #  关键点预处理
    # ═══════════════════════════════════════════════

    def _preprocess_keypoints(
        self, keypoints: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        预处理：遮挡处理 → 插值 → 平滑。

        Args:
            keypoints: shape (N, 33, 4)，最后一维 (x, y, z, visibility)。

        Returns:
            (coords, mask):
                - coords: (N, 33, 3) 平滑后坐标
                - mask: (N, 33) 可见性布尔矩阵
        """
        kp = np.asarray(keypoints, dtype=np.float64)
        if kp.ndim != 3 or kp.shape[1:] != (33, 4):
            raise ValueError(
                f'keypoints shape 应为 (N, 33, 4)，got {kp.shape}'
            )

        visibility = kp[:, :, 3]
        mask = visibility >= self.min_visibility
        coords = kp[:, :, :3].copy()
        coords[~mask] = np.nan

        # 逐关键点逐分量：插值 + 平滑
        for j in range(33):
            for d in range(3):
                coords[:, j, d] = self._smooth_column(coords[:, j, d])

        return coords, mask

    # ═══════════════════════════════════════════════
    #  核心指标计算
    # ═══════════════════════════════════════════════

    def _compute_metrics(
        self, coords: np.ndarray,
    ) -> Dict[str, np.ndarray]:
        """
        向量化计算全部核心指标。

        Args:
            coords: (N, 33, 3) 预处理后坐标。

        Returns:
            指标字典，每个值 shape (N,)：
                - ``Elbow_Angle``: 肘部角度（肩-肘-腕，度）
                - ``Knee_Flexion``: 屈膝角度（髋-膝-踝，度，180=伸直）
                - ``Trunk_Rotation``: 肩髋内扣角度（水平面投影，度）
                - ``Release_Height``: 出手相对高度（腕-髋 Y 差 / 腿长）
        """
        idx = self._idx
        shoulder = coords[:, idx['shoulder'], :]
        elbow = coords[:, idx['elbow'], :]
        wrist = coords[:, idx['wrist'], :]
        hip = coords[:, idx['hip'], :]
        knee = coords[:, idx['knee'], :]
        ankle = coords[:, idx['ankle'], :]
        shoulder_opp = coords[:, idx['shoulder_opp'], :]
        hip_opp = coords[:, idx['hip_opp'], :]
        left_hip = coords[:, idx['left_hip'], :]
        right_hip = coords[:, idx['right_hip'], :]

        # ── 肘部角度（2D atan2） ──
        elbow_angle = self._angle_atan2_batch(shoulder, elbow, wrist)
        elbow_angle = self._smooth_column(elbow_angle)

        # ── 屈膝角度（2D atan2） ──
        knee_angle = self._angle_atan2_batch(hip, knee, ankle)
        knee_angle = self._smooth_column(knee_angle)

        # ── 肩髋内扣角度（水平面 x-z 投影，atan2） ──
        sh_vec = shoulder_opp[:, [0, 2]] - shoulder[:, [0, 2]]
        hip_vec = hip_opp[:, [0, 2]] - hip[:, [0, 2]]

        ang_sh = np.arctan2(sh_vec[:, 1], sh_vec[:, 0])
        ang_hp = np.arctan2(hip_vec[:, 1], hip_vec[:, 0])
        trunk_rot = np.abs(np.degrees(ang_sh - ang_hp))
        trunk_rot = np.where(trunk_rot > 180, 360 - trunk_rot, trunk_rot)
        trunk_rot = self._smooth_column(trunk_rot)

        # ── 出手高度（腕 Y 相对髋 Y，归一化） ──
        # MediaPipe Y 轴向下为正 → Y 越小 = 位置越高
        hip_mid = (left_hip + right_hip) / 2.0
        leg_len = np.linalg.norm(hip_mid[:, :2] - ankle[:, :2], axis=1) + 1e-9
        release_h = (hip_mid[:, 1] - wrist[:, 1]) / leg_len
        release_h = self._smooth_column(release_h)

        return {
            'Elbow_Angle': elbow_angle,
            'Knee_Flexion': knee_angle,
            'Trunk_Rotation': trunk_rot,
            'Release_Height': release_h,
        }

    # ═══════════════════════════════════════════════
    #  阶段检测
    # ═══════════════════════════════════════════════

    def _detect_phases(
        self,
        metrics: Dict[str, np.ndarray],
        coords: np.ndarray,
    ) -> Tuple[np.ndarray, int]:
        """
        自动识别投篮四阶段。

        算法:
            1. 膝角最小值帧 → 屈膝下蹲→起跳升力 分界
            2. 腕部最高点（Y 最小）帧 → 出手中心
            3. 出手前后 ~150ms 为顶肘压腕阶段
            4. 之后为随挥跟进

        Args:
            metrics: ``_compute_metrics`` 返回值。
            coords: (N, 33, 3) 坐标。

        Returns:
            (phases, release_frame):
                - phases: (N,) 字符串数组
                - release_frame: 出手帧索引
        """
        n = len(metrics['Knee_Flexion'])
        phases = np.full(n, self.PHASE_IDLE, dtype=object)

        knee = metrics['Knee_Flexion']
        wrist_y = coords[:, self._idx['wrist'], 1]
        wrist_y_s = self._smooth_column(wrist_y)

        # 最大屈膝帧（膝角最小 = 蹲最深）
        knee_min_idx = int(np.nanargmin(knee)) if not np.all(np.isnan(knee)) else 0

        # 腕部最高点（Y 最小）
        search_start = min(knee_min_idx + 1, n - 1)
        if search_start < n - 1:
            release_frame = search_start + int(
                np.nanargmin(wrist_y_s[search_start:])
            )
        else:
            release_frame = n - 1

        release_band = max(3, int(self.fps * 0.15))  # ~150ms

        for i in range(n):
            if i < knee_min_idx:
                phases[i] = self.PHASE_SQUAT
            elif i < release_frame - release_band:
                phases[i] = self.PHASE_LIFT
            elif i <= release_frame + release_band:
                phases[i] = self.PHASE_RELEASE
            else:
                phases[i] = self.PHASE_FOLLOW

        return phases, release_frame

    # ═══════════════════════════════════════════════
    #  主分析入口
    # ═══════════════════════════════════════════════

    def analyze_sequence(
        self,
        keypoints: np.ndarray,
        fps: Optional[float] = None,
    ) -> pd.DataFrame:
        """
        分析一段投篮关键点序列，返回逐帧指标 DataFrame。

        处理流程:
            1. 预处理（遮挡→插值→平滑）
            2. 向量化计算肘角、膝角、躯干旋转、出手高度
            3. 自动检测投篮四阶段
            4. 标记出手帧

        Args:
            keypoints: shape (N, 33, 4)，最后一维 (x, y, z, visibility)。
                坐标可为归一化 [0,1] 或像素值。
            fps: 可选帧率覆盖。

        Returns:
            DataFrame，每行一帧，列:
                ``Frame``, ``Time_s``, ``Elbow_Angle``, ``Knee_Flexion``,
                ``Trunk_Rotation``, ``Release_Height``, ``Phase``,
                ``Release_Frame``。

        Raises:
            ValueError: keypoints 形状不符合 (N, 33, 4)。
        """
        if fps is not None:
            self.fps = fps

        coords, _ = self._preprocess_keypoints(keypoints)
        n = coords.shape[0]
        metrics = self._compute_metrics(coords)
        phases, release_frame = self._detect_phases(metrics, coords)

        df = pd.DataFrame({
            'Frame': np.arange(n),
            'Time_s': np.arange(n) / self.fps,
            'Elbow_Angle': metrics['Elbow_Angle'],
            'Knee_Flexion': metrics['Knee_Flexion'],
            'Trunk_Rotation': metrics['Trunk_Rotation'],
            'Release_Height': metrics['Release_Height'],
            'Phase': phases,
        })
        df['Release_Frame'] = df['Frame'] == release_frame

        self._last_coords = coords
        self._last_release_frame = release_frame
        return df

    # ═══════════════════════════════════════════════
    #  汇总与风险评估
    # ═══════════════════════════════════════════════

    def get_summary(self, df: pd.DataFrame) -> Dict[str, object]:
        """
        生成汇总字典与风险评估。

        风险评估规则:
            - 出手时肘角 > 165° → ``"过度伸直（易受伤风险）"``
            - 屈膝深度 < 90° → ``"发力不足"``
              (屈膝深度 = 180° - 最小膝角；深度 < 90° 说明蹲得不够)
            - 均正常 → ``"动作风险较低"``

        Args:
            df: ``analyze_sequence`` 返回的 DataFrame。

        Returns:
            汇总字典:
                - ``Max_Knee_Flexion``: 最大膝角（最伸直时）
                - ``Min_Knee_Flexion``: 最小膝角（蹲最深时）
                - ``Elbow_Angle_At_Release``: 出手肘角
                - ``Max_Trunk_Rotation``: 最大躯干旋转
                - ``Release_Height``: 出手相对高度
                - ``Phase_Duration``: 各阶段帧数
                - ``Risk_Assessment``: 风险评估字符串
        """
        release_rows = df[df['Release_Frame']]
        if len(release_rows) == 0:
            release_phase = df[df['Phase'] == self.PHASE_RELEASE]
            idx = (
                release_phase['Elbow_Angle'].idxmax()
                if len(release_phase) > 0
                else df['Elbow_Angle'].idxmax()
            )
            elbow_at_release = df.loc[idx, 'Elbow_Angle']
        else:
            elbow_at_release = release_rows['Elbow_Angle'].values[0]

        min_knee = float(df['Knee_Flexion'].min())
        max_knee = float(df['Knee_Flexion'].max())
        max_rot = float(df['Trunk_Rotation'].max())
        rel_h = (
            float(release_rows['Release_Height'].values[0])
            if len(release_rows) > 0
            else float(df['Release_Height'].max())
        )

        # ── 风险评估 ──
        risks: List[str] = []
        cal = self._calibration

        # 肘部过度伸直
        if elbow_at_release > cal['elbow_over_extend']:
            risks.append('过度伸直（易受伤风险）')

        # 屈膝深度不足（蹲得不够深 → 发力不充分）
        # 屈膝深度 = 180° - 最小膝角；深度 < 阈值 → 发力不足
        knee_flexion_depth = 180.0 - min_knee
        if knee_flexion_depth < cal['knee_insufficient']:
            risks.append('发力不足')

        risk_str = '；'.join(risks) if risks else '动作风险较低'

        # 阶段持续帧数
        phase_duration: Dict[str, int] = {}
        for ph in [
            self.PHASE_SQUAT, self.PHASE_LIFT,
            self.PHASE_RELEASE, self.PHASE_FOLLOW, self.PHASE_IDLE,
        ]:
            count = int((df['Phase'] == ph).sum())
            if count > 0:
                phase_duration[ph] = count

        return {
            'Max_Knee_Flexion': round(max_knee, 1),
            'Min_Knee_Flexion': round(min_knee, 1),
            'Elbow_Angle_At_Release': round(float(elbow_at_release), 1),
            'Max_Trunk_Rotation': round(max_rot, 1),
            'Release_Height': round(rel_h, 3),
            'Phase_Duration': phase_duration,
            'Risk_Assessment': risk_str,
        }

    # ═══════════════════════════════════════════════
    #  发力链热力图
    # ═══════════════════════════════════════════════

    def plot_kinetic_chain(
        self,
        df: pd.DataFrame,
        keypoints: Optional[np.ndarray] = None,
        fps: Optional[float] = None,
        metric: str = 'velocity',
    ) -> Optional['Figure']:
        """
        绘制从脚底到指尖的"发力链"热力图。

        以时间为横轴、关节链（踝→膝→髋→肩→肘→腕）为纵轴，
        色彩深浅代表各关节的瞬时速度或角度变化率，
        直观展示力量从地面向上传导的时序与效率。

        Args:
            df: ``analyze_sequence`` 返回的 DataFrame。
            keypoints: 可选原始关键点。None 时使用上次分析的缓存。
            fps: 可选帧率覆盖。
            metric: 热力图指标，``'velocity'``（线速度）或
                ``'angular'``（角速度变化率）。

        Returns:
            matplotlib Figure 对象。未安装 matplotlib 时返回 None。
        """
        if not _HAS_MPL:
            warnings.warn('matplotlib 未安装，无法绘制热力图。')
            return None

        if fps is not None:
            self.fps = fps

        if keypoints is not None:
            coords, _ = self._preprocess_keypoints(keypoints)
        elif self._last_coords is not None:
            coords = self._last_coords
        else:
            warnings.warn('无可用坐标，请先 analyze_sequence 或传入 keypoints。')
            return None

        idx = self._idx
        dt = 1.0 / self.fps
        n_frames = coords.shape[0]

        # 关节链（足→指尖）
        chain: List[Tuple[str, int]] = [
            ('踝关节', idx['ankle']),
            ('膝关节', idx['knee']),
            ('髋关节', idx['hip']),
            ('肩关节', idx['shoulder']),
            ('肘关节', idx['elbow']),
            ('腕关节', idx['wrist']),
        ]
        n_joints = len(chain)

        # 构建热力图矩阵
        matrix = np.zeros((n_joints, n_frames))
        if metric == 'angular':
            # 角度变化率（基于肘角、膝角等）
            angle_cols = ['Elbow_Angle', 'Knee_Flexion',
                          'Trunk_Rotation', 'Release_Height']
            for j, col in enumerate(angle_cols):
                if col in df.columns:
                    vals = df[col].values
                    diff = np.abs(np.diff(vals, prepend=vals[:1]))
                    matrix[j] = diff
            # 补全踝、腕的线速度
            for j, (_, lm_idx) in enumerate(chain):
                if matrix[j].max() < 1e-9:
                    pos = coords[:, lm_idx, :2]
                    diff = np.diff(pos, axis=0, prepend=pos[:1])
                    matrix[j] = np.linalg.norm(diff, axis=1) / dt
        else:
            # 线速度
            for j, (_, lm_idx) in enumerate(chain):
                pos = coords[:, lm_idx, :2]
                diff = np.diff(pos, axis=0, prepend=pos[:1])
                matrix[j] = np.linalg.norm(diff, axis=1) / dt

        # 归一化
        vmax = matrix.max()
        if vmax > 0:
            matrix_norm = matrix / vmax
        else:
            matrix_norm = matrix

        # ── 绘图 ──
        fig, (ax_main, ax_phase) = plt.subplots(
            2, 1, figsize=(14, 7),
            gridspec_kw={'height_ratios': [5, 1]},
            sharex=True,
        )

        im = ax_main.imshow(
            matrix_norm, aspect='auto', cmap='YlOrRd',
            interpolation='bilinear', origin='upper',
            extent=[0, n_frames / self.fps, -0.5, n_joints - 0.5],
        )
        ax_main.set_yticks(range(n_joints))
        ax_main.set_yticklabels([name for name, _ in chain])
        ax_main.set_ylabel('发力链（足 → 指尖）', fontsize=12)
        ax_main.set_title(
            f'投篮发力链热力图（{"线速度" if metric == "velocity" else "角变化率"}）',
            fontsize=14, fontweight='bold',
        )

        # 标注出手帧
        rf = self._last_release_frame
        if 0 < rf < n_frames:
            ax_main.axvline(
                rf / self.fps, color='cyan', linewidth=2,
                linestyle='--', alpha=0.8,
            )
            ax_main.text(
                rf / self.fps + 0.02, -0.3, '出手',
                color='cyan', fontsize=10, fontweight='bold',
            )

        cbar = fig.colorbar(im, ax=ax_main, shrink=0.8, pad=0.02)
        cbar.set_label('归一化强度', fontsize=10)

        # ── 阶段色带 ──
        phase_colors = {
            self.PHASE_IDLE: '#E0E0E0',
            self.PHASE_SQUAT: '#64B5F6',
            self.PHASE_LIFT: '#FFB74D',
            self.PHASE_RELEASE: '#E57373',
            self.PHASE_FOLLOW: '#81C784',
        }
        for i in range(len(df)):
            ph = df.iloc[i]['Phase']
            ax_phase.barh(
                0, 1.0 / self.fps, left=i / self.fps,
                height=1.0, color=phase_colors.get(ph, '#E0E0E0'),
                edgecolor='none',
            )
        ax_phase.set_xlim(0, n_frames / self.fps)
        ax_phase.set_ylim(-0.5, 0.5)
        ax_phase.set_yticks([])
        ax_phase.set_xlabel('时间（秒）', fontsize=12)

        legend_elements = [
            Patch(facecolor=phase_colors[self.PHASE_SQUAT], label=self.PHASE_SQUAT),
            Patch(facecolor=phase_colors[self.PHASE_LIFT], label=self.PHASE_LIFT),
            Patch(facecolor=phase_colors[self.PHASE_RELEASE], label=self.PHASE_RELEASE),
            Patch(facecolor=phase_colors[self.PHASE_FOLLOW], label=self.PHASE_FOLLOW),
        ]
        ax_phase.legend(
            handles=legend_elements, loc='upper right',
            ncol=4, fontsize=9,
        )

        plt.tight_layout()
        return fig

    # ═══════════════════════════════════════════════
    #  校准
    # ═══════════════════════════════════════════════

    def calibrate(self, **kwargs: float) -> None:
        """
        重置校准阈值。

        可用参数:
            - ``elbow_over_extend``: 出手肘角过度伸直阈值（默认 165°）
            - ``knee_insufficient``: 最小屈膝深度阈值（默认 90°）
            - ``elbow_straight``: 完全伸直参考值（默认 175°）

        Args:
            **kwargs: 参数名=新值。

        Example:
            >>> analyzer.calibrate(elbow_over_extend=160.0)
        """
        for k, v in kwargs.items():
            if k in self._calibration:
                self._calibration[k] = float(v)
            else:
                warnings.warn(
                    f"未知校准参数 '{k}'。可用: {list(self._calibration.keys())}"
                )

    # ═══════════════════════════════════════════════
    #  视频关键点提取（需 mediapipe + opencv）
    # ═══════════════════════════════════════════════

    # 默认模型路径（优先使用前端项目已有的模型文件）
    _DEFAULT_MODEL_PATHS: List[str] = [
        # 前端项目 public 目录（与本文件同级的 frontend/ 下）
        os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     'frontend', 'public', 'models', 'pose_landmarker_lite.task'),
        # 同目录
        os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     'pose_landmarker_lite.task'),
        # 用户下载目录
        os.path.expanduser('~/Downloads/pose_landmarker_lite.task'),
    ]

    @staticmethod
    def _find_model_path(model_path: Optional[str] = None) -> str:
        """查找可用的 PoseLandmarker 模型文件。"""
        candidates: List[str] = []
        if model_path:
            candidates.append(model_path)
        candidates.extend(ShootingAnalyzer._DEFAULT_MODEL_PATHS)
        for p in candidates:
            if os.path.exists(p):
                return p
        raise FileNotFoundError(
            '未找到 PoseLandmarker 模型文件 (.task)。请下载 pose_landmarker_lite.task '
            '并指定 model_path 参数，或放到以下任一路径:\n' +
            '\n'.join(f'  - {p}' for p in ShootingAnalyzer._DEFAULT_MODEL_PATHS)
        )

    @staticmethod
    def extract_keypoints_from_video(
        video_path: str,
        model_complexity: int = 1,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
        model_path: Optional[str] = None,
    ) -> np.ndarray:
        """
        从视频文件提取 MediaPipe Pose 33 关键点。

        兼容新版 Tasks API（mediapipe 0.10.30+，Python 3.13/3.14）
        和旧版 Solutions API（mediapipe < 0.10.30，Python 3.11-）。

        Args:
            video_path: 视频文件路径。
            model_complexity: 模型复杂度 (0: lite, 1: full, 2: heavy)。
                仅旧版 API 使用；新版自动选择 lite/full/heavy 模型文件。
            min_detection_confidence: 最小检测置信度。
            min_tracking_confidence: 最小跟踪置信度。
            model_path: PoseLandmarker 模型文件路径 (.task)。
                None 时自动搜索默认位置。

        Returns:
            shape (N, 33, 4) 数组，最后一维 (x, y, z, visibility)。
            未检测到人体的帧全零。

        Raises:
            ImportError: mediapipe / opencv 未安装。
            FileNotFoundError: 视频文件或模型文件不存在。
        """
        try:
            import cv2
            import mediapipe as mp
        except ImportError as e:
            raise ImportError(
                '需要 mediapipe 和 opencv-python。'
                '请运行: pip install mediapipe opencv-python'
            ) from e

        if not os.path.exists(video_path):
            raise FileNotFoundError(f'视频文件不存在: {video_path}')

        # ── 检测使用旧版 Solutions API 还是新版 Tasks API ──
        use_legacy = hasattr(mp, 'solutions') and hasattr(mp.solutions, 'pose')

        if use_legacy:
            # 旧版 API (Python 3.11- / mediapipe < 0.10.30)
            all_kps: List[np.ndarray] = []
            with mp.solutions.pose.Pose(
                model_complexity=model_complexity,
                min_detection_confidence=min_detection_confidence,
                min_tracking_confidence=min_tracking_confidence,
            ) as pose:
                cap = cv2.VideoCapture(video_path)
                while cap.isOpened():
                    ret, frame = cap.read()
                    if not ret:
                        break
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = pose.process(frame_rgb)
                    if results.pose_landmarks:
                        kps = np.array([
                            [lm.x, lm.y, lm.z, lm.visibility]
                            for lm in results.pose_landmarks.landmark
                        ], dtype=np.float32)
                    else:
                        kps = np.zeros((33, 4), dtype=np.float32)
                    all_kps.append(kps)
                cap.release()
            return np.array(all_kps)

        else:
            # 新版 Tasks API (Python 3.12+ / mediapipe 0.10.30+)
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision as mp_vision

            model_file = ShootingAnalyzer._find_model_path(model_path)

            base_options = mp_python.BaseOptions(model_asset_path=model_file)
            options = mp_vision.PoseLandmarkerOptions(
                base_options=base_options,
                running_mode=mp_vision.RunningMode.VIDEO,
                min_pose_detection_confidence=min_detection_confidence,
                min_pose_presence_confidence=min_tracking_confidence,
                min_tracking_confidence=min_tracking_confidence,
            )

            all_kps = []
            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            frame_idx = 0

            with mp_vision.PoseLandmarker.create_from_options(options) as landmarker:
                while cap.isOpened():
                    ret, frame = cap.read()
                    if not ret:
                        break
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    mp_image = mp.Image(
                        image_format=mp.ImageFormat.SRGB,
                        data=frame_rgb,
                    )
                    timestamp_ms = int(frame_idx * 1000.0 / fps)
                    result = landmarker.detect_for_video(mp_image, timestamp_ms)

                    if result.pose_landmarks and len(result.pose_landmarks) > 0:
                        kps = np.array([
                            [lm.x, lm.y, lm.z, lm.visibility]
                            for lm in result.pose_landmarks[0]
                        ], dtype=np.float32)
                    else:
                        kps = np.zeros((33, 4), dtype=np.float32)
                    all_kps.append(kps)
                    frame_idx += 1
                cap.release()

            return np.array(all_kps)

    # ═══════════════════════════════════════════════
    #  repr
    # ═══════════════════════════════════════════════

    def __repr__(self) -> str:
        return (
            f'ShootingAnalyzer('
            f'hand={self.shooter_hand!r}, '
            f'window={self.smooth_window}, '
            f'fps={self.fps}, '
            f'vis_thresh={self.min_visibility})'
        )


# ═══════════════════════════════════════════════════
#  生成合成测试数据并运行完整演示
# ═══════════════════════════════════════════════════

def _generate_demo_keypoints(n_frames: int = 90, fps: float = 30.0) -> np.ndarray:
    """
    生成一段模拟右手投篮的合成关键点数据（3 秒 / 90 帧）。

    模拟四阶段:
        0–25 帧: 屈膝下蹲（膝盖弯曲加深）
        25–50 帧: 起跳升力（膝盖伸展 + 身体上移）
        50–65 帧: 顶肘压腕（肘部伸展 + 腕部到最高点）
        65–90 帧: 随挥跟进（手臂下降）

    Args:
        n_frames: 总帧数。
        fps: 帧率。

    Returns:
        shape (n_frames, 33, 4) 的关键点数组。
    """
    kps = np.zeros((n_frames, 33, 4), dtype=np.float64)

    t = np.linspace(0, 1, n_frames)

    # 基础站位（归一化坐标）
    base = {
        'nose': [0.50, 0.30, 0.00],
        'right_shoulder': [0.52, 0.38, -0.02],
        'left_shoulder': [0.48, 0.38, 0.02],
        'right_elbow': [0.54, 0.48, -0.03],
        'left_elbow': [0.46, 0.48, 0.03],
        'right_wrist': [0.56, 0.58, -0.04],
        'left_wrist': [0.44, 0.58, 0.04],
        'right_hip': [0.53, 0.55, -0.02],
        'left_hip': [0.47, 0.55, 0.02],
        'right_knee': [0.54, 0.72, -0.03],
        'left_knee': [0.46, 0.72, 0.03],
        'right_ankle': [0.54, 0.88, -0.04],
        'left_ankle': [0.46, 0.88, 0.04],
    }

    for name, (x, y, z) in base.items():
        kps[:, MP_LANDMARKS[name], 0] = x
        kps[:, MP_LANDMARKS[name], 1] = y
        kps[:, MP_LANDMARKS[name], 2] = z
        kps[:, MP_LANDMARKS[name], 3] = 0.95  # visibility

    # ── 动画调制 ──
    # 屈膝下蹲 (0–25): 膝盖前移+下蹲，髋下沉
    squat = np.clip(t * 4, 0, 1) * (t < 0.28)
    # 起跳升力 (25–50): 膝盖伸展，身体上移
    lift = np.clip((t - 0.28) * 4, 0, 1) * (t >= 0.28) * (t < 0.56)
    lift_total = np.clip((t - 0.28) * 3.5, 0, 1) * (t >= 0.28)
    # 顶肘压腕 (50–65): 肘伸展，腕上举
    release = np.clip((t - 0.56) * 7, 0, 1) * (t >= 0.56) * (t < 0.72)
    # 随挥 (65–90): 手臂下降
    follow = np.clip((t - 0.72) * 3.5, 0, 1) * (t >= 0.72)

    # 膝盖：下蹲时前移下移，起跳时回位上移
    knee_y_offset = 0.04 * squat - 0.06 * lift_total
    knee_x_offset = 0.02 * squat
    kps[:, MP_LANDMARKS['right_knee'], 1] += knee_y_offset
    kps[:, MP_LANDMARKS['right_knee'], 0] += knee_x_offset
    kps[:, MP_LANDMARKS['left_knee'], 1] += knee_y_offset
    kps[:, MP_LANDMARKS['left_knee'], 0] -= knee_x_offset

    # 髋部：下蹲时下沉，起跳时上移
    hip_y_offset = 0.03 * squat - 0.05 * lift_total
    for hip_name in ['right_hip', 'left_hip']:
        kps[:, MP_LANDMARKS[hip_name], 1] += hip_y_offset

    # 肘部：出手时向后上方移动（伸展）
    elbow_y_offset = -0.08 * release + 0.04 * follow
    elbow_x_offset = -0.02 * release
    kps[:, MP_LANDMARKS['right_elbow'], 1] += elbow_y_offset
    kps[:, MP_LANDMARKS['right_elbow'], 0] += elbow_x_offset

    # 腕部：出手时上举到最高点，随后下降
    wrist_y = -0.15 * release + 0.08 * follow - 0.03 * lift_total
    kps[:, MP_LANDMARKS['right_wrist'], 1] += wrist_y
    kps[:, MP_LANDMARKS['right_wrist'], 0] -= 0.01 * release

    # 肩部：起跳时略上移
    shoulder_y = -0.02 * lift_total
    for sh in ['right_shoulder', 'left_shoulder']:
        kps[:, MP_LANDMARKS[sh], 1] += shoulder_y

    # 肩髋内扣：出手前身体微拧
    trunk_rot = 0.015 * np.sin(np.pi * release)
    kps[:, MP_LANDMARKS['right_shoulder'], 0] -= trunk_rot * 0.5
    kps[:, MP_LANDMARKS['left_shoulder'], 0] += trunk_rot * 0.5

    # 添加微小噪声
    rng = np.random.default_rng(42)
    kps[:, :, :3] += rng.normal(0, 0.002, kps[:, :, :3].shape)

    # 随机遮挡几帧的左手腕（测试插值）
    kps[15:18, MP_LANDMARKS['left_wrist'], 3] = 0.1
    kps[15:18, MP_LANDMARKS['left_wrist'], :3] = np.nan

    return kps


# ═══════════════════════════════════════════════════
#  主入口：运行演示
# ═══════════════════════════════════════════════════

if __name__ == '__main__':
    print('=' * 60)
    print('  篮球投篮动作分析系统 — ShootingAnalyzer 演示')
    print('=' * 60)

    # 1. 生成合成投篮数据
    print('\n[1] 生成合成投篮关键点数据（90帧 / 3秒 / 30fps）...')
    kps = _generate_demo_keypoints(n_frames=90, fps=30.0)
    print(f'    关键点 shape: {kps.shape}')

    # 2. 初始化分析器
    print('\n[2] 初始化 ShootingAnalyzer（右手投篮, 平滑窗口=5）...')
    analyzer = ShootingAnalyzer(
        shooter_hand='right',
        smooth_window=5,
        min_visibility=0.5,
        fps=30.0,
    )
    print(f'    {analyzer}')

    # 3. 分析序列
    print('\n[3] 运行 analyze_sequence...')
    df = analyzer.analyze_sequence(kps)

    # 打印各阶段采样
    print('\n    各阶段采样帧:')
    for phase in [analyzer.PHASE_SQUAT, analyzer.PHASE_LIFT,
                   analyzer.PHASE_RELEASE, analyzer.PHASE_FOLLOW]:
        phase_df = df[df['Phase'] == phase]
        if len(phase_df) > 0:
            mid = len(phase_df) // 2
            r = phase_df.iloc[mid]
            print(f'      {phase:8s} | 帧{int(r.Frame):2d} | '
                  f'肘角 {r.Elbow_Angle:5.1f}° | '
                  f'膝角 {r.Knee_Flexion:5.1f}° | '
                  f'旋转 {r.Trunk_Rotation:5.1f}° | '
                  f'高度 {r.Release_Height:+.3f}')

    # 4. 汇总
    print('\n[4] 生成汇总与风险评估:')
    summary = analyzer.get_summary(df)
    for k, v in summary.items():
        if k == 'Phase_Duration':
            print(f'    {k}:')
            for ph, cnt in v.items():
                print(f'      {ph}: {cnt} 帧 ({cnt/30:.2f}s)')
        else:
            print(f'    {k}: {v}')

    # 5. 发力链热力图
    print('\n[5] 绘制发力链热力图...')
    fig = analyzer.plot_kinetic_chain(df, kps)
    if fig is not None:
        out_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            'kinetic_chain_heatmap.png',
        )
        fig.savefig(out_path, dpi=150, bbox_inches='tight')
        print(f'    热力图已保存: {out_path}')
        plt.close(fig)
    else:
        print('    matplotlib 未安装，跳过绘图')

    # 6. 异常检测演示
    print('\n[6] 异常检测演示:')
    print(f'    出手肘角: {summary["Elbow_Angle_At_Release"]}° '
          f'(阈值 {analyzer._calibration["elbow_over_extend"]}°)')
    print(f'    屈膝深度: {180 - summary["Min_Knee_Flexion"]:.1f}° '
          f'(阈值 {analyzer._calibration["knee_insufficient"]}°)')
    print(f'    → {summary["Risk_Assessment"]}')

    # 7. 校准演示
    print('\n[7] 校准演示（将肘部过度伸直阈值调至 155°）:')
    analyzer.calibrate(elbow_over_extend=155.0)
    summary2 = analyzer.get_summary(df)
    print(f'    重新评估: {summary2["Risk_Assessment"]}')

    print('\n' + '=' * 60)
    print('  演示完成')
    print('=' * 60)
