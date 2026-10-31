/**
 * 数学工具：Savitzky-Golay 滤波、移动平均、梯度等
 * 与后端 scipy.signal.savgol_filter / numpy 行为对齐（mode='interp' 用镜像填充近似）
 */

/** 数值裁剪 */
export function clip(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/** 线性映射 */
export function lerp(value: number, low: number, high: number): number {
  if (high <= low) return 0
  return clip((value - low) / (high - low) * 100, 0, 100)
}

/** 求数组均值 */
export function mean(arr: number[]): number {
  if (!arr.length) return 0
  let s = 0
  for (const v of arr) s += v
  return s / arr.length
}

/** 求数组标准差 */
export function std(arr: number[]): number {
  if (!arr.length) return 0
  const m = mean(arr)
  let s = 0
  for (const v of arr) s += (v - m) * (v - m)
  return Math.sqrt(s / arr.length)
}

/** 求数组最大值 */
export function max(arr: number[]): number {
  if (!arr.length) return 0
  return Math.max(...arr)
}

/** 求数组最小值 */
export function min(arr: number[]): number {
  if (!arr.length) return 0
  return Math.min(...arr)
}

/** 求数组中位数（等价 np.median） */
export function median(arr: number[]): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** 求数组最大值索引 */
export function argmax(arr: number[]): number {
  let idx = 0
  let v = -Infinity
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > v) {
      v = arr[i]
      idx = i
    }
  }
  return idx
}

/** 求数组最小值索引 */
export function argmin(arr: number[]): number {
  let idx = 0
  let v = Infinity
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < v) {
      v = arr[i]
      idx = i
    }
  }
  return idx
}

/** 矩阵求逆（高斯消元），用于 SG 系数计算 */
function invMatrix(a: number[][]): number[][] {
  const n = a.length
  const aug: number[][] = a.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col++) {
    // 选主元
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r
    }
    if (Math.abs(aug[pivot][col]) < 1e-12) continue
    ;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
    const pv = aug[col][col]
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pv
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = aug[r][col]
      if (Math.abs(f) < 1e-12) continue
      for (let j = 0; j < 2 * n; j++) aug[r][j] -= f * aug[col][j]
    }
  }
  return aug.map((row) => row.slice(n))
}

/** 计算 Savitzky-Golay 卷积核（窗口 window，多项式阶 polyorder，导数 deriv，采样间隔 delta） */
export function savgolCoefs(window: number, polyorder: number, deriv: number, delta = 1): number[] {
  const m = (window - 1) / 2
  // A[i][k] = (i*delta)^k, i in [-m..m], k in [0..polyorder]
  const rows = window
  const cols = polyorder + 1
  const A: number[][] = []
  for (let i = 0; i < rows; i++) {
    const j = (i - m) * delta
    const row: number[] = []
    for (let k = 0; k < cols; k++) row.push(Math.pow(j, k))
    A.push(row)
  }
  // AtA = A^T A
  const AtA: number[][] = []
  for (let r = 0; r < cols; r++) {
    const row: number[] = []
    for (let c = 0; c < cols; c++) {
      let s = 0
      for (let i = 0; i < rows; i++) s += A[i][r] * A[i][c]
      row.push(s)
    }
    AtA.push(row)
  }
  const inv = invMatrix(AtA)
  // coef[j] = sum_k inv[deriv][k] * (j*delta)^k
  // scipy 约定：导数核需乘以 deriv!（单位导数响应）
  let fact = 1
  for (let i = 2; i <= deriv; i++) fact *= i
  const coefs: number[] = []
  for (let j = 0; j < rows; j++) {
    const x = (j - m) * delta
    let s = 0
    for (let k = 0; k < cols; k++) s += inv[deriv][k] * Math.pow(x, k)
    coefs.push(s * fact)
  }
  return coefs
}

/**
 * Savitzky-Golay 滤波（等价 scipy.signal.savgol_filter, mode='interp' 近似）
 * 边界用镜像填充处理。
 */
export function savgolFilter(
  x: number[],
  window: number,
  polyorder: number,
  deriv = 0,
  delta = 1,
): number[] {
  const n = x.length
  if (n < window || window < 3) return x.slice()
  const m = (window - 1) / 2
  if (m < 1) return x.slice()
  const coefs = savgolCoefs(window, polyorder, deriv, delta)
  const out: number[] = new Array(n).fill(0)
  // 镜像扩展
  const padded: number[] = []
  for (let i = m; i >= 1; i--) padded.push(x[i])
  padded.push(...x)
  for (let i = 1; i <= m; i++) padded.push(x[n - 1 - i])
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < window; j++) s += coefs[j] * padded[i + j]
    out[i] = s
  }
  return out
}

/** 移动平均（等价 np.convolve mode='same' 的近似实现） */
export function movingAvg(arr: number[], w: number): number[] {
  const n = arr.length
  if (n < w) return arr.slice()
  const out: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let s = 0
    let c = 0
    for (let j = i - Math.floor(w / 2); j <= i + Math.floor(w / 2); j++) {
      if (j >= 0 && j < n) {
        s += arr[j]
        c++
      }
    }
    out[i] = s / c
  }
  return out
}

/** 数值梯度（等价 np.gradient, edge_order=1 近似） */
export function gradient(arr: number[]): number[] {
  const n = arr.length
  if (n === 0) return []
  if (n === 1) return [0]
  const out: number[] = new Array(n).fill(0)
  out[0] = arr[1] - arr[0]
  for (let i = 1; i < n - 1; i++) out[i] = (arr[i + 1] - arr[i - 1]) / 2
  out[n - 1] = arr[n - 1] - arr[n - 2]
  return out
}

/** 2D 距离 */
export function dist2(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

/** 3D 向量模长 */
export function norm3(v: number[]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
}

/** 3D 向量点积 */
export function dot3(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** 三点夹角（度），b 为顶点 */
export function angle3(a: number[] | null, b: number[] | null, c: number[] | null): number | null {
  if (!a || !b || !c) return null
  const v1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const v2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
  const n1 = norm3(v1)
  const n2 = norm3(v2)
  if (n1 < 1e-6 || n2 < 1e-6) return null
  const cos = clip(dot3(v1, v2) / (n1 * n2), -1, 1)
  return Math.acos(cos) * 180 / Math.PI
}

/** 向量相减 */
export function sub3(a: number[], b: number[]): number[] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
