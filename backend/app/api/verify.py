"""可信度验证路由 - 让系统透明、可验证、诚实。

提供3个接口:
- /v1/validate: 系统真实状态自检(用户建议的)
- /v1/methodology: 方法论详细说明
- /v1/verify-guide: 如何验证本系统指南
"""
from __future__ import annotations
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api")

RESULT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "results"


class ValidateResult(BaseModel):
    """系统自检结果(诚实声明)。"""
    model_loaded: bool
    method: str
    feature_source: str
    ml_framework: str
    shap_enabled: bool
    feature_count: int
    feature_names: list
    baseline_accuracy: float | None
    current_avg_prediction: float | None
    data_source: str
    honesty_statement: str


@router.get("/v1/validate", response_model=ValidateResult)
def validate_system():
    """系统真实状态自检 - 诚实输出系统是否真用ML模型。"""
    # 检查是否有ML模型文件(.pkl/.joblib 或 ml_model_weights.json)
    backend_dir = Path(__file__).resolve().parent.parent.parent
    ml_files = list(backend_dir.rglob("*.pkl")) + list(backend_dir.rglob("*.joblib"))
    ml_weights_path = backend_dir / "data" / "nba_injuries" / "ml_model_weights.json"
    model_loaded = len(ml_files) > 0 or ml_weights_path.exists()
    ml_type = "rule_based_heuristic" if not model_loaded else "logistic_regression_ml"

    # ML模型准确率
    ml_accuracy = None
    if ml_weights_path.exists():
        try:
            with open(ml_weights_path, encoding='utf-8') as f:
                mw = json.load(f)
            ml_accuracy = mw.get('accuracy')
        except Exception:
            pass

    # 计算当前数据集平均风险概率
    avg_pred = None
    scores = []
    if RESULT_DIR.exists():
        for f in RESULT_DIR.glob("*_result.json"):
            try:
                d = json.loads(f.read_text(encoding="utf-8"))
                if "risk" in d and "overall_score" in d.get("risk", {}):
                    scores.append(d["risk"]["overall_score"])
            except Exception:
                pass
    if scores:
        avg_pred = round(sum(scores) / len(scores), 1)

    return ValidateResult(
        model_loaded=model_loaded,
        method=ml_type,
        feature_source="video_pose_analysis_mediapipe + nba_injury_history",
        ml_framework="numpy_logistic_regression" if model_loaded else "none",
        shap_enabled=False,
        feature_count=7,
        feature_names=[
            "膝外翻(valgus)", "膝屈曲(flexion)", "躯干前倾(forward_lean)",
            "躯干侧倾(lateral_lean)", "膝角速度(angular_velocity)",
            "落地缓冲时间(landing_buffer)", "左右不对称(bilateral_asymmetry)"
        ],
        baseline_accuracy=ml_accuracy,
        current_avg_prediction=avg_pred,
        data_source="local_video_analysis + nba_injury_data(19827条)",
        honesty_statement=(
            "视频分析部分: 规则评估(启发式阈值)。"
            "ML预测模块: 逻辑回归(基于NBA伤病数据训练, 准确率{:.2f}%, 论文基准76.68%)。"
            "见 /api/v1/ml/predict。".format(ml_accuracy if ml_accuracy else 0)
        )
    )


@router.get("/v1/methodology")
def methodology():
    """方法论详细说明 - 透明=可信。"""
    from ..core import evidence as ev
    return {
        "system_type": "视频姿态分析+规则评估(非ML模型)",
        "pipeline": [
            "1. 用户上传运动视频(如跳跃落地)",
            "2. Google MediaPipe Pose 识别33个身体关键点",
            "3. Savitzky-Golay滤波平滑关键点轨迹",
            "4. 计算生物力学特征(膝/髋/踝/躯干/整体)",
            "5. 规则评估: 用线性插值(_linear)+阈值判断计算6维度风险评分",
            "6. 个体因素调整(年龄/BMI/伤病史/疲劳度)",
            "7. 输出风险评分(0-100)+等级+建议"
        ],
        "what_we_do": [
            "✅ 视频姿态识别(MediaPipe, 真实的ML, 但用于姿态识别非损伤预测)",
            "✅ 生物力学特征计算(膝角/躯干角/缓冲时间等, 基于真实关键点)",
            "✅ 规则评估(阈值来自学术文献, 但非ML模型)",
            "✅ 逐帧分析(每帧特征时间序列)",
            "✅ 个性化训练计划(基于风险部位)",
            "✅ 诚实标注局限性"
        ],
        "what_we_do_NOT": [
            "❌ 未使用XGBoost/LightGBM预测损伤概率",
            "❌ 未集成SHAP解释性",
            "❌ 无批量回测功能",
            "❌ 无真实受伤标签数据",
            "❌ 无0.7668基准准确率验证",
            "❌ 不输入体测数据(冲刺/CMJ等)"
        ],
        "threshold_basis": ev.INDICATOR_BASIS,
        "references": ev.REFERENCES,
        "roadmap_to_ml": ev.ROADMAP,
        "limitation_statement": (
            "本系统是便捷的初步筛查工具, 不能替代: "
            "(1)专业运动医学医生诊断; "
            "(2)论文[1]的XGBoost ML预测模型(需体测数据+受伤标签)。"
            "如需真正ML预测, 见roadmap_to_ml。"
        )
    }


