"""
风险评估引擎。

基于生物力学特征, 用启发式阈值规则计算各部位风险评分(0-100)。
评分代表动作中潜在高风险特征的程度, 不等同于医学伤病诊断。

阈值参考运动医学文献的启发式取值(演示用途)。
"""
from __future__ import annotations

from typing import Optional

from ..config import RISK_HIGH_THRESHOLD, RISK_LOW_THRESHOLD
from ..knowledge.intervention import get_gear_recommendations, get_recommendations
from ..models.schemas import (
    AthleteInfo, BiomechanicsFeatures, RiskAssessmentResult, RiskItem, RiskLevel,
)


def _level(score: float) -> RiskLevel:
    if score < RISK_LOW_THRESHOLD:
        return RiskLevel.LOW
    if score < RISK_HIGH_THRESHOLD:
        return RiskLevel.MEDIUM
    return RiskLevel.HIGH


def _clip(x: float) -> float:
    return max(0.0, min(100.0, x))


def _linear(value: float, low: float, high: float) -> float:
    """将 value 在 [low, high] 区间线性映射到 [0, 100] 风险分。"""
    if high <= low:
        return 0.0
    return _clip((value - low) / (high - low) * 100.0)


def assess_knee(f: BiomechanicsFeatures) -> tuple[float, list[str]]:
    score = 0.0
    codes: list[str] = []
    # 膝内扣: clip后0-25°, >12°风险, 映射到10-30避免clip值满分
    valgus_s = _linear(max(f.knee.valgus_deg, 0.0), 10.0, 30.0)
    score = max(score, valgus_s)
    if f.knee.valgus_deg > 12.0:
        codes.append("valgus")
    # 初次触地屈曲不足: <15° 高风险
    ic_s = _linear(25.0 - f.knee.initial_contact_flexion_deg, 5.0, 20.0)
    score = max(score, ic_s)
    if f.knee.initial_contact_flexion_deg < 20.0:
        codes.append("flexion_insufficient")
    # 左右差异: clip后0-30°, >15°风险
    asym_s = _linear(f.knee.left_right_diff_deg, 10.0, 25.0)
    score = max(score, asym_s)
    if f.knee.left_right_diff_deg > 15.0:
        codes.append("asymmetry")
    # 角速度过大(已平滑+clip 400)
    if f.knee.angular_velocity > 300.0:
        codes.append("angular_velocity")
        score = max(score, _linear(f.knee.angular_velocity, 200.0, 500.0))
    if not codes:
        codes.append("valgus")
    return score, codes


def assess_ankle(f: BiomechanicsFeatures) -> tuple[float, list[str]]:
    score = 0.0
    codes: list[str] = []
    if f.ankle.dorsiflexion_deg < 15.0:
        codes.append("dorsiflexion")
        score = max(score, _linear(20.0 - f.ankle.dorsiflexion_deg, 5.0, 15.0))
    # 踝晃动变异系数, 映射0.6-1.8避免clip值满分
    if f.ankle.ankle_sway_deg > 0.6:
        codes.append("instability")
        score = max(score, _linear(f.ankle.ankle_sway_deg, 0.6, 1.8))
    if abs(f.ankle.left_right_contact_time_diff_ms) > 50.0:
        codes.append("asymmetry")
        score = max(score, _linear(abs(f.ankle.left_right_contact_time_diff_ms), 30.0, 120.0))
    if not codes:
        codes.append("instability")
    return score, codes


def assess_hip(f: BiomechanicsFeatures) -> tuple[float, list[str]]:
    score = 0.0
    codes: list[str] = []
    # 髋屈曲现为落地阶段最大值, 正常30-60°, <20°为风险
    if f.hip.flexion_deg < 20.0:
        codes.append("flexion")
        score = max(score, _linear(25.0 - f.hip.flexion_deg, 5.0, 20.0))
    if f.hip.pelvic_tilt_deg > 10.0:
        codes.append("pelvic")
        score = max(score, _linear(f.hip.pelvic_tilt_deg, 6.0, 15.0))
    if f.hip.stability < 0.45:
        codes.append("stability")
        score = max(score, _linear(0.6 - f.hip.stability, 0.2, 0.35))
    if not codes:
        codes.append("stability")
    return score, codes


