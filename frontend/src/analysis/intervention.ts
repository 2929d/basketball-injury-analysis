/**
 * 干预措施知识库（从后端 knowledge/intervention.py 迁移）
 * 根据风险类别与具体成因，返回针对性的训练与预防建议 + 具体训练动作
 */
import type { AthleteInfo, Exercise, GearProtector, GearRec, RiskItem, ShoeModel } from './types'
import { isPresent } from '../utils'

// 训练动作
const EX: Record<string, Exercise> = {
  lateral_band_walk: {
    name: '弹力带侧步走(蟹步)',
    steps: '1.弹力带套于膝或踝上方 2.半蹲位,膝盖对齐脚尖 3.保持半蹲向侧方小步移动,感受臀外侧发力 4.反向走回',
    dose: '3组×每侧15步',
    video: '弹力带侧步走 臀中肌',
  },
  single_leg_bridge: {
    name: '单腿臀桥',
    steps: '1.仰卧屈膝,单脚踩地,另一腿伸直抬起 2.臀发力顶起髋部至身体成直线 3.顶峰收缩1秒后下放 4.换腿',
    dose: '3组×每侧12次',
    video: '单腿臀桥 臀大肌',
  },
  squat_mirror: {
    name: '镜前深蹲膝盖轨迹训练',
    steps: '1.侧对镜子,半蹲至大腿与地面平行 2.观察膝盖是否对齐脚尖方向(不内扣) 3.保持正确轨迹起立 4.强化本体感觉',
    dose: '3组×10次',
    video: '深蹲 膝盖内扣 纠正',
  },
  eccentric_squat: {
    name: '离心深蹲(慢下快起)',
    steps: '1.负重或自重深蹲 2.下蹲阶段控制3-4秒(离心收缩) 3.蹲至平行后快速站起 4.注重全程膝盖轨迹',
    dose: '4组×8次',
    video: '离心深蹲 股四头肌',
  },
  bulgarian_split: {
    name: '保加利亚分腿蹲',
    steps: '1.后脚搭于长凳,前脚向前一步 2.控制下蹲至前腿大腿平行 3.前腿发力站起 4.换腿',
    dose: '3组×每侧10次',
    video: '保加利亚分腿蹲',
  },
  soft_landing: {
    name: '软落地跳跃训练',
    steps: '1.从低台阶(30cm)跳下 2.前脚掌先着地,迅速屈膝屈髋缓冲 3.落地无声为目标 4.逐步增加高度',
    dose: '3组×8次',
    video: '跳跃落地 缓冲训练',
  },
  single_leg_squat: {
    name: '单腿深蹲',
    steps: '1.单腿站立,另一腿前伸 2.控制下蹲至能保持平衡的最低点 3.站起 4.换腿',
    dose: '3组×每侧8次',
    video: '单腿深蹲 下肢',
  },
  ankle_dorsiflexion_stretch: {
    name: '踝背屈活动度训练(墙式)',
    steps: '1.面对墙弓步,前脚距墙10cm 2.膝盖向前推墙,脚跟不离地 3.保持拉伸感20-30秒 4.换腿',
    dose: '3组×每侧30秒',
    video: '踝背屈 活动度 拉伸',
  },
  single_leg_balance: {
    name: '单腿平衡(本体感觉)',
    steps: '1.单腿站立,另一腿微抬 2.保持平衡30秒,逐步闭眼增加难度 3.进阶:站在平衡垫/BOSU球上 4.换腿',
    dose: '3组×每侧30秒',
    video: '单腿平衡 本体感觉',
  },
  calf_stretch: {
    name: '小腿后侧拉伸(腓肠肌)',
    steps: '1.弓步推墙,后腿伸直脚跟着地 2.感受小腿后侧拉伸 3.保持20-30秒 4.换腿',
    dose: '3组×每侧30秒',
    video: '小腿拉伸 腓肠肌',
  },
  hip_flexor_stretch: {
    name: '屈髋肌群拉伸(弓步式)',
    steps: '1.单膝跪地弓步 2.重心前移,感受后腿髋前侧拉伸 3.保持20-30秒 4.换腿',
    dose: '3组×每侧30秒',
    video: '髋屈肌 拉伸',
  },
  deadlift: {
    name: '罗马尼亚硬拉(伸髋力量)',
    steps: '1.双脚与肩宽,微屈膝 2.髋部后推,杠铃沿大腿下放 3.感受腘绳肌拉伸 4.臀发力站起',
    dose: '4组×8次',
    video: '罗马尼亚硬拉',
  },
  side_plank: {
    name: '侧平板(核心抗侧屈)',
    steps: '1.侧卧,前臂撑地 2.髋部抬起至身体成直线 3.保持30-60秒 4.换侧',
    dose: '3组×每侧40秒',
    video: '侧平板 核心',
  },
  dead_bug: {
    name: '死虫式(核心稳定)',
    steps: '1.仰卧,双臂双腿抬起屈90° 2.对侧手脚缓慢下放至接近地面 3.腰部不离开地面 4.换侧',
    dose: '3组×每侧10次',
    video: '死虫式 核心训练',
  },
  drop_jump: {
    name: '落地稳定训练(单脚)',
    steps: '1.从低台阶跳下 2.单脚落地并稳住3秒 3.膝盖不内扣、不晃动 4.换腿,逐步增加高度',
    dose: '3组×每侧6次',
    video: '单脚落地 稳定训练',
  },
}

