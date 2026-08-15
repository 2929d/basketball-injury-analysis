"""
干预措施知识库。

根据风险类别与具体成因,返回针对性的训练与预防建议 + 具体训练动作(含演示视频搜索词)。
建议来源为运动医学/体能训练的常见循证干预手段(演示用途,非处方)。
"""
from __future__ import annotations

# 训练动作: name=动作名, steps=步骤, dose=推荐剂量, video=B站搜索关键词
_EX = {
    "lateral_band_walk": {
        "name": "弹力带侧步走(蟹步)",
        "steps": "1.弹力带套于膝或踝上方 2.半蹲位,膝盖对齐脚尖 3.保持半蹲向侧方小步移动,感受臀外侧发力 4.反向走回",
        "dose": "3组×每侧15步",
        "video": "弹力带侧步走 臀中肌",
    },
    "single_leg_bridge": {
        "name": "单腿臀桥",
        "steps": "1.仰卧屈膝,单脚踩地,另一腿伸直抬起 2.臀发力顶起髋部至身体成直线 3.顶峰收缩1秒后下放 4.换腿",
        "dose": "3组×每侧12次",
        "video": "单腿臀桥 臀大肌",
    },
    "squat_mirror": {
        "name": "镜前深蹲膝盖轨迹训练",
        "steps": "1.侧对镜子,半蹲至大腿与地面平行 2.观察膝盖是否对齐脚尖方向(不内扣) 3.保持正确轨迹起立 4.强化本体感觉",
        "dose": "3组×10次",
        "video": "深蹲 膝盖内扣 纠正",
    },
    "eccentric_squat": {
        "name": "离心深蹲(慢下快起)",
        "steps": "1.负重或自重深蹲 2.下蹲阶段控制3-4秒(离心收缩) 3.蹲至平行后快速站起 4.注重全程膝盖轨迹",
        "dose": "4组×8次",
        "video": "离心深蹲 股四头肌",
    },
    "bulgarian_split": {
        "name": "保加利亚分腿蹲",
        "steps": "1.后脚搭于长凳,前脚向前一步 2.控制下蹲至前腿大腿平行 3.前腿发力站起 4.换腿",
        "dose": "3组×每侧10次",
        "video": "保加利亚分腿蹲",
    },
    "soft_landing": {
        "name": "软落地跳跃训练",
        "steps": "1.从低台阶(30cm)跳下 2.前脚掌先着地,迅速屈膝屈髋缓冲 3.落地无声为目标 4.逐步增加高度",
        "dose": "3组×8次",
        "video": "跳跃落地 缓冲训练",
    },
    "single_leg_squat": {
        "name": "单腿深蹲",
        "steps": "1.单腿站立,另一腿前伸 2.控制下蹲至能保持平衡的最低点 3.站起 4.换腿",
        "dose": "3组×每侧8次",
        "video": "单腿深蹲 下肢",
    },
    "ankle_dorsiflexion_stretch": {
        "name": "踝背屈活动度训练(墙式)",
        "steps": "1.面对墙弓步,前脚距墙10cm 2.膝盖向前推墙,脚跟不离地 3.保持拉伸感20-30秒 4.换腿",
        "dose": "3组×每侧30秒",
        "video": "踝背屈 活动度 拉伸",
    },
    "single_leg_balance": {
        "name": "单腿平衡(本体感觉)",
        "steps": "1.单腿站立,另一腿微抬 2.保持平衡30秒,逐步闭眼增加难度 3.进阶:站在平衡垫/BOSU球上 4.换腿",
        "dose": "3组×每侧30秒",
        "video": "单腿平衡 本体感觉",
    },
    "calf_stretch": {
        "name": "小腿后侧拉伸(腓肠肌)",
        "steps": "1.弓步推墙,后腿伸直脚跟着地 2.感受小腿后侧拉伸 3.保持20-30秒 4.换腿",
        "dose": "3组×每侧30秒",
        "video": "小腿拉伸 腓肠肌",
    },
    "hip_flexor_stretch": {
        "name": "屈髋肌群拉伸(弓步式)",
        "steps": "1.单膝跪地弓步 2.重心前移,感受后腿髋前侧拉伸 3.保持20-30秒 4.换腿",
        "dose": "3组×每侧30秒",
        "video": "髋屈肌 拉伸",
    },
    "deadlift": {
        "name": "罗马尼亚硬拉(伸髋力量)",
        "steps": "1.双脚与肩宽,微屈膝 2.髋部后推,杠铃沿大腿下放 3.感受腘绳肌拉伸 4.臀发力站起",
        "dose": "4组×8次",
        "video": "罗马尼亚硬拉",
    },
    "side_plank": {
        "name": "侧平板(核心抗侧屈)",
        "steps": "1.侧卧,前臂撑地 2.髋部抬起至身体成直线 3.保持30-60秒 4.换侧",
        "dose": "3组×每侧40秒",
        "video": "侧平板 核心",
    },
    "dead_bug": {
        "name": "死虫式(核心稳定)",
        "steps": "1.仰卧,双臂双腿抬起屈90° 2.对侧手脚缓慢下放至接近地面 3.腰部不离开地面 4.换侧",
        "dose": "3组×每侧10次",
        "video": "死虫式 核心训练",
    },
    "drop_jump": {
        "name": "落地稳定训练(单脚)",
        "steps": "1.从低台阶跳下 2.单脚落地并稳住3秒 3.膝盖不内扣、不晃动 4.换腿,逐步增加高度",
        "dose": "3组×每侧6次",
        "video": "单脚落地 稳定训练",
    },
}

