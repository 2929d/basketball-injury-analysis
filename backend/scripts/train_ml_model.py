"""NBA伤病风险ML模型 - 基于真实伤病数据训练。

方法: 用前半赛季(10-12月)伤病统计作为特征, 预测后半赛季(1-4月)是否严重受伤。
模型: 逻辑回归(numpy实现, 无需lightgbm/sklearn) + 特征重要性分析。
数据: backend/data/nba_injuries/nba_injuries_2025-26_full_season.csv (19827条)
"""
from __future__ import annotations
import csv
import json
import numpy as np
from pathlib import Path
from collections import defaultdict
from datetime import datetime

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "nba_injuries" / "nba_injuries_2025-26_full_season.csv"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "nba_injuries"

# 伤病部位关键词
BODY_PARTS = {
    'knee': ['knee', 'acl', 'meniscus', 'patella', 'meniscal'],
    'ankle': ['ankle', 'achilles'],
    'back': ['back', 'spine', 'lumbar'],
    'hamstring': ['hamstring', 'quad', 'thigh'],
    'foot': ['foot', 'toe', 'heel'],
    'hand': ['hand', 'finger', 'wrist', 'thumb'],
    'hip': ['hip', 'groin'],
    'concussion': ['concussion', 'head'],
    'illness': ['illness', 'flu', 'covid', 'surgery', 'recovery'],
}


def parse_reason(reason: str) -> list[str]:
    """从reason字段提取伤病部位。"""
    reason_lower = (reason or '').lower()
    parts = []
    for part, keywords in BODY_PARTS.items():
        if any(kw in reason_lower for kw in keywords):
            parts.append(part)
    return parts if parts else ['other']


def extract_features(records: list[dict]) -> dict[str, dict]:
    """按球员+时间段提取特征。"""
    player_data = defaultdict(lambda: {'first': [], 'second': []})

    for r in records:
        name = r['player_name']
        date = r['report_date']
        status = r['current_status']
        parts = parse_reason(r.get('reason', ''))

        # 按日期分前后半赛季
        if date <= '2025-12-31':
            player_data[name]['first'].append({
                'date': date, 'status': status, 'parts': parts
            })
        else:
            player_data[name]['second'].append({
                'date': date, 'status': status, 'parts': parts
            })

    return player_data


def build_dataset(player_data: dict) -> tuple[np.ndarray, np.ndarray, list[str], list[str]]:
    """构建ML数据集: 特征 + 标签 + 特征名 + 球员名。"""
    feature_names = [
        '前半赛季伤病总次数',
        '前半赛季Out次数',
        '前半赛季Questionable次数',
        '前半赛季Out占比',
        '前半赛季膝伤次数',
        '前半赛季踝伤次数',
        '前半赛季背伤次数',
        '前半赛季不同伤病类型数',
        '前半赛季伤病天数跨度',
        '前半赛季同部位复发次数',
    ]

    X_list, y_list, names = [], [], []

    for name, data in player_data.items():
        first = data['first']
        second = data['second']
        if len(first) < 1:
            continue  # 前半赛季无伤病记录的球员跳过(无法提取特征)

        # 特征
        total = len(first)
        out_count = sum(1 for r in first if r['status'] == 'Out')
        ques_count = sum(1 for r in first if r['status'] == 'Questionable')
        out_ratio = out_count / total if total > 0 else 0

        all_parts = [p for r in first for p in r['parts']]
        knee_count = all_parts.count('knee')
        ankle_count = all_parts.count('ankle')
        back_count = all_parts.count('back')
        unique_types = len(set(all_parts))

        dates = sorted([r['date'] for r in first])
        if len(dates) >= 2:
            d1 = datetime.strptime(dates[0], '%Y-%m-%d')
            d2 = datetime.strptime(dates[-1], '%Y-%m-%d')
            duration = (d2 - d1).days
        else:
            duration = 0

        part_counts = defaultdict(int)
        for p in all_parts:
            part_counts[p] += 1
        recurrence = sum(1 for c in part_counts.values() if c > 1)

        features = [total, out_count, ques_count, out_ratio,
                    knee_count, ankle_count, back_count,
                    unique_types, duration, recurrence]

        # 标签: 后半赛季Out天数 > 10天 = 高风险(1)
        second_out = sum(1 for r in second if r['status'] == 'Out')
        label = 1 if second_out > 10 else 0

        X_list.append(features)
        y_list.append(label)
        names.append(name)

    X = np.array(X_list, dtype=float)
    y = np.array(y_list, dtype=float)
    return X, y, feature_names, names


def train_logistic_regression(X: np.ndarray, y: np.ndarray, lr=0.01, epochs=1000):
    """numpy实现逻辑回归训练。"""
    n, d = X.shape
    # 标准化
    mean = X.mean(axis=0)
    std = X.std(axis=0) + 1e-8
    X_norm = (X - mean) / std

    # 加偏置项
    X_bias = np.c_[np.ones(n), X_norm]
    w = np.zeros(d + 1)

    for epoch in range(epochs):
        z = X_bias @ w
        p = 1 / (1 + np.exp(-np.clip(z, -30, 30)))
        grad = X_bias.T @ (p - y) / n
        w -= lr * grad

    return w, mean, std