// 知识库: 风险类别 -> 成因码 -> {desc, tips, exercises}
const KNOWLEDGE: Record<string, Record<string, { desc: string; tips: string[]; exercises: Exercise[] }>> = {
  膝关节: {
    valgus: {
      desc: '膝关节异常内扣(膝外翻), 落地时膝盖向内塌陷',
      tips: [
        '加强臀中肌/臀大肌力量, 改善下肢力线',
        '练习落地时膝盖对齐脚尖方向, 避免膝盖内扣',
        '落地训练: 镜前练习, 强化正确膝盖轨迹意识',
      ],
      exercises: [EX.lateral_band_walk, EX.single_leg_bridge, EX.squat_mirror],
    },
    flexion_insufficient: {
      desc: '初次触地时膝关节屈曲不足, 缓冲能力差',
      tips: [
        '加强落地缓冲训练, 强调软落地(前脚掌先着地、屈膝屈髋)',
        '离心力量训练提升股四头肌离心控制力',
      ],
      exercises: [EX.eccentric_squat, EX.bulgarian_split, EX.soft_landing],
    },
    asymmetry: {
      desc: '左右膝关节动作差异明显, 存在代偿',
      tips: ['单腿训练纠正左右差异', '评估并强化较弱侧下肢力量'],
      exercises: [EX.single_leg_squat, EX.bulgarian_split],
    },
    angular_velocity: {
      desc: '膝关节角速度过大, 冲击负荷高',
      tips: ['提升下肢离心力量, 控制落地速度', '强化落地预激活意识'],
      exercises: [EX.eccentric_squat, EX.soft_landing],
    },
  },
  踝关节: {
    dorsiflexion: {
      desc: '踝背屈受限, 影响落地缓冲',
      tips: ['踝关节背屈活动度训练', '小腿后侧链放松与拉伸'],
      exercises: [EX.ankle_dorsiflexion_stretch, EX.calf_stretch],
    },
    instability: {
      desc: '踝关节稳定性不足, 落地晃动明显',
      tips: ['本体感觉训练', '加强踝周肌群力量'],
      exercises: [EX.single_leg_balance, EX.drop_jump],
    },
    asymmetry: {
      desc: '左右脚触地时间不对称',
      tips: ['单脚落地稳定性训练, 强化较弱侧'],
      exercises: [EX.drop_jump, EX.single_leg_balance],
    },
  },
  髋关节: {
    flexion: {
      desc: '髋关节屈曲不足, 落地缓冲主要由膝承担',
      tips: ['加强髋关节活动度', '强化伸髋力量, 落地主动屈髋分散冲击'],
      exercises: [EX.hip_flexor_stretch, EX.deadlift, EX.soft_landing],
    },
    pelvic: {
      desc: '骨盆倾斜/侧倾明显, 核心控制不足',
      tips: ['核心稳定性训练', '臀中肌力量训练改善骨盆侧倾'],
      exercises: [EX.side_plank, EX.dead_bug, EX.lateral_band_walk],
    },
    stability: {
      desc: '髋部稳定性不足, 重心横向晃动大',
      tips: ['臀中肌/臀大肌力量训练', '单腿动态稳定训练'],
      exercises: [EX.single_leg_bridge, EX.single_leg_squat],
    },
  },
  躯干控制: {
    lateral_lean: {
      desc: '躯干侧倾明显, 身体控制不足',
      tips: ['核心抗侧屈训练', '落地时保持躯干中立'],
      exercises: [EX.side_plank, EX.dead_bug],
    },
    forward_lean: {
      desc: '躯干前倾过度, 重心前移',
      tips: ['核心力量训练维持躯干直立', '落地意识: 挺胸收腹'],
      exercises: [EX.dead_bug, EX.deadlift],
    },
    com: {
      desc: '重心横向偏移大, 动态平衡差',
      tips: ['动态平衡训练', '核心稳定性训练控制重心'],
      exercises: [EX.single_leg_balance, EX.dead_bug],
    },
  },
  左右不对称: {
    general: {
      desc: '左右肢体动作整体不对称',
      tips: ['单侧力量训练纠正差异', '对称性动作模式训练, 视频反馈纠正'],
      exercises: [EX.single_leg_squat, EX.bulgarian_split, EX.single_leg_bridge],
    },
  },
  动作稳定性: {
    buffer: {
      desc: '落地缓冲时间过短, 冲击吸收不足',
      tips: ['强调软落地技术(屈膝屈髋、前脚掌过渡)', '离心力量训练提升缓冲控制'],
      exercises: [EX.soft_landing, EX.eccentric_squat],
    },
    stabilization: {
      desc: '落地后稳定时间过长, 动态控制差',
      tips: ['单腿落地稳定训练', '本体感觉与核心训练'],
      exercises: [EX.drop_jump, EX.single_leg_balance],
    },
  },
}