# 知识库: 风险类别 -> 成因码 -> {desc, tips, exercises}
KNOWLEDGE: dict[str, dict[str, dict]] = {
    "膝关节": {
        "valgus": {
            "desc": "膝关节异常内扣(膝外翻), 落地时膝盖向内塌陷",
            "tips": [
                "加强臀中肌/臀大肌力量, 改善下肢力线",
                "练习落地时膝盖对齐脚尖方向, 避免膝盖内扣",
                "落地训练: 镜前练习, 强化正确膝盖轨迹意识",
            ],
            "exercises": [_EX["lateral_band_walk"], _EX["single_leg_bridge"], _EX["squat_mirror"]],
        },
        "flexion_insufficient": {
            "desc": "初次触地时膝关节屈曲不足, 缓冲能力差",
            "tips": [
                "加强落地缓冲训练, 强调软落地(前脚掌先着地、屈膝屈髋)",
                "离心力量训练提升股四头肌离心控制力",
            ],
            "exercises": [_EX["eccentric_squat"], _EX["bulgarian_split"], _EX["soft_landing"]],
        },
        "asymmetry": {
            "desc": "左右膝关节动作差异明显, 存在代偿",
            "tips": ["单腿训练纠正左右差异", "评估并强化较弱侧下肢力量"],
            "exercises": [_EX["single_leg_squat"], _EX["bulgarian_split"]],
        },
        "angular_velocity": {
            "desc": "膝关节角速度过大, 冲击负荷高",
            "tips": ["提升下肢离心力量, 控制落地速度", "强化落地预激活意识"],
            "exercises": [_EX["eccentric_squat"], _EX["soft_landing"]],
        },
    },
    "踝关节": {
        "dorsiflexion": {
            "desc": "踝背屈受限, 影响落地缓冲",
            "tips": ["踝关节背屈活动度训练", "小腿后侧链放松与拉伸"],
            "exercises": [_EX["ankle_dorsiflexion_stretch"], _EX["calf_stretch"]],
        },
        "instability": {
            "desc": "踝关节稳定性不足, 落地晃动明显",
            "tips": ["本体感觉训练", "加强踝周肌群力量"],
            "exercises": [_EX["single_leg_balance"], _EX["drop_jump"]],
        },
        "asymmetry": {
            "desc": "左右脚触地时间不对称",
            "tips": ["单脚落地稳定性训练, 强化较弱侧"],
            "exercises": [_EX["drop_jump"], _EX["single_leg_balance"]],
        },
    },
    "髋关节": {
        "flexion": {
            "desc": "髋关节屈曲不足, 落地缓冲主要由膝承担",
            "tips": ["加强髋关节活动度", "强化伸髋力量, 落地主动屈髋分散冲击"],
            "exercises": [_EX["hip_flexor_stretch"], _EX["deadlift"], _EX["soft_landing"]],
        },
        "pelvic": {
            "desc": "骨盆倾斜/侧倾明显, 核心控制不足",
            "tips": ["核心稳定性训练", "臀中肌力量训练改善骨盆侧倾"],
            "exercises": [_EX["side_plank"], _EX["dead_bug"], _EX["lateral_band_walk"]],
        },
        "stability": {
            "desc": "髋部稳定性不足, 重心横向晃动大",
            "tips": ["臀中肌/臀大肌力量训练", "单腿动态稳定训练"],
            "exercises": [_EX["single_leg_bridge"], _EX["single_leg_squat"]],
        },
    },
    "躯干控制": {
        "lateral_lean": {
            "desc": "躯干侧倾明显, 身体控制不足",
            "tips": ["核心抗侧屈训练", "落地时保持躯干中立"],
            "exercises": [_EX["side_plank"], _EX["dead_bug"]],
        },
        "forward_lean": {
            "desc": "躯干前倾过度, 重心前移",
            "tips": ["核心力量训练维持躯干直立", "落地意识: 挺胸收腹"],
            "exercises": [_EX["dead_bug"], _EX["deadlift"]],
        },
        "com": {
            "desc": "重心横向偏移大, 动态平衡差",
            "tips": ["动态平衡训练", "核心稳定性训练控制重心"],
            "exercises": [_EX["single_leg_balance"], _EX["dead_bug"]],
        },
    },
    "左右不对称": {
        "general": {
            "desc": "左右肢体动作整体不对称",
            "tips": ["单侧力量训练纠正差异", "对称性动作模式训练, 视频反馈纠正"],
            "exercises": [_EX["single_leg_squat"], _EX["bulgarian_split"], _EX["single_leg_bridge"]],
        },
    },
    "动作稳定性": {
        "buffer": {
            "desc": "落地缓冲时间过短, 冲击吸收不足",
            "tips": ["强调软落地技术(屈膝屈髋、前脚掌过渡)", "离心力量训练提升缓冲控制"],
            "exercises": [_EX["soft_landing"], _EX["eccentric_squat"]],
        },
        "stabilization": {
            "desc": "落地后稳定时间过长, 动态控制差",
            "tips": ["单腿落地稳定训练", "本体感觉与核心训练"],
            "exercises": [_EX["drop_jump"], _EX["single_leg_balance"]],
        },
    },
}


