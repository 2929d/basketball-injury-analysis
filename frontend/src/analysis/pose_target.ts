/**
 * 多目标姿态跟踪 + "运动员目标"判别
 *
 * 问题背景:
 *   PoseLandmarker 默认只返回置信度最高的一具姿态(numPoses=1)。球场视频里除了
 *   运动员, 常有更大的"人形干扰目标" —— 墙上海报/广告牌/大屏画面/观众。实测
 *   干扰目标置信度更高, 于是骨骼叠加画到了墙上海报的人物身上, 报告里的生物力学
 *   指标也全部算的是海报, 全是错值。
 *
 * 判别依据 —— 运动能量:
 *   · 海报/大屏里的画面在整段视频里几乎静止, 运动能量 ≈ 0
 *   · 场上运动员的关节持续移动, 运动能量显著大于 0
 *   配合时序跟踪(track)把同一目标跨帧串起来, 锁定后只跟随锁定目标, 骨骼不会在
 *   多个目标之间跳来跳去。
 *
 * 三层判定(按可靠性从高到低):
 *   1) 全局回溯(分析阶段): 整段视频跑完后, 取"运动能量最高且持续存在"的 track
 *   2) 增量锁定(回放阶段): 命中若干帧后按运动能量锁定, 并沿锁定位置持续跟随
 *   3) 手动锁定(兜底): 用户在报告页点选画面中的运动员, 直接以该点为准
 */

export interface Landmark {
  x: number
  y: number
  z: number
  visibility: number
}

/** 一帧里的一个候选姿态(含包围盒, 坐标均为归一化值) */
export interface PoseCandidate {
  landmarks: Landmark[]
  /** 包围盒中心 */
  cx: number
  cy: number
  /** 包围盒高度(归一化), 用作尺度归一化基准 */
  h: number
  /** 可见关键点数量 */
  visible: number
}

export interface TargetLock {
  /** 锁定的 track id(增量跟踪时有效; 手动锁定时为 null) */
  id: number | null
  cx: number
  cy: number
  h: number
}

export interface TargetResolution {
  /** 选定目标的 33 个关键点(无可用目标时为 null) */
  landmarks: Landmark[] | null
  /** 选定目标在本帧的序号(未匹配到任何 track 时为 -1) */
  trackId: number
  /** 该目标对应的候选姿态下标(未匹配时为 -1) */
  candidateIndex: number
  box: { cx: number; cy: number; h: number } | null
  /** 是否已处于"锁定"状态(运动能量判别或手动指定) */
  locked: boolean
  /** 本帧候选姿态数量(用于诊断) */
  candidateCount: number
  /** 与候选姿态一一对应的 track id(供整段回溯时重建目标序列) */
  trackIds: number[]
}

interface Track {
  id: number
  cx: number
  cy: number
  h: number
  /** 累计归一化位移(每帧位移 ÷ 目标身高), 与目标在画面中的大小无关 */
  motion: number
  hits: number
  lastSeq: number
  landmarks: Landmark[]
  visible: number
  /** 该 track 在各帧的包围盒中心, 供全局回溯插值用 */
  history: Map<number, { cx: number; cy: number; h: number }>
}

/** 关键点视为"可见"的最低置信度 */
const MIN_VIS = 0.3
/** 构成有效姿态所需的最少可见关键点 */
const MIN_VISIBLE_KP = 6
/** 参与目标评选所需的最少命中帧数 */
const MIN_HITS = 5
/** 连续丢失多少帧后销毁 track */
const MAX_MISS = 15
/** 候选与 track 的关联门限(除以目标身高归一化) */
const MATCH_GATE = 0.7
/** 跟随锁定目标时允许的偏移门限(除以锁定目标身高归一化) */
const LOCK_GATE = 1.1
/** 静止目标判定的运动能量下限(每帧平均位移/身高) */
const MOTION_FLOOR = 0.012
/** 运动能量领先第二名多少倍才判定为运动员 */
const MOTION_RATIO = 1.35
/** 锁定目标连续多少帧找不到对应候选后放弃锁定 */
const LOCK_LOST_LIMIT = 24