export function getRecommendations(
  category: string,
  causeCodes: string[],
): { causes: string[]; tips: string[]; exercises: Exercise[] } {
  const causes: string[] = []
  const tips: string[] = []
  const exercises: Exercise[] = []
  const cat = KNOWLEDGE[category] || {}
  for (const code of causeCodes) {
    const entry = cat[code]
    if (entry) {
      causes.push(entry.desc)
      for (const t of entry.tips) if (!tips.includes(t)) tips.push(t)
      for (const ex of entry.exercises) {
        if (!exercises.some((e) => e.name === ex.name)) exercises.push(ex)
      }
    }
  }
  return { causes, tips, exercises }
}

// ============ 护具与球鞋推荐 ============

const PROTECTORS: Record<string, GearProtector[]> = {
  膝关节: [
    { name: '髌骨带', desc: '固定髌骨轨迹，减轻跳跃落地时膝前侧压力', scene: '膝内扣 / 屈曲不足 / 日常防护', level: '常规' },
    { name: '铰链式护膝', desc: '提供侧向刚性支撑，限制膝关节异常内扣', scene: '严重膝外翻 / 术后恢复 / 反复损伤', level: '加强' },
    { name: '肌内效贴布', desc: '辅助髌骨轨迹、促进股四头肌发力', scene: '角速度过大 / 比赛防护', level: '常规' },
  ],
  踝关节: [
    { name: '弹性护踝', desc: '压缩支撑增强本体感觉，减少落地晃动', scene: '踝不稳 / 晃动明显', level: '常规' },
    { name: '硬质支撑护踝', desc: '刚性侧支撑片，防止踝关节翻转扭伤', scene: '反复扭伤 / 严重不稳', level: '加强' },
  ],
  髋关节: [
    { name: '髋部加压带', desc: '提供髋部压缩与本体感觉提示，改善稳定', scene: '髋稳定性不足 / 重心晃动', level: '常规' },
  ],
  躯干控制: [
    { name: '运动护腰', desc: '提供腰椎支撑，提示核心收腹维持躯干中立', scene: '躯干侧倾 / 前倾过度', level: '常规' },
  ],
  左右不对称: [
    { name: '足弓支撑鞋垫', desc: '矫正下肢力线，改善左右不对称与足弓塌陷', scene: '结构性不对称 / 扁平足', level: '常规' },
  ],
  动作稳定性: [
    { name: '压缩裤 / 压缩袜', desc: '增强肌肉本体感觉与循环，提升落地稳定', scene: '落地稳定差 / 疲劳防护', level: '常规' },
  ],
}