@router.get("/v1/verify-guide")
def verify_guide():
    """如何验证本系统 - 给用户的自查指南。"""
    return {
        "title": "如何验证本系统(用户自查指南)",
        "steps": [
            {
                "step": 1,
                "name": "验证数据校验",
                "how": "在前端录入极端值(如身高50cm/体重500kg), 系统应报错",
                "endpoint": "前端 Athlete 表单"
            },
            {
                "step": 2,
                "name": "验证模型真实性",
                "how": "访问 /v1/validate, model_loaded应为false, method=rule_based_heuristic",
                "endpoint": "GET /api/v1/validate"
            },
            {
                "step": 3,
                "name": "查看方法论",
                "how": "访问 /v1/methodology, 查看系统真实pipeline和what_we_do_NOT",
                "endpoint": "GET /api/v1/methodology"
            },
            {
                "step": 4,
                "name": "验证数据源",
                "how": "检查 data/results/*.json, 确认是本地视频分析结果, 非论文数据",
                "endpoint": "data/results/ 目录"
            },
            {
                "step": 5,
                "name": "验证学术依据",
                "how": "报告页'学术依据'卡片查看7个指标的文献引用",
                "endpoint": "报告页"
            }
        ],
        "honesty_disclaimer": (
            "本系统已诚实标注: 视频分析部分是规则评估。"
            "ML预测模块(基于NBA伤病数据训练)已集成, 见 /api/v1/ml/predict。"
        )
    }


# ============ ML预测模块(基于NBA伤病数据训练) ============
MODEL_WEIGHTS_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "nba_injuries" / "ml_model_weights.json"

_model_cache = None

def _load_model():
    global _model_cache
    if _model_cache is None and MODEL_WEIGHTS_PATH.exists():
        with open(MODEL_WEIGHTS_PATH, encoding='utf-8') as f:
            _model_cache = json.load(f)
    return _model_cache


class MLPredictRequest(BaseModel):
    """ML预测请求: 球员前半赛季伤病统计(10个特征)。"""
    total_injuries: int = 0        # 前半赛季伤病总次数
    out_count: int = 0             # 前半赛季Out次数
    questionable_count: int = 0    # 前半赛季Questionable次数
    out_ratio: float = 0.0         # 前半赛季Out占比(0-1)
    knee_injuries: int = 0         # 前半赛季膝伤次数
    ankle_injuries: int = 0        # 前半赛季踝伤次数
    back_injuries: int = 0         # 前半赛季背伤次数
    unique_types: int = 0          # 不同伤病类型数
    injury_duration: int = 0       # 伤病天数跨度
    recurrence: int = 0            # 同部位复发次数


@router.get("/v1/ml/info")
def ml_info():
    """ML模型信息。"""
    model = _load_model()
    if not model:
        return {"model_loaded": False, "message": "模型权重文件不存在, 请先运行 train_ml_model.py"}
    return {
        "model_loaded": True,
        "model_type": "logistic_regression_numpy",
        "data_source": "NBA 2025-26赛季伤病数据(19827条, 552球员)",
        "feature_count": len(model['feature_names']),
        "feature_names": model['feature_names'],
        "accuracy": model['accuracy'],
        "paper_baseline": model['paper_baseline'],
        "label_definition": model['label_definition'],
        "feature_importance": model['feature_importance'],
    }


@router.post("/v1/ml/predict")
def ml_predict(req: MLPredictRequest):
    """ML预测: 输入球员伤病历史 → 输出后半赛季损伤风险概率 + 特征贡献。"""
    model = _load_model()
    if not model:
        raise HTTPException(503, "模型未加载, 请先运行 train_ml_model.py")

    import math
    w = model['weights']
    mean = model['mean']
    std = model['std']
    feat_names = model['feature_names']

    # 构建特征向量
    x = [
        req.total_injuries, req.out_count, req.questionable_count,
        req.out_ratio, req.knee_injuries, req.ankle_injuries,
        req.back_injuries, req.unique_types, req.injury_duration, req.recurrence
    ]

    # 标准化
    x_norm = [(xi - m) / (s + 1e-8) for xi, m, s in zip(x, mean, std)]

    # 逻辑回归
    z = w[0]  # bias
    for i in range(len(x_norm)):
        z += w[i + 1] * x_norm[i]
    probability = 1 / (1 + math.exp(-max(-30, min(30, z))))

    # 特征贡献(类似SHAP: 权重×标准化值)
    contributions = []
    for i, name in enumerate(feat_names):
        contrib = w[i + 1] * x_norm[i]
        contributions.append({
            "feature": name,
            "value": x[i],
            "contribution": round(contrib, 4),
            "direction": "↑风险" if contrib > 0 else "↓风险",
            "importance_pct": model['feature_importance'].get(name, 0),
        })
    contributions.sort(key=lambda c: abs(c['contribution']), reverse=True)

    risk_level = "高风险" if probability > 0.5 else ("中风险" if probability > 0.3 else "低风险")

    return {
        "probability": round(probability, 4),
        "risk_level": risk_level,
        "model_type": "logistic_regression",
        "accuracy": model['accuracy'],
        "paper_baseline": model['paper_baseline'],
        "label_definition": model['label_definition'],
        "top_risk_factors": contributions[:5],
        "all_contributions": contributions,
        "honesty_note": "本模型基于NBA伤病历史数据训练(非体测数据), 准确率61.11%低于论文76.68%",
    }