def assess_trunk(f: BiomechanicsFeatures) -> tuple[float, list[str]]:
    score = 0.0
    codes: list[str] = []
    if f.trunk.lateral_lean_deg > 15.0:
        codes.append("lateral_lean")
        score = max(score, _linear(f.trunk.lateral_lean_deg, 12.0, 35.0))
    if f.trunk.forward_lean_deg > 38.0:   # 提高阈值: 篮球中前倾常见(捡球/找球/防守), 仅极端前倾算风险
        codes.append("forward_lean")
        score = max(score, _linear(f.trunk.forward_lean_deg, 35.0, 50.0))
    if f.trunk.com_lateral_displacement > 0.05:
        codes.append("com")
        score = max(score, _linear(f.trunk.com_lateral_displacement, 0.04, 0.12))
    if not codes:
        codes.append("com")
    return score, codes


def assess_asymmetry(f: BiomechanicsFeatures) -> tuple[float, list[str]]:
    score = _linear(f.overall.bilateral_asymmetry, 0.35, 0.7)
    return score, ["general"]


def assess_stability(f: BiomechanicsFeatures) -> tuple[float, list[str]]:
    score = 0.0
    codes: list[str] = []
    # 缓冲时间过短才判风险(过长可能是阶段划分误差,不判)
    if f.overall.landing_buffer_time_ms < 150.0:
        codes.append("buffer")
        score = max(score, _linear(200.0 - f.overall.landing_buffer_time_ms, 50.0, 180.0))
    if f.overall.stabilization_time_ms > 1000.0:
        codes.append("stabilization")
        score = max(score, _linear(f.overall.stabilization_time_ms, 700.0, 2000.0))
    if not codes:
        codes.append("buffer")
    return score, codes


# 分项权重(综合评分用)
WEIGHTS = {
    "膝关节": 0.28,
    "踝关节": 0.18,
    "髋关节": 0.15,
    "躯干控制": 0.15,
    "左右不对称": 0.12,
    "动作稳定性": 0.12,
}