const MATCH_CAUSES: Record<string, string[]> = {
  髌骨带: ['valgus', 'flexion_insufficient'],
  铰链式护膝: ['valgus', 'asymmetry'],
  肌内效贴布: ['angular_velocity'],
  弹性护踝: ['instability', 'asymmetry'],
  硬质支撑护踝: ['instability'],
  髋部加压带: ['stability', 'flexion', 'pelvic'],
  运动护腰: ['lateral_lean', 'forward_lean', 'com'],
  足弓支撑鞋垫: ['general'],
  '压缩裤 / 压缩袜': ['buffer', 'stabilization'],
}

interface ShoeFeature {
  feature: string
  desc: string
  matchCategories: string[]
  reason: string
  models: { name: string; brand: string; highlight: string }[]
}

const SHOE_FEATURES: ShoeFeature[] = [
  {
    feature: '强缓震中底',
    desc: '厚底 / 气垫 / 发泡中底，高效吸收落地冲击',
    matchCategories: ['膝关节', '动作稳定性'],
    reason: '落地缓冲不足时，缓震型球鞋可分担膝关节冲击负荷',
    models: [
      { name: '李宁 驭帅20（350-450元）', brand: '李宁', highlight: 'CBA球员同款，全掌疾䨻中底回弹足，2026口碑全能款' },
      { name: 'Nike LeBron 23', brand: 'Nike', highlight: '全掌Zoom Air气垫+碳板，缓震9.5分，大体重顶级保护' },
      { name: '李宁 韦德之道11（380-450元）', brand: '李宁', highlight: '去年旗舰降价，支撑强力线正，缓震扎实不崴脚' },
    ],
  },
  {
    feature: '高帮 / 防侧翻设计',
    desc: '高帮鞋领 + TPU侧向支撑片，限制踝关节翻转',
    matchCategories: ['踝关节', '躯干控制'],
    reason: '踝不稳或躯干侧倾时，防侧翻设计降低扭伤风险',
    models: [
      { name: '安踏 空域5（200-250元）', brand: '安踏', highlight: '高帮+后跟环抱TPU，防侧翻很稳，水泥外场克星' },
      { name: '李宁 韦德之道11', brand: '李宁', highlight: '支撑强力线正，高强度对抗脚踝安全感拉满' },
      { name: '李宁 驭帅14䨻蝉翼版（500-600元）', brand: '李宁', highlight: '内侧热熔框架+全掌䨻，支撑拉满打全场不累' },
    ],
  },
  {
    feature: '强抓地外底',
    desc: '橡胶外底 + 人字纹 / 多向纹路，急停变向不打滑',
    matchCategories: ['踝关节', '动作稳定性'],
    reason: '变向急停需强抓地力，避免脚下打滑导致代偿动作',
    models: [
      { name: '李宁 利刃6V2（300-400元）', brand: '李宁', highlight: '细密人字纹室内抓地死，2026校园神鞋，响应快' },
      { name: '李宁 音速14（300-400元）', brand: '李宁', highlight: 'TUFFRB耐磨外底，跑动型大众口粮鞋，性价比高' },
      { name: '安踏 狂潮6代（150-250元）', brand: '安踏', highlight: '室内外都能打，氮科技缓震，耐磨表现好' },
    ],
  },
  {
    feature: '中足抗扭转支撑',
    desc: '中足 TPU / 碳板支撑，提升落地稳定性与力线控制',
    matchCategories: ['左右不对称', '动作稳定性'],
    reason: '不对称或稳定差时，支撑型球鞋减少足部过度内旋',
    models: [
      { name: '李宁 驭帅20', brand: '李宁', highlight: 'GCU外底+力线正，全能稳定不容易崴脚' },
      { name: '安踏 追光（500元左右）', brand: '安踏', highlight: '含碳板抗扭，缓震饱满润弹，165斤也能踩开' },
      { name: '李宁 韦德之道11', brand: '李宁', highlight: '碳板+Probar Loc，抗扭顶级，收藏实战两不误' },
    ],
  },
  {
    feature: '宽楦合脚鞋型',
    desc: '前掌宽楦设计，避免脚趾挤压、增大落地接触面',
    matchCategories: ['踝关节'],
    reason: '合脚宽楦提升落地接触面积与整体稳定性',
    models: [
      { name: '安踏 欧文一代（400-500元）', brand: '安踏', highlight: '旋型偏宽支撑稳，脚宽友好，稳健打全场' },
      { name: '安踏 狂潮6代', brand: '安踏', highlight: '全能宽楦，后卫小前锋都能穿，外场水泥地友好' },
    ],
  },
]