def get_recommendations(category: str, cause_codes: list[str]) -> tuple[list[str], list[str], list[dict]]:
    """根据风险类别与成因码, 返回 (主要原因描述列表, 建议列表, 训练动作列表)。"""
    causes: list[str] = []
    tips: list[str] = []
    exercises: list[dict] = []
    cat = KNOWLEDGE.get(category, {})
    for code in cause_codes:
        entry = cat.get(code)
        if entry:
            causes.append(entry["desc"])
            tips.extend(entry.get("tips", []))
            exercises.extend(entry.get("exercises", []))
    tips = list(dict.fromkeys(tips))
    # 训练动作去重(按 name)
    seen = set()
    uniq_ex = []
    for ex in exercises:
        if ex["name"] not in seen:
            seen.add(ex["name"])
            uniq_ex.append(ex)
    return causes, tips, uniq_ex


# ============================================================
# 护具与球鞋推荐知识库
# ============================================================

# 按风险部位推荐护具(match_causes 匹配具体成因, level: 常规/加强)
PROTECTORS: dict[str, list[dict]] = {
    "膝关节": [
        {"name": "髌骨带", "desc": "固定髌骨轨迹，减轻跳跃落地时膝前侧压力", "scene": "膝内扣 / 屈曲不足 / 日常防护", "match_causes": ["valgus", "flexion_insufficient"], "level": "常规"},
        {"name": "铰链式护膝", "desc": "提供侧向刚性支撑，限制膝关节异常内扣", "scene": "严重膝外翻 / 术后恢复 / 反复损伤", "match_causes": ["valgus", "asymmetry"], "level": "加强"},
        {"name": "肌内效贴布", "desc": "辅助髌骨轨迹、促进股四头肌发力", "scene": "角速度过大 / 比赛防护", "match_causes": ["angular_velocity"], "level": "常规"},
    ],
    "踝关节": [
        {"name": "弹性护踝", "desc": "压缩支撑增强本体感觉，减少落地晃动", "scene": "踝不稳 / 晃动明显", "match_causes": ["instability", "asymmetry"], "level": "常规"},
        {"name": "硬质支撑护踝", "desc": "刚性侧支撑片，防止踝关节翻转扭伤", "scene": "反复扭伤 / 严重不稳", "match_causes": ["instability"], "level": "加强"},
    ],
    "髋关节": [
        {"name": "髋部加压带", "desc": "提供髋部压缩与本体感觉提示，改善稳定", "scene": "髋稳定性不足 / 重心晃动", "match_causes": ["stability", "flexion", "pelvic"], "level": "常规"},
    ],
    "躯干控制": [
        {"name": "运动护腰", "desc": "提供腰椎支撑，提示核心收腹维持躯干中立", "scene": "躯干侧倾 / 前倾过度", "match_causes": ["lateral_lean", "forward_lean", "com"], "level": "常规"},
    ],
    "左右不对称": [
        {"name": "足弓支撑鞋垫", "desc": "矫正下肢力线，改善左右不对称与足弓塌陷", "scene": "结构性不对称 / 扁平足", "match_causes": ["general"], "level": "常规"},
    ],
    "动作稳定性": [
        {"name": "压缩裤 / 压缩袜", "desc": "增强肌肉本体感觉与循环，提升落地稳定", "scene": "落地稳定差 / 疲劳防护", "match_causes": ["buffer", "stabilization"], "level": "常规"},
    ],
}