/** 从 MediaPipe 的多姿态输出构造候选列表(过滤掉关键点过少的噪声姿态) */
export function toCandidates(poseList: Landmark[][] | null | undefined): PoseCandidate[] {
  const out: PoseCandidate[] = []
  if (!poseList) return out
  for (const lms of poseList) {
    if (!lms || !lms.length) continue
    let x0 = 2
    let y0 = 2
    let x1 = -1
    let y1 = -1
    let cnt = 0
    for (const lm of lms) {
      if (!lm || (lm.visibility ?? 1) < MIN_VIS) continue
      if (lm.x < x0) x0 = lm.x
      if (lm.x > x1) x1 = lm.x
      if (lm.y < y0) y0 = lm.y
      if (lm.y > y1) y1 = lm.y
      cnt += 1
    }
    if (cnt < MIN_VISIBLE_KP) continue
    out.push({
      landmarks: lms,
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      h: Math.max(y1 - y0, 0.04),
      visible: cnt,
    })
  }
  return out
}

/** 由关键点字典(存储帧格式)构造单个候选, 用于回放时播种目标位置 */
export function candidateFromKeypoints(
  kps: Record<string, { x: number; y: number; visibility: number }> | undefined,
): PoseCandidate | null {
  if (!kps) return null
  const arr: Landmark[] = []
  for (const p of Object.values(kps)) {
    if (!p) continue
    arr.push({ x: p.x, y: p.y, z: 0, visibility: p.visibility ?? 1 })
  }
  if (arr.length < MIN_VISIBLE_KP) return null
  return toCandidates([arr])[0] || null
}

export class PoseTargetTracker {
  private tracks = new Map<number, Track>()
  private nextId = 1
  private seq = 0
  private lock: (TargetLock & { miss: number }) | null = null

  /** 清空时序跟踪(切换视频/进入报告页时调用); keepLock=true 时保留锁定位置 */
  resetTracks(keepLock = true): void {
    this.tracks.clear()
    this.nextId = 1
    this.seq = 0
    if (!keepLock) {
      this.lock = null
    } else if (this.lock) {
      this.lock.id = null
      this.lock.miss = 0
    }
  }

  /** 手动锁定到归一化坐标(用户在报告页点选运动员) */
  lockAt(cx: number, cy: number, h?: number): void {
    this.lock = { id: null, cx, cy, h: h ?? this.lock?.h ?? 0.3, miss: 0 }
  }

  /** 用一帧关键点播种锁定位置(报告页刷新后无锁定状态时的回退) */
  seed(landmarks: Landmark[]): void {
    const c = toCandidates([landmarks])[0]
    if (c) this.lockAt(c.cx, c.cy, c.h)
  }

  /** 锁定到指定 track(分析阶段全局回溯选出的运动员) */
  lockToTrack(id: number): boolean {
    const t = this.tracks.get(id)
    if (!t) return false
    this.lock = { id, cx: t.cx, cy: t.cy, h: t.h, miss: 0 }
    return true
  }

  getLock(): TargetLock | null {
    return this.lock ? { id: this.lock.id, cx: this.lock.cx, cy: this.lock.cy, h: this.lock.h } : null
  }

  /** 全局回溯: 整段视频里"运动能量最高且持续存在"的 track —— 即运动员 */
  bestMotionTrackId(): { id: number; rate: number; moved: boolean } | null {
    const alive = [...this.tracks.values()].filter((t) => t.hits >= MIN_HITS)
    if (!alive.length) return null
    const ranked = alive
      .map((t) => ({ t, rate: t.motion / Math.max(1, t.hits - 1) }))
      .sort((a, b) => b.rate - a.rate)
    const top = ranked[0]
    const second = ranked[1]
    const moved = top.rate >= MOTION_FLOOR && (!second || top.rate >= second.rate * MOTION_RATIO)
    if (moved) return { id: top.t.id, rate: top.rate, moved: true }
    // 全场几乎静止(固定机位 + 静态干扰目标): 退回画面中最大的目标
    const big = alive.reduce((a, b) => (b.h > a.h ? b : a))
    return { id: big.id, rate: big.motion / Math.max(1, big.hits - 1), moved: false }
  }