def evaluate(X, y, w, mean, std):
    """评估模型。"""
    X_norm = (X - mean) / std
    X_bias = np.c_[np.ones(len(X)), X_norm]
    p = 1 / (1 + np.exp(-np.clip(X_bias @ w, -30, 30)))
    pred = (p > 0.5).astype(float)

    accuracy = (pred == y).mean()
    tp = ((pred == 1) & (y == 1)).sum()
    fp = ((pred == 1) & (y == 0)).sum()
    fn = ((pred == 0) & (y == 1)).sum()
    tn = ((pred == 0) & (y == 0)).sum()

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    return {
        'accuracy': round(float(accuracy), 4),
        'precision': round(float(precision), 4),
        'recall': round(float(recall), 4),
        'f1': round(float(f1), 4),
        'tp': int(tp), 'fp': int(fp), 'fn': int(fn), 'tn': int(tn),
        'avg_prediction': round(float(p.mean()), 4),
    }


def feature_importance(w, mean, std, feature_names):
    """计算特征重要性(类似SHAP的简化版)。"""
    # 标准化后的权重 = 特征重要性
    weights = w[1:]  # 去掉偏置
    importance = np.abs(weights)
    total = importance.sum() + 1e-8
    pct = importance / total * 100

    result = []
    for i, name in enumerate(feature_names):
        direction = '↑风险' if weights[i] > 0 else '↓风险'
        result.append({
            'feature': name,
            'weight': round(float(weights[i]), 4),
            'importance_pct': round(float(pct[i]), 2),
            'direction': direction,
        })
    result.sort(key=lambda x: x['importance_pct'], reverse=True)
    return result


def main():
    # 1. 加载数据
    with open(DATA_PATH, encoding='utf-8') as f:
        records = list(csv.DictReader(f))
    print(f"加载伤病记录: {len(records)} 条")

    # 2. 提取特征
    player_data = extract_features(records)
    print(f"有前半赛季伤病记录的球员: {len(player_data)} 个")

    # 3. 构建数据集
    X, y, feat_names, names = build_dataset(player_data)
    print(f"ML数据集: {X.shape[0]} 样本, {X.shape[1]} 特征")
    print(f"标签分布: 高风险(后半赛季Out>10天)={int(y.sum())} ({y.mean()*100:.1f}%), 低风险={int((1-y).sum())}")

    # 4. 训练(5折交叉验证)
    n = len(y)
    indices = np.random.RandomState(42).permutation(n)
    fold_size = n // 5
    all_metrics = []
    all_importances = []

    for fold in range(5):
        test_idx = indices[fold * fold_size:(fold + 1) * fold_size]
        train_idx = np.concatenate([indices[:fold * fold_size], indices[(fold + 1) * fold_size:]])

        X_train, y_train = X[train_idx], y[train_idx]
        X_test, y_test = X[test_idx], y[test_idx]

        w, mean, std = train_logistic_regression(X_train, y_train)
        metrics = evaluate(X_test, y_test, w, mean, std)
        imp = feature_importance(w, mean, std, feat_names)
        all_metrics.append(metrics)
        all_importances.append(imp)
        print(f"  Fold {fold+1}: acc={metrics['accuracy']:.3f} recall={metrics['recall']:.3f} f1={metrics['f1']:.3f}")

    # 5. 汇总
    avg_metrics = {k: round(np.mean([m[k] for m in all_metrics]), 4) for k in all_metrics[0]}
    avg_imp = {}
    for feat in feat_names:
        vals = [imp for fold_imp in all_importances for imp in fold_imp if imp['feature'] == feat]
        avg_imp[feat] = round(np.mean([v['importance_pct'] for v in vals]), 2)

    print(f"\n=== 5折交叉验证平均 ===")
    print(f"准确率: {avg_metrics['accuracy']:.4f} (论文基准: 0.7668)")
    print(f"精确率: {avg_metrics['precision']:.4f}")
    print(f"召回率: {avg_metrics['recall']:.4f}")
    print(f"F1:     {avg_metrics['f1']:.4f}")
    print(f"平均预测概率: {avg_metrics['avg_prediction']:.4f}")

    print(f"\n=== 特征重要性(类似SHAP) ===")
    sorted_imp = sorted(avg_imp.items(), key=lambda x: x[1], reverse=True)
    for feat, pct in sorted_imp:
        bar = '█' * int(pct / 2)
        print(f"  {feat:20s} {pct:5.1f}% {bar}")

    # 6. 保存结果
    result = {
        'model_type': 'logistic_regression_numpy',
        'data_source': 'NBA 2025-26赛季伤病数据(19827条)',
        'feature_count': len(feat_names),
        'sample_count': int(n),
        'label': '后半赛季Out天数>10天=高风险(1)',
        'label_distribution': {'high_risk': int(y.sum()), 'low_risk': int((1 - y).sum())},
        'cross_validation': '5-fold',
        'metrics': avg_metrics,
        'paper_baseline': 0.7668,
        'feature_importance': dict(sorted_imp),
        'honesty_note': '本模型用numpy实现逻辑回归(非LightGBM), 特征来自伤病历史(非体测数据)',
    }
    out_path = OUTPUT_DIR / "ml_model_result.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n结果保存: {out_path}")

    # 7. 用全量数据训练最终模型, 保存权重(供推理用)
    w_final, mean_final, std_final = train_logistic_regression(X, y)
    model_weights = {
        'weights': w_final.tolist(),
        'mean': mean_final.tolist(),
        'std': std_final.tolist(),
        'feature_names': feat_names,
        'feature_importance': dict(sorted_imp),
        'accuracy': avg_metrics['accuracy'],
        'paper_baseline': 0.7668,
        'label_definition': '后半赛季Out天数>10天=高风险(1)',
    }
    weights_path = OUTPUT_DIR / "ml_model_weights.json"
    with open(weights_path, 'w', encoding='utf-8') as f:
        json.dump(model_weights, f, ensure_ascii=False, indent=2)
    print(f"模型权重保存: {weights_path}")


if __name__ == '__main__':
    main()