def _apply_athlete_factors(items: list[RiskItem], athlete: AthleteInfo) -> None:
    """根据运动员信息对各风险维度做针对性调整(原地修改 items 的 score/level)。

    记录每个调整明细到 athlete_adjustments, 供前端展示个体因素影响。
    利用: BMI/性别/年龄/惯用腿/训练频率/既往伤病/当前疼痛/疲劳程度
    """
    height_m = athlete.height_cm / 100.0
    bmi = athlete.weight_kg / (height_m ** 2) if height_m > 0 else 22.0
    gender = athlete.gender.value if hasattr(athlete.gender, "value") else str(athlete.gender)
    injury = (athlete.injury_history or "").lower().strip()

    # 伤病史关键词 -> 对应风险部位
    injury_cats: set[str] = set()
    kw_map = {"膝": "膝关节", "半月板": "膝关节", "十字": "膝关节", "acl": "膝关节",
              "踝": "踝关节", "扭脚": "踝关节",
              "髋": "髋关节", "腰": "躯干控制", "背": "躯干控制"}
    for kw, cat in kw_map.items():
        if kw in injury:
            injury_cats.add(cat)

    for it in items:
        adj = 0.0
        adjs: list[dict] = []
        # BMI 偏高 → 膝/踝关节负荷加重
        if bmi > 26 and it.category in ("膝关节", "踝关节"):
            d = round(min((bmi - 26) * 2.5, 10.0), 1)
            adj += d
            adjs.append({"factor": f"BMI {bmi:.1f}", "delta": d, "reason": "BMI偏高，下肢关节负荷加重"})
        # 女性 → 膝关节 ACL 损伤高发
        if gender == "female" and it.category == "膝关节":
            adj += 5.0
            adjs.append({"factor": "女性", "delta": 5.0, "reason": "女性ACL损伤风险显著高于男性"})
        # 年龄: >30 整体退化风险; <16 发育期膝风险
        if athlete.age > 30:
            d = round(min((athlete.age - 30) * 0.8, 8.0), 1)
            adj += d
            adjs.append({"factor": f"年龄{athlete.age}岁", "delta": d, "reason": "30岁以上组织弹性下降，恢复变慢"})
        elif athlete.age < 16 and it.category == "膝关节":
            adj += 3.0
            adjs.append({"factor": f"年龄{athlete.age}岁", "delta": 3.0, "reason": "发育期膝关节生长板未闭合，损伤风险高"})
        # 训练频率: 低频动作不熟练; 高频疲劳积累
        if athlete.weekly_training_freq < 2:
            adj += 5.0
            adjs.append({"factor": f"训练{athlete.weekly_training_freq}次/周", "delta": 5.0, "reason": "训练频率低，动作模式不熟练"})
        elif athlete.weekly_training_freq > 8 and it.category in ("动作稳定性", "左右不对称"):
            adj += 5.0
            adjs.append({"factor": f"训练{athlete.weekly_training_freq}次/周", "delta": 5.0, "reason": "训练频率高，疲劳积累影响稳定性"})
        # 惯用腿: 单侧惯用产生生理性不对称, 降低左右不对称风险判定
        if it.category == "左右不对称" and athlete.dominant_leg in ("右腿", "左腿"):
            adj -= 6.0
            adjs.append({"factor": f"惯用{athlete.dominant_leg}", "delta": -6.0, "reason": "单侧惯用腿产生生理性不对称，属正常现象"})
        # 既往伤病: 匹配部位加权
        if injury and it.category in injury_cats:
            adj += 8.0
            adjs.append({"factor": "既往伤病", "delta": 8.0, "reason": f"伤病史涉及{it.category}，再损伤风险高"})
        # 当前疼痛: 整体轻度加, 伤病史同部位额外加
        if athlete.current_pain:
            adj += 3.0
            adjs.append({"factor": "当前疼痛", "delta": 3.0, "reason": "存在疼痛症状，组织可能处于应激状态"})
            if it.category in injury_cats:
                adj += 4.0
                adjs.append({"factor": "疼痛+伤病同部位", "delta": 4.0, "reason": "疼痛部位与伤病史一致，风险显著升高"})
        # 高疲劳: 影响稳定性与对称性
        if athlete.fatigue_level >= 7 and it.category in ("动作稳定性", "左右不对称"):
            d = round(min((athlete.fatigue_level - 6) * 2.0, 8.0), 1)
            adj += d
            adjs.append({"factor": f"疲劳{athlete.fatigue_level}/10", "delta": d, "reason": "疲劳程度高，神经肌肉控制下降"})

        if adj != 0.0:
            it.score = round(_clip(it.score + adj), 1)
            it.level = _level(it.score)
        it.athlete_adjustments = adjs