/** 具体风险成因 → 适用的球鞋特性（比只按部位粗匹配更精准） */
const CAUSE_FEATURE: Record<string, string[]> = {
  valgus: ['中足抗扭转支撑', '强缓震中底'],
  flexion_insufficient: ['强缓震中底'],
  angular_velocity: ['强缓震中底'],
  instability: ['高帮 / 防侧翻设计', '强抓地外底'],
  dorsiflexion: ['强缓震中底', '高帮 / 防侧翻设计'],
  asymmetry: ['中足抗扭转支撑'],
  stability: ['中足抗扭转支撑'],
  flexion: ['强缓震中底'],
  pelvic: ['中足抗扭转支撑'],
  lateral_lean: ['高帮 / 防侧翻设计'],
  forward_lean: ['强抓地外底'],
  com: ['中足抗扭转支撑'],
  buffer: ['强缓震中底'],
  stabilization: ['中足抗扭转支撑', '强抓地外底'],
  general: ['中足抗扭转支撑'],
}

/** 稳定散列: 同一份风险画像得到同一个种子, 保证同一份报告的选款可复现 */
function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * 为某个球鞋特性打分: 综合命中部位、命中具体成因、风险高低与个体因素。
 * 分数越高说明这双鞋越对症——旧版只按部位顺序取第一个匹配项, 所以每次都是同一双。
 */
function scoreShoeFeature(
  sf: ShoeFeature,
  riskItems: RiskItem[],
  athlete?: AthleteInfo | null,
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  for (const it of riskItems) {
    if (it.level === '低风险') continue
    const byCat = sf.matchCategories.includes(it.category)
    const codes = it.cause_codes || []
    const byCause = codes.some((c) => (CAUSE_FEATURE[c] || []).includes(sf.feature))
    if (!byCat && !byCause) continue

    const sev = Math.max(0, Math.min(1, it.score / 100))
    if (byCat) score += 10 * sev
    if (byCause) score += 14 * sev
    if (it.level === '高风险') score += 6

    if (byCause && it.main_causes.length) {
      reasons.push(`${it.category}${it.main_causes[0]}，${sf.reason}`)
    } else if (byCat) {
      reasons.push(`${it.category}风险 ${Math.round(it.score)} 分，${sf.reason}`)
    }
  }

  // 个体因素加成
  if (athlete) {
    const hm = Number(athlete.height_cm) / 100
    const bmi = hm > 0 ? Number(athlete.weight_kg) / (hm * hm) : 22
    const inj = String(athlete.injury_history || '').toLowerCase()
    if (bmi > 26 && sf.feature === '强缓震中底') {
      score += 8
      reasons.push(`BMI ${bmi.toFixed(1)} 偏高，需要更强缓震分担落地冲击`)
    }
    if ((inj.includes('膝') || inj.includes('半月板') || inj.includes('十字')) && sf.feature === '强缓震中底') {
      score += 6
      reasons.push('有膝伤史，优先厚缓震降低关节负荷')
    }
    if ((inj.includes('踝') || inj.includes('扭')) && sf.feature === '高帮 / 防侧翻设计') {
      score += 8
      reasons.push('有踝伤史，优先高帮防侧翻')
    }
    if (athlete.gender === 'female' && sf.feature === '中足抗扭转支撑') {
      score += 4
      reasons.push('女性下肢力线特点，抗扭转支撑收益更高')
    }
  }

  return { score, reasons }
}