# 球鞋特性 + 具体款式推荐(按风险部位匹配)
# 球鞋推荐库(2026年7月更新, 数据来源: 搜狐/头条/微博球鞋测评博主实测)
SHOE_FEATURES: list[dict] = [
    {
        "feature": "强缓震中底",
        "desc": "厚底 / 气垫 / 发泡中底，高效吸收落地冲击",
        "match_categories": ["膝关节", "动作稳定性"],
        "reason": "落地缓冲不足时，缓震型球鞋可分担膝关节冲击负荷",
        "models": [
            {"name": "李宁 驭帅20（350-450元）", "brand": "李宁", "highlight": "CBA球员同款，全掌疾䨻中底回弹足，2026口碑全能款"},
            {"name": "Nike LeBron 23", "brand": "Nike", "highlight": "全掌Zoom Air气垫+碳板，缓震9.5分，大体重顶级保护"},
            {"name": "李宁 韦德之道11（380-450元）", "brand": "李宁", "highlight": "去年旗舰降价，支撑强力线正，缓震扎实不崴脚"},
        ],
    },
    {
        "feature": "高帮 / 防侧翻设计",
        "desc": "高帮鞋领 + TPU侧向支撑片，限制踝关节翻转",
        "match_categories": ["踝关节", "躯干控制"],
        "reason": "踝不稳或躯干侧倾时，防侧翻设计降低扭伤风险",
        "models": [
            {"name": "安踏 空域5（200-250元）", "brand": "安踏", "highlight": "高帮+后跟环抱TPU，防侧翻很稳，水泥外场克星"},
            {"name": "李宁 韦德之道11", "brand": "李宁", "highlight": "支撑强力线正，高强度对抗脚踝安全感拉满"},
            {"name": "李宁 驭帅14䨻蝉翼版（500-600元）", "brand": "李宁", "highlight": "内侧热熔框架+全掌䨻，支撑拉满打全场不累"},
        ],
    },
    {
        "feature": "强抓地外底",
        "desc": "橡胶外底 + 人字纹 / 多向纹路，急停变向不打滑",
        "match_categories": ["踝关节", "动作稳定性"],
        "reason": "变向急停需强抓地力，避免脚下打滑导致代偿动作",
        "models": [
            {"name": "李宁 利刃6V2（300-400元）", "brand": "李宁", "highlight": "细密人字纹室内抓地死，2026校园神鞋，响应快"},
            {"name": "李宁 音速14（300-400元）", "brand": "李宁", "highlight": "TUFFRB耐磨外底，跑动型大众口粮鞋，性价比高"},
            {"name": "安踏 狂潮6代（150-250元）", "brand": "安踏", "highlight": "室内外都能打，氮科技缓震，耐磨表现好"},
        ],
    },
    {
        "feature": "中足抗扭转支撑",
        "desc": "中足 TPU / 碳板支撑，提升落地稳定性与力线控制",
        "match_categories": ["左右不对称", "动作稳定性"],
        "reason": "不对称或稳定差时，支撑型球鞋减少足部过度内旋",
        "models": [
            {"name": "李宁 驭帅20", "brand": "李宁", "highlight": "GCU外底+力线正，全能稳定不容易崴脚"},
            {"name": "安踏 追光（500元左右）", "brand": "安踏", "highlight": "含碳板抗扭，缓震饱满润弹，165斤也能踩开"},
            {"name": "李宁 韦德之道11", "brand": "李宁", "highlight": "碳板+Probar Loc，抗扭顶级，收藏实战两不误"},
        ],
    },
    {
        "feature": "宽楦合脚鞋型",
        "desc": "前掌宽楦设计，避免脚趾挤压、增大落地接触面",
        "match_categories": ["踝关节"],
        "reason": "合脚宽楦提升落地接触面积与整体稳定性",
        "models": [
            {"name": "安踏 欧文一代（400-500元）", "brand": "安踏", "highlight": "旋型偏宽支撑稳，脚宽友好，稳健打全场"},
            {"name": "安踏 狂潮6代", "brand": "安踏", "highlight": "全能宽楦，后卫小前锋都能穿，外场水泥地友好"},
        ],
    },
]


