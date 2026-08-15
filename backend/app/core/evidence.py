"""学术依据模块 - 系统评估指标的学术参考来源。

提升系统的可信度与准确性: 每个指标都引用学术研究的标准阈值。
数据来源: 截图中的3篇2024年学术论文 + 领域经典研究。
"""
from __future__ import annotations

# ============ 参考文献(从截图整理) ============
REFERENCES = [
    {
        "id": 1,
        "title": "Using Interpretable Machine Learning to Predict Injury Risk Among Collegiate Male Basketball Players",
        "authors": "Zhang S, Li M, Shen J, Wang X, Chen Z",
        "journal": "Medicine & Science in Sports & Exercise",
        "year": 2024,
        "key": "LightGBM + SHAP 可解释机器学习, 基于专家知识指标识别男篮损伤风险",
    },
    {
        "id": 2,
        "title": "Comparing a Novel Smartphone Application vs The Kinect V2 for Assessing ACL Injury Risk",
        "authors": "Val Desrosiers K, et al.",
        "year": 2024,
        "key": "智能手机应用可替代 Kinect V2 评估 ACL 损伤风险, 准确性相当(本系统采用更便捷方案)",
    },
    {
        "id": 3,
        "title": "The Effects of Anterior-to-flight Perturbation on Lower Extremity Biomechanics During Drop Landing",
        "authors": "Yoke JP, DiDomenico A, Sennett S, Simpson K",
        "affiliation": "Temple University",
        "year": 2024,
        "key": "落地时前方扰动显著影响下肢生物力学, 增加 ACL 损伤风险",
    },
]

# ============ 指标依据(经典文献) ============
INDICATOR_BASIS = {
    "膝外翻 (valgus)": {
        "standard": ">10° 显著内扣, 增加 ACL 损伤风险约5倍",
        "ref": "Hewett TE, et al. (2005) AJSM — 膝外翻>10°是ACL损伤的独立预测因子",
    },
    "膝屈曲 (initial_contact_flexion)": {
        "standard": "30-50° 标准落地缓冲范围",
        "ref": "Podraza JT & White SC (2016) — 落地缓冲期膝屈曲30-50°最安全",
    },
    "躯干前倾 (forward_lean)": {
        "standard": "<30° 标准落地姿势, 减少膝/腰负荷",
        "ref": "Blackburn JT & Padua DA (2008) — 躯干过度前倾增加下肢关节负荷",
    },
    "躯干侧倾 (lateral_lean)": {
        "standard": "<8° 左右对称, 避免单侧负荷",
        "ref": "Hewett TE, et al. (2005) — 躯干侧倾与ACL损伤相关",
    },
    "膝角速度 (angular_velocity)": {
        "standard": ">500°/s 高速冲击, 提示缓冲不足",
        "ref": "Dempsey AR, et al. (2009) — 高速膝角速度增加关节冲击负荷",
    },
    "落地缓冲时间 (landing_buffer)": {
        "standard": ">150ms 充分缓冲, 减少膝关节冲击",
        "ref": "Zhang SN, et al. (2008) J Appl Biomech — 缓冲时间<100ms提示刚性落地",
    },
    "左右不对称 (bilateral_asymmetry)": {
        "standard": ">10% 双侧负荷不对称",
        "ref": "Zifchock RA, et al. (2008) — 左右不对称增加慢性损伤风险",
    },
}

# ============ 系统方法论(诚实声明) ============
# 注意: 本系统 NOT 使用 XGBoost/LightGBM/SHAP 等 ML 模型。
# 实际方法: MediaPipe Pose 姿态识别 + 运动生物力学规则评估(启发式阈值)。
# 论文 [1] Zhang 2024 的 LightGBM+SHAP 框架仅作为方法论参考,
# 本系统的阈值标准引用自经典运动医学文献(非论文的ML模型)。
# 如需真正的 ML 预测, 需额外收集体测数据并训练模型(见 ROADMAP)。
METHODOLOGY = "本系统方法(诚实声明): (1) MediaPipe Pose 姿态识别(33个关键点); " \
               "(2) 运动生物力学6维度规则评估(启发式阈值, 非ML模型); " \
               "(3) 个体因素调整(年龄/BMI/伤病史/疲劳度); " \
               "(4) 阈值标准引用自经典运动医学文献(Hewett/Podraza/Blackburn等)。 " \
               "注意: 本系统未使用XGBoost/SHAP, 论文[1]仅作为方法论参考。"

# ============ 升级路线图(如需真正ML系统) ============
ROADMAP = [
    "1. 收集体测数据: 30米冲刺/CMJ纵跳/敏捷测试等(论文[1]的输入特征)",
    "2. 收集真实受伤标签: 跟踪球员后续是否受伤(建立ground truth)",
    "3. 训练LightGBM模型: 用体测数据+视频特征预测损伤概率",
    "4. 集成SHAP: 解释每个特征对预测的贡献",
    "5. 回测验证: 与论文基准0.7668准确率对比",
    "6. 建立数据库: 存储球员档案+体测+视频+受伤标签",
]