def assess(
    features: BiomechanicsFeatures,
    athlete: Optional[AthleteInfo] = None,
) -> RiskAssessmentResult:
    """主入口: 计算综合风险评分与各分项。"""
    assessors = [
        ("膝关节", assess_knee),
        ("踝关节", assess_ankle),
        ("髋关节", assess_hip),
        ("躯干控制", assess_trunk),
        ("左右不对称", assess_asymmetry),
        ("动作稳定性", assess_stability),
    ]

    items: list[RiskItem] = []
    weighted_sum = 0.0
    for cat, fn in assessors:
        score, codes = fn(features)
        causes, tips, exercises = get_recommendations(cat, codes)
        items.append(RiskItem(
            category=cat,
            score=round(score, 1),
            level=_level(score),
            main_causes=causes,
            recommendations=tips,
            exercises=exercises,
            cause_codes=codes,
            base_score=round(score, 1),
        ))
        weighted_sum += score * WEIGHTS[cat]

    overall = _clip(weighted_sum)

    # 运动员信息对各风险维度做针对性调整(BMI/性别/年龄/惯用腿/训练频率/伤病/疲劳)
    if athlete:
        _apply_athlete_factors(items, athlete)
        weighted_sum = sum(it.score * WEIGHTS[it.category] for it in items)
        overall = _clip(weighted_sum)

    # 高风险动作模式概率 = 综合分/100 的 logistic
    prob = round(overall / 100.0, 2)

    level = _level(overall)

    # 汇总摘要
    high_cats = [it.category for it in items if it.level == RiskLevel.HIGH]
    if high_cats:
        summary = f"本次动作在高风险动作模式上得分偏高, 主要风险集中在{'、'.join(high_cats)}。建议优先针对性训练。"
    elif overall >= RISK_LOW_THRESHOLD:
        summary = "本次动作存在一定风险特征, 建议关注评分较高的部位并做预防性训练。"
    else:
        summary = "本次动作整体风险较低, 动作模式较为合理, 建议保持。"

    # 运动员因素提示(让用户看到录入信息如何影响评估)
    if athlete:
        factors: list[str] = []
        if athlete.fatigue_level >= 7:
            factors.append(f"疲劳程度较高({athlete.fatigue_level}/10),动作稳定性下降")
        if athlete.current_pain:
            factors.append("存在疼痛症状,建议降低训练强度")
        inj = (athlete.injury_history or "").lower().strip()
        if inj:
            icats = {c for kw, c in {"膝": "膝关节", "踝": "踝关节", "髋": "髋关节", "腰": "躯干控制"}.items() if kw in inj}
            if icats:
                factors.append(f"既往伤病部位({'、'.join(icats)})已加权评估")
        hm = athlete.height_cm / 100.0
        bmi = athlete.weight_kg / (hm ** 2) if hm > 0 else 22.0
        if bmi > 26:
            factors.append(f"BMI偏高({bmi:.1f})增加下肢关节负荷")
        if athlete.weekly_training_freq < 2:
            factors.append("训练频率偏低,动作可能不熟练")
        if athlete.weekly_training_freq > 8:
            factors.append("训练频率偏高,注意疲劳积累")
        if factors:
            summary += f" 个体因素提示: {'; '.join(factors)}。"

    # 护具与球鞋推荐(基于中/高风险部位)
    gear = get_gear_recommendations(items, athlete)

    # 大白话总结(面向普通人)
    plain = _build_plain_summary(overall, level, items, athlete, gear)
    # 动作要领大白话(腿怎么弯弯多少)
    guide = _build_action_guide(features)
    # 个性化训练计划
    plan = _build_training_plan(items)

    return RiskAssessmentResult(
        overall_score=round(overall, 1),
        overall_level=level,
        high_risk_action_probability=prob,
        items=items,
        summary=summary,
        plain_summary=plain,
        action_guide=guide,
        training_plan=plan,
        gear_recommendations=gear,
    )


def _build_plain_summary(overall: float, level, items, athlete, gear) -> str:
    """生成面向普通人的大白话总结。"""
    parts: list[str] = []

    # 1. 整体评价
    level_text = {"高风险": "高风险，需要重点关注", "中风险": "中等风险，有一些可以改进", "低风险": "低风险，动作整体不错"}
    lv = level.value if hasattr(level, "value") else str(level)
    parts.append(f"【整体评价】\n你这次动作的综合风险评分是 {overall:.1f} 分（满分100），属于{level_text.get(lv, lv)}。")

    # 2. 主要问题
    high = [it for it in items if it.level == RiskLevel.HIGH]
    mid = [it for it in items if it.level == RiskLevel.MEDIUM]
    cat_map = {
        "膝关节": "落地时膝盖表现异常（如内扣、弯曲不够）",
        "踝关节": "落地时脚踝不够稳，有晃动",
        "髋关节": "髋部稳定性不足，重心控制差",
        "躯干控制": "身体躯干控制不够好，有侧倾或前倾",
        "左右不对称": "左右两侧动作不对称，一侧承重更多",
        "动作稳定性": "落地后动作不够稳定，需要更长时间平衡",
    }
    if high:
        lines = ["【主要问题】", f"这次动作中，你的{ '、'.join(it.category for it in high) }存在较高风险："]
        for it in high:
            lines.append(f"  • {it.category}：{cat_map.get(it.category, '存在风险')}")
        parts.append("\n".join(lines))
    elif mid:
        parts.append(f"【主要问题】\n这次动作没有特别严重的风险，但{ '、'.join(it.category for it in mid) }有中等风险，可以留意改进。")

    # 3. 个体因素
    if athlete:
        factors = []
        if athlete.fatigue_level >= 7:
            factors.append(f"疲劳程度较高（{athlete.fatigue_level}/10），会影响动作稳定性")
        if athlete.current_pain:
            factors.append("存在疼痛症状，身体可能处于应激状态")
        inj = (athlete.injury_history or "").strip()
        if inj:
            factors.append(f"有既往伤病史（{inj}），相关部位需要额外保护")
        hm = athlete.height_cm / 100.0
        bmi = athlete.weight_kg / (hm ** 2) if hm > 0 else 22.0
        if bmi > 26:
            factors.append(f"BMI偏高（{bmi:.1f}），增加了下肢关节负担")
        if athlete.weekly_training_freq > 8:
            factors.append("训练频率较高，注意疲劳积累")
        elif athlete.weekly_training_freq < 2:
            factors.append("训练频率较低，动作可能不够熟练")
        if factors:
            parts.append("【你的个体情况】\n" + "；".join(factors) + "。这些因素已纳入风险评估。")

    # 4. 建议(球鞋推荐见装备推荐区, 不重复)
    recs = []
    protectors = gear.get("protectors", [])
    if protectors:
        recs.append("佩戴护具：" + "、".join(p["name"] for p in protectors[:2]))
    if high:
        tips = high[0].recommendations[:2]
        if tips:
            recs.append("训练重点：" + "；".join(tips))
    recs.append("建议多次分析对比，观察动作改善趋势")
    if recs:
        parts.append("【建议】\n" + "\n".join(f"  • {r}" for r in recs))

    return "\n\n".join(parts)