def get_gear_recommendations(risk_items, athlete=None) -> dict:
    """根据风险分项 + 运动员信息推荐护具与球鞋特性。

    个性化: 按具体风险成因码(cause_codes)匹配护具, 运动员伤病史/性别/BMI调整优先级。
    护具最多4个, 球鞋最多2双。
    返回: {"protectors": [...], "shoes": [...]}
    """
    # 按风险等级分组(保留 item 以获取 cause_codes)
    high_items, mid_items = [], []
    for it in risk_items:
        level = it.level.value if hasattr(it.level, "value") else str(it.level)
        if level == "高风险":
            high_items.append(it)
        elif level == "中风险":
            mid_items.append(it)

    MAX_P = 4
    MAX_S = 2

    # 运动员信息影响护具优先级
    prefer_strong = False      # 有伤病/疼痛 → 优先加强级护具
    prefer_knee_hinge = False  # 膝伤史/女性 → 优先铰链护膝
    if athlete:
        inj = (athlete.injury_history or "").lower()
        if inj and ("膝" in inj or "半月板" in inj or "十字" in inj or "acl" in inj):
            prefer_knee_hinge = True
        if inj or athlete.current_pain:
            prefer_strong = True
        gender = athlete.gender.value if hasattr(athlete.gender, "value") else str(athlete.gender)
        if gender == "female":
            prefer_knee_hinge = True

    # 护具: 按成因码匹配 + 优先级排序
    protectors: list[dict] = []
    seen_p: set[str] = set()

    def _pick(items):
        for it in items:
            codes = set(getattr(it, "cause_codes", []))
            cat_ps = PROTECTORS.get(it.category, [])
            # 匹配: match_causes 与 cause_codes 有交集, 或护具无 match_causes
            matched = [p for p in cat_ps if not p.get("match_causes") or set(p["match_causes"]) & codes]
            if not matched:
                matched = cat_ps
            # 排序: 加强级/铰链护膝按需优先
            def _key(p):
                s = 0
                if prefer_strong and p.get("level") == "加强":
                    s -= 2
                if prefer_knee_hinge and p["name"] == "铰链式护膝":
                    s -= 3
                return s
            matched.sort(key=_key)
            for p in matched:
                if p["name"] not in seen_p and len(protectors) < MAX_P:
                    seen_p.add(p["name"])
                    protectors.append(p)

    _pick(high_items)
    if len(protectors) < 3:
        _pick(mid_items)

    # 球鞋: 优先高风险部位匹配, 最多2个特性, 每个只取最推荐的1款
    shoes: list[dict] = []
    seen_s: set[str] = set()
    shoe_cats = [it.category for it in high_items + mid_items]
    # BMI偏高时把强缓震排前
    if athlete:
        hm = athlete.height_cm / 100.0
        bmi = athlete.weight_kg / (hm ** 2) if hm > 0 else 22.0
        if bmi > 26:
            shoe_cats = sorted(shoe_cats, key=lambda c: 0 if c in ("膝关节", "动作稳定性") else 1)
    for cat in shoe_cats:
        for sf in SHOE_FEATURES:
            if sf["feature"] in seen_s:
                continue
            if cat in sf["match_categories"] and len(shoes) < MAX_S:
                seen_s.add(sf["feature"])
                top_model = sf.get("models", [])[:1]
                shoes.append({"feature": sf["feature"], "desc": sf["desc"], "reason": sf["reason"], "models": top_model})
        if len(shoes) >= MAX_S:
            break

    return {"protectors": protectors, "shoes": shoes}