  /** 取某 track 在指定帧的包围盒中心(缺失帧用相邻帧线性插值) */
  trackCenterAt(id: number, frameIdx: number): { cx: number; cy: number } | null {
    const t = this.tracks.get(id)
    if (!t) return null
    const exact = t.history.get(frameIdx)
    if (exact) return { cx: exact.cx, cy: exact.cy }
    let before: [number, { cx: number; cy: number }] | null = null
    let after: [number, { cx: number; cy: number }] | null = null
    for (const [k, v] of t.history) {
      if (k < frameIdx && (!before || k > before[0])) before = [k, v]
      if (k > frameIdx && (!after || k < after[0])) after = [k, v]
    }
    if (before && after) {
      const a = (frameIdx - before[0]) / (after[0] - before[0])
      return { cx: before[1].cx + (after[1].cx - before[1].cx) * a, cy: before[1].cy + (after[1].cy - before[1].cy) * a }
    }
    if (before) return { cx: before[1].cx, cy: before[1].cy }
    if (after) return { cx: after[1].cx, cy: after[1].cy }
    return null
  }

  /**
   * 输入一帧的全部候选姿态, 返回选定目标。
   * @param frameIdx 帧序号(不传则内部自增); 分析阶段传采样帧下标, 回放阶段可省略
   * @param opts.autoLock 是否允许按运动能量自动锁定(分析阶段传 false, 由全局回溯决定)
   */
  update(
    cands: PoseCandidate[],
    frameIdx?: number,
    opts: { autoLock?: boolean } = {},
  ): TargetResolution {
    const seq = frameIdx ?? this.seq++
    const autoLock = opts.autoLock !== false

    // ---------- 1. 候选 → track 关联(贪心最近邻, 距离以目标身高归一化) ----------
    const pairs: Array<{ tid: number; ci: number; d: number }> = []
    for (let ci = 0; ci < cands.length; ci++) {
      for (const t of this.tracks.values()) {
        if (seq - t.lastSeq > MAX_MISS) continue
        const ref = Math.max(t.h, 0.05)
        const d = Math.hypot(cands[ci].cx - t.cx, cands[ci].cy - t.cy) / ref
        if (d <= MATCH_GATE) pairs.push({ tid: t.id, ci, d })
      }
    }
    pairs.sort((a, b) => a.d - b.d)
    const matchedTrack = new Map<number, number>() // tid -> candidate index
    const takenCand = new Set<number>()
    for (const p of pairs) {
      if (matchedTrack.has(p.tid) || takenCand.has(p.ci)) continue
      matchedTrack.set(p.tid, p.ci)
      takenCand.add(p.ci)
    }

    // ---------- 2. 更新已有 track / 为未匹配候选新建 track ----------
    // candTrackId: 每个候选归属的 track id(新建的 track 也在此登记)
    const candTrackId: number[] = cands.map(() => -1)
    for (const [tid, ci] of matchedTrack) {
      const t = this.tracks.get(tid)
      if (!t) continue
      candTrackId[ci] = tid
      const c = cands[ci]
      const ref = Math.max(t.h, 0.05)
      t.motion += Math.hypot(c.cx - t.cx, c.cy - t.cy) / ref
      t.hits += 1
      t.cx = c.cx
      t.cy = c.cy
      t.h = c.h
      t.lastSeq = seq
      t.landmarks = c.landmarks
      t.visible = c.visible
      t.history.set(seq, { cx: c.cx, cy: c.cy, h: c.h })
    }
    for (let ci = 0; ci < cands.length; ci++) {
      if (takenCand.has(ci)) continue
      const c = cands[ci]
      const id = this.nextId++
      candTrackId[ci] = id
      this.tracks.set(id, {
        id,
        cx: c.cx,
        cy: c.cy,
        h: c.h,
        motion: 0,
        hits: 1,
        lastSeq: seq,
        landmarks: c.landmarks,
        visible: c.visible,
        history: new Map([[seq, { cx: c.cx, cy: c.cy, h: c.h }]]),
      })
    }
    // 清理长期丢失的 track
    for (const [id, t] of this.tracks) {
      if (seq - t.lastSeq > MAX_MISS) {
        this.tracks.delete(id)
        if (this.lock?.id === id) this.lock.id = null
      }
    }

    // ---------- 3. 目标判定 ----------
    const alive = [...this.tracks.values()]
    let chosen: Track | null = null
    let locked = false

    // 3a. 已有硬锁定 → 优先沿用同一 track
    if (this.lock?.id != null) {
      const t = this.tracks.get(this.lock.id)
      if (t && t.lastSeq === seq) {
        chosen = t
        locked = true
      }
    }
    // 3b. 锁定位置有效 → 取离锁定位置最近的 track(手动锁定 & 跨会话沿用的路径)
    if (!chosen && this.lock) {
      let best: { t: Track; d: number } | null = null
      const ref = Math.max(this.lock.h, 0.05)
      for (const t of alive) {
        const d = Math.hypot(t.cx - this.lock.cx, t.cy - this.lock.cy) / ref
        if (d <= LOCK_GATE && (!best || d < best.d)) best = { t, d }
      }
      if (best) {
        chosen = best.t
        locked = true
        this.lock.id = best.t.id
      } else {
        this.lock.miss += 1
        if (this.lock.miss > LOCK_LOST_LIMIT) this.lock = null
      }
    }
    // 3c. 尚未锁定 → 按运动能量判定运动员(静态干扰目标运动能量 ≈ 0)
    if (!chosen && !this.lock && autoLock) {
      const scored = alive
        .filter((t) => t.hits >= MIN_HITS)
        .map((t) => ({ t, rate: t.motion / Math.max(1, t.hits - 1) }))
        .sort((a, b) => b.rate - a.rate)
      if (scored.length) {
        const top = scored[0]
        const second = scored[1]
        const clear = top.rate >= MOTION_FLOOR && (!second || top.rate >= second.rate * MOTION_RATIO)
        if (clear) {
          chosen = top.t
          locked = true
          this.lock = { id: top.t.id, cx: top.t.cx, cy: top.t.cy, h: top.t.h, miss: 0 }
        } else {
          // 运动特征尚不明显: 暂用画面中最大的目标兜底, 但不标记为已锁定
          chosen = alive.reduce((a, b) => (b.h > a.h ? b : a))
        }
      }
    }
    // 3d. 分析阶段(autoLock=false): 目标由整段回溯决定, 此处返回"当前累计运动能量
    //     最高的 track"作为临时目标(随帧推进逐步收敛, 预览不空白); 命中帧不足时
    //     先用画面中最大的目标兜底
    if (!chosen && !autoLock) {
      const best = this.bestMotionTrackId()
      const t = best ? this.tracks.get(best.id) : null
      if (t && t.lastSeq === seq) {
        chosen = t
      } else if (alive.length) {
        const fallback = alive.reduce((a, b) => (b.h > a.h ? b : a))
        if (fallback.lastSeq === seq) chosen = fallback
      }
    }

    // 锁定位置跟随目标(轻微平滑, 避免抖动导致下一帧丢锁)
    if (chosen && this.lock) {
      this.lock.cx = this.lock.cx * 0.4 + chosen.cx * 0.6
      this.lock.cy = this.lock.cy * 0.4 + chosen.cy * 0.6
      this.lock.h = this.lock.h * 0.4 + chosen.h * 0.6
      this.lock.miss = 0
    }

    // 每帧的候选 → track 对应关系(回溯重建目标序列用)
    const trackIds = candTrackId

    if (!chosen) {
      return {
        landmarks: null,
        trackId: -1,
        candidateIndex: -1,
        box: null,
        locked: false,
        candidateCount: cands.length,
        trackIds,
      }
    }
    const ci = matchedTrack.get(chosen.id)
    return {
      landmarks: chosen.landmarks,
      trackId: chosen.id,
      candidateIndex: ci === undefined ? -1 : ci,
      box: { cx: chosen.cx, cy: chosen.cy, h: chosen.h },
      locked,
      candidateCount: cands.length,
      trackIds,
    }
  }
}

/** 全局单例: 分析阶段与报告页回放共用同一套跟踪状态(锁定状态可跨页面沿用) */
export const poseTargetTracker = new PoseTargetTracker()