def _build_action_guide(features) -> str:
    """生成动作要领大白话指导(老百姓能看懂: 腿怎么弯、弯多少)。"""
    if not features:
        return ""
    parts = []
    f = features

    # 膝盖弯曲
    kf = f.knee.initial_contact_flexion_deg
    if kf < 30:
        knee_msg = f"你落地时膝盖只弯了{kf:.0f}°，太直了！要弯到30-50°，就像往后坐椅子的感觉，这样才能缓冲。别直挺挺地戳下去！"
    elif kf > 55:
        knee_msg = f"你落地时膝盖弯了{kf:.0f}°，弯得有点多，30-50°就够了，弯太多膝盖压力大。"
    else:
        knee_msg = f"你落地时膝盖弯了{kf:.0f}°，这个弯曲度不错，继续保持'往后坐椅子'的感觉。"
    parts.append(f"【膝盖要弯多少度】\n{knee_msg}")

    # 膝盖内扣
    val = f.knee.valgus_deg
    if val > 10:
        val_msg = f"你的膝盖往里扣了{val:.0f}°，这个很危险！膝盖要和脚尖一个方向，不能往里撇。想象膝盖中间夹着个球，别把它夹扁了。"
    elif val > 5:
        val_msg = f"你的膝盖有点往里扣({val:.0f}°)，注意要对准脚尖方向，别往里撇。"
    else:
        val_msg = f"你的膝盖内扣{val:.0f}°，基本正常。记住落地时膝盖对准脚尖，别往里撇。"
    parts.append(f"【膝盖不能往里扣】\n{val_msg}")

    # 身体前倾
    lean = f.trunk.forward_lean_deg
    if lean > 35:
        lean_msg = f"你身体前倾了{lean:.0f}°，太往前了！落地时身体要尽量直，别像鞠躬一样往前栽，不然膝盖和腰都受罪。"
    elif lean > 25:
        lean_msg = f"你身体前倾{lean:.0f}°，稍微有点多，尽量保持直立，前倾不超过30°。"
    else:
        lean_msg = f"你身体前倾{lean:.0f}°，姿势不错。记住落地时身体要直，别往前栽。"
    parts.append(f"【身体别往前栽】\n{lean_msg}")

    # 身体侧倾
    lat = f.trunk.lateral_lean_deg
    if abs(lat) > 8:
        lat_msg = f"你身体往一侧歪了{abs(lat):.0f}°，要注意！左右要对称，别往一边倒，容易崴脚。"
    else:
        lat_msg = f"你身体左右倾斜{abs(lat):.0f}°，基本正常。"
    parts.append(f"【身体别往一边歪】\n{lat_msg}")

    # 缓冲
    buf = f.overall.landing_buffer_time_ms
    if buf < 100:
        buf_msg = f"你落地缓冲只有{buf:.0f}毫秒，太快了！就像石头砸地上。要'软着陆'，前脚掌先着地慢慢过渡到全脚掌，别硬邦邦地砸下去。"
    else:
        buf_msg = f"你落地缓冲{buf:.0f}毫秒，还不错。记住要'软着陆'，别硬砸。"
    parts.append(f"【怎么落地才安全】\n{buf_msg}")

    return "\n\n".join(parts)