export function getGearRecommendations(riskItems: RiskItem[], athlete?: AthleteInfo | null): GearRec {
  const highItems = riskItems.filter((it) => it.level === '高风险')
  const midItems = riskItems.filter((it) => it.level === '中风险')
  const MAX_P = 4
  const MAX_S = 2

  let preferStrong = false
  let preferKneeHinge = false
  if (athlete) {
    const inj = (athlete.injury_history || '').toLowerCase()
    if (inj && (inj.includes('膝') || inj.includes('半月板') || inj.includes('十字') || inj.includes('acl'))) {
      preferKneeHinge = true
    }
    if (isPresent(inj) || isPresent(athlete.current_pain)) preferStrong = true
    if (athlete.gender === 'female') preferKneeHinge = true
  }

  const protectors: GearProtector[] = []
  const seenP = new Set<string>()

  const pick = (items: RiskItem[]) => {
    for (const it of items) {
      const codes = new Set(it.cause_codes || [])
      const catPs = PROTECTORS[it.category] || []
      const matched = catPs.filter((p) => !MATCH_CAUSES[p.name] || (MATCH_CAUSES[p.name] || []).some((c) => codes.has(c)))
      const src = matched.length ? matched : catPs
      const sorted = src.slice().sort((a, b) => {
        let sa = 0
        let sb = 0
        if (preferStrong && a.level === '加强') sa -= 2
        if (preferStrong && b.level === '加强') sb -= 2
        if (preferKneeHinge && a.name === '铰链式护膝') sa -= 3
        if (preferKneeHinge && b.name === '铰链式护膝') sb -= 3
        return sa - sb
      })
      for (const p of sorted) {
        if (!seenP.has(p.name) && protectors.length < MAX_P) {
          seenP.add(p.name)
          protectors.push(p)
        }
      }
    }
  }

  pick(highItems)
  if (protectors.length < 3) pick(midItems)

  // ============ 球鞋: 按风险画像打分排序 + 候选款轮换 ============
  // 旧实现: 按固定顺序遍历, 命中第一个部位就拿该特性的第 1 款 → 永远是同一双鞋。
  const shoes: GearRec['shoes'] = []
  const ranked = SHOE_FEATURES.map((sf) => ({ sf, ...scoreShoeFeature(sf, riskItems, athlete) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  // 全部低风险时给出通用推荐, 避免推荐区空白
  const list = ranked.length
    ? ranked
    : SHOE_FEATURES.slice(0, MAX_S).map((sf) => ({ sf, score: 0, reasons: [] as string[] }))

  // 种子取自风险画像: 同一份分析选款固定可复现, 不同分析会轮换到其他鞋款
  const seedStr =
    riskItems.map((it) => `${it.category}:${Math.round(it.score)}`).join('|') +
    `${athlete?.height_cm ?? ''}${athlete?.weight_kg ?? ''}${athlete?.injury_history ?? ''}`
  const seed = hashSeed(seedStr)

  const seenModels = new Set<string>()
  for (const { sf, reasons } of list) {
    if (shoes.length >= MAX_S) break
    // 从候选款中轮换取最多 2 款, 跨特性跳过已推荐过的同款
    const picked: ShoeModel[] = []
    for (let i = 0; i < sf.models.length && picked.length < 2; i++) {
      const m = sf.models[(seed + i) % sf.models.length]
      const key = m.name.replace(/（[^）]*）/g, '').trim() // 去掉价格区间后缀用于去重
      if (seenModels.has(key)) continue
      seenModels.add(key)
      picked.push(m)
    }
    if (!picked.length) continue
    shoes.push({
      feature: sf.feature,
      desc: sf.desc,
      reason: reasons.length ? reasons.slice(0, 2).join('；') : sf.reason,
      models: picked,
    })
  }

  return { protectors, shoes }
}