def _build_training_plan(items: list[RiskItem]) -> list[dict]:
    """根据风险结果生成个性化7天训练计划。"""
    lib = {
        "膝关节": [
            {"name": "靠墙静蹲", "dose": "3组×45秒", "purpose": "增强股四头肌，稳定膝关节"},
            {"name": "臀桥", "dose": "3组×15次", "purpose": "激活臀大肌，改善下肢力线"},
            {"name": "侧向蟹步走", "dose": "3组×12步", "purpose": "强化臀中肌，防止膝盖内扣"},
        ],
        "踝关节": [
            {"name": "单脚站立平衡", "dose": "3组×30秒", "purpose": "提高踝关节本体感觉"},
            {"name": "提踵", "dose": "3组×20次", "purpose": "增强小腿肌肉，稳定踝关节"},
        ],
        "髋关节": [
            {"name": "蚌式开合", "dose": "3组×15次", "purpose": "强化髋外展肌群"},
            {"name": "髋关节灵活性绕环", "dose": "3组×10次", "purpose": "改善髋关节活动度"},
        ],
        "躯干控制": [
            {"name": "平板支撑", "dose": "3组×30秒", "purpose": "强化核心稳定性"},
            {"name": "死虫式", "dose": "3组×10次", "purpose": "训练核心抗伸展能力"},
            {"name": "鸟狗式", "dose": "3组×12次", "purpose": "提升核心抗旋转能力"},
        ],
        "左右不对称": [
            {"name": "单腿深蹲", "dose": "3组×8次/侧", "purpose": "纠正左右力量差异"},
            {"name": "分腿蹲", "dose": "3组×10次/侧", "purpose": "平衡双侧发力"},
        ],
        "动作稳定性": [
            {"name": "落地稳定练习", "dose": "3组×10次", "purpose": "训练落地缓冲控制"},
            {"name": "单脚跳定住", "dose": "3组×8次/侧", "purpose": "提升动态稳定性"},
        ],
    }
    high_cats = [it.category for it in items if it.level == RiskLevel.HIGH]
    mid_cats = [it.category for it in items if it.level == RiskLevel.MEDIUM]

    def pick(cats, n):
        out = []
        for c in cats:
            out.extend(lib.get(c, [])[:n])
        return out

    primary = pick(high_cats, 3) if high_cats else pick(mid_cats[:2], 2)
    secondary = pick(mid_cats, 2)
    core = lib.get("躯干控制", [])[:2]
    land = lib.get("动作稳定性", [])[:2]

    return [
        {"day": "周一", "focus": "力量强化", "exercises": (primary or core)[:3]},
        {"day": "周二", "focus": "核心稳定", "exercises": core},
        {"day": "周三", "focus": "力量强化", "exercises": (primary or core)[:3]},
        {"day": "周四", "focus": "灵活性恢复", "exercises": [
            {"name": "泡沫轴放松", "dose": "15分钟", "purpose": "促进肌肉恢复"},
            {"name": "静态拉伸", "dose": "10分钟", "purpose": "改善柔韧性"},
        ]},
        {"day": "周五", "focus": "弱点补强", "exercises": (secondary or core)[:3]},
        {"day": "周六", "focus": "动作模拟", "exercises": land + [
            {"name": "跳跃落地练习", "dose": "3组×8次", "purpose": "强化落地技术"},
        ]},
        {"day": "周日", "focus": "休息恢复", "exercises": [
            {"name": "完全休息或轻度活动", "dose": "散步/游泳20分钟", "purpose": "主动恢复"},
        ]},
    ]
