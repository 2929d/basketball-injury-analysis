# 🏀 基于计算机视觉的篮球运动损伤风险评估系统

> 通过普通摄像头/手机拍摄运动视频，利用人体姿态识别、运动轨迹分析、运动生物力学特征提取和风险评分模型，识别运动过程中潜在的高风险动作模式，给出风险等级、主要风险原因与针对性预防训练建议。

面向篮球运动中的**跳跃落地、单脚落地、急停、变向**动作，重点评估下肢运动损伤风险。

---

## ⚠️ 重要声明

本系统输出的是 **"高风险动作模式概率"** 与 **"运动损伤风险评分"**，**不是医学诊断结果**，也不直接等同于运动员未来真实发生伤病的概率。风险评估基于生物力学特征与启发式阈值规则，仅用于动作模式筛查与训练参考。

---

## 📌 目录

- [系统架构](#系统架构)
- [用户操作流程](#用户操作流程)
- [AI 分析管线](#ai-分析管线)
- [风险评估模型](#风险评估模型)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [API 接口](#api-接口)
- [目录结构](#目录结构)
- [操作演示](#操作演示)
- [局限性与未来工作](#局限性与未来工作)

---

## 系统架构

```mermaid
graph TB
    subgraph Frontend["🖥️ Web 前端 (React + Vite + TypeScript)"]
        Home["🏠 首页"]
        Athlete["📝 运动员信息录入"]
        Upload["📤 视频上传"]
        Analysis["⏳ 分析进度"]
        Report["📊 风险报告"]
        History["📜 历史记录"]
    end

    subgraph Backend["⚙️ Python 分析后端 (FastAPI)"]
        API["API 路由层"]
        Pipeline["分析管线编排"]
        Knowledge["干预知识库"]
    end

    subgraph Core["🔬 核心分析引擎"]
        Quality["视频质量检测"]
        Pose["姿态识别<br/>MediaPipe Pose"]
        Trajectory["轨迹提取<br/>Savitzky-Golay"]
        Phase["动作阶段划分"]
        Biomech["生物力学特征"]
        Risk["风险评估引擎"]
    end

    Home --> Athlete --> Upload --> Analysis --> Report
    Report --> History

    Upload -->|"POST /api/analysis/upload"| API
    Analysis -->|"GET /progress"| API
    Report -->|"GET /result"| API
    API --> Pipeline

    Pipeline --> Quality
    Quality -->|"合格"| Pose
    Quality -->|"不合格"| Reject["❌ 提示重新拍摄"]
    Pose --> Trajectory --> Phase --> Biomech --> Risk
    Risk --> Knowledge
    Knowledge --> Report

    style Frontend fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px
    style Backend fill:#e8f8f0,stroke:#06d6a0,stroke-width:2px
    style Core fill:#fff4e8,stroke:#ff6b35,stroke-width:2px
    style Reject fill:#fde8e8,stroke:#e24b4a,stroke-width:2px
```

## 用户操作流程

> 从打开系统到获取风险报告，完整操作只需 **5 步**：

```mermaid
flowchart LR
    Step1["① 进入首页<br/>点击「开始评估」"]
    Step2["② 填写运动员信息<br/>年龄/身高/体重/伤病史等"]
    Step3["③ 选择动作类型<br/>上传 5-15s 运动视频"]
    Step4["④ 等待 AI 分析<br/>自动完成 4 个阶段"]
    Step5["⑤ 查看风险报告<br/>雷达图/视频/建议"]

    Step1 --> Step2 --> Step3 --> Step4 --> Step5

    Step5 -->|"重新测试"| Step3
    Step5 -->|"前后对比"| Compare["📈 历史对比"]

    style Step1 fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px,color:#1a1a1a
    style Step2 fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px,color:#1a1a1a
    style Step3 fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px,color:#1a1a1a
    style Step4 fill:#fff4e8,stroke:#ff6b35,stroke-width:2px,color:#1a1a1a
    style Step5 fill:#e8f8f0,stroke:#06d6a0,stroke-width:2px,color:#1a1a1a
    style Compare fill:#f0e8fd,stroke:#7c5cff,stroke-width:2px,color:#1a1a1a
```

### 各步骤详细说明

```mermaid
flowchart TD
    subgraph S1["步骤 1：首页"]
        S1A["打开 http://localhost:5173"]
        S1B["查看系统介绍与核心能力"]
        S1C["点击「开始评估」按钮"]
        S1A --> S1B --> S1C
    end

    subgraph S2["步骤 2：运动员信息"]
        S2A["填写基础数据<br/>年龄·性别·身高·体重"]
        S2B["选择运动信息<br/>项目·水平·惯用腿"]
        S2C["填写伤病与疲劳状态<br/>既往伤病·当前疼痛·疲劳程度"]
        S2D["点击「下一步：上传视频」"]
        S2A --> S2B --> S2C --> S2D
    end

    subgraph S3["步骤 3：上传视频"]
        S3A["选择动作类型<br/>跳跃落地/急停/变向等"]
        S3B["参考拍摄指导"]
        S3C["拖拽或点击上传视频<br/>mp4/mov/webm ≤ 200MB"]
        S3D["点击「开始分析」"]
        S3A --> S3B --> S3C --> S3D
    end

    subgraph S4["步骤 4：AI 分析"]
        S4A["视频质量检测<br/>人体完整·遮挡·亮度·抖动"]
        S4B["姿态识别<br/>MediaPipe 33 关键点"]
        S4C["特征提取<br/>关节角度·速度·加速度"]
        S4D["风险评分<br/>6 维度综合评估"]
        S4A --> S4B --> S4C --> S4D
    end

    subgraph S5["步骤 5：风险报告"]
        S5A["综合风险评分与等级"]
        S5B["6 维风险雷达图"]
        S5C["骨骼叠加分析视频"]
        S5D["问题动作回放"]
        S5E["生物力学特征详情"]
        S5F["训练建议与装备推荐"]
        S5G["导出 PDF 报告"]
        S5A --> S5B --> S5C --> S5D --> S5E --> S5F --> S5G
    end

    S1 --> S2 --> S3 --> S4 --> S5

    style S1 fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px
    style S2 fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px
    style S3 fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px
    style S4 fill:#fff4e8,stroke:#ff6b35,stroke-width:2px
    style S5 fill:#e8f8f0,stroke:#06d6a0,stroke-width:2px
```

## AI 分析管线

> 视频上传后，后端自动执行以下 **8 步分析管线**，全程无需人工干预：

```mermaid
flowchart TD
    Input["🎥 用户上传的运动视频"]

    Step1["① 视频质量检测"]
    Step1Note["检测项：人体完整性 · 遮挡程度 · 亮度<br/>抖动 · 拍摄距离 · 置信度 · 帧率 · 多人检测"]

    Step2["② 人体姿态识别"]
    Step2Note["MediaPipe Pose 逐帧提取 33 个关键点<br/>生成骨骼叠加视频"]

    Step3["③ 运动轨迹提取"]
    Step3Note["Savitzky-Golay 滤波平滑去抖<br/>计算关节位移 / 速度 / 加速度"]

    Step4["④ 动作阶段划分"]
    Step4Note["基于重心高度 + 足部速度<br/>准备 → 起跳 → 腾空 → 触地 → 缓冲 → 稳定"]

    Step5["⑤ 生物力学特征提取"]
    Step5Note["三点向量夹角法<br/>膝/髋/踝/躯干/整体 5 大类特征"]

    Step6["⑥ 风险评估"]
    Step6Note["6 维分项评分 + 综合风险评分<br/>+ 高风险动作模式概率"]

    Step7["⑦ 干预建议生成"]
    Step7Note["按风险成因映射循证训练建议<br/>个性化训练计划 + 装备推荐"]

    Step8["⑧ 分析报告输出"]
    Step8Note["雷达图 · 骨骼视频 · 问题回放<br/>PDF 导出 · 前后对比"]

    Input --> Step1
    Step1 --> Step1Note
    Step1Note -->|"✅ 合格"| Step2
    Step1Note -->|"❌ 不合格"| Retry["提示重新拍摄"]
    Step2 --> Step2Note --> Step3
    Step3 --> Step3Note --> Step4
    Step4 --> Step4Note --> Step5
    Step5 --> Step5Note --> Step6
    Step6 --> Step6Note --> Step7
    Step7 --> Step7Note --> Step8
    Step8 --> Step8Note

    style Input fill:#f0e8fd,stroke:#7c5cff,stroke-width:2px,color:#1a1a1a
    style Step1 fill:#fff4e8,stroke:#ff6b35,stroke-width:2px,color:#1a1a1a
    style Step2 fill:#fff4e8,stroke:#ff6b35,stroke-width:2px,color:#1a1a1a
    style Step3 fill:#fff4e8,stroke:#ff6b35,stroke-width:2px,color:#1a1a1a
    style Step4 fill:#fff4e8,stroke:#ff6b35,stroke-width:2px,color:#1a1a1a
    style Step5 fill:#fff4e8,stroke:#ff6b35,stroke-width:2px,color:#1a1a1a
    style Step6 fill:#fff4e8,stroke:#ff6b35,stroke-width:2px,color:#1a1a1a
    style Step7 fill:#e8f8f0,stroke:#06d6a0,stroke-width:2px,color:#1a1a1a
    style Step8 fill:#e8f8f0,stroke:#06d6a0,stroke-width:2px,color:#1a1a1a
    style Retry fill:#fde8e8,stroke:#e24b4a,stroke-width:2px,color:#1a1a1a
```

## 风险评估模型

> 从 6 个维度综合评估下肢运动损伤风险，每个维度独立评分后加权汇总：

```mermaid
flowchart LR
    subgraph Input["输入"]
        Bio["生物力学特征"]
        Athlete["运动员个体因素"]
    end

    subgraph Dimensions["6 大风险维度"]
        D1["🦵 膝关节<br/>内扣·屈曲·角速度"]
        D2["🦶 踝关节<br/>背屈·晃动·触地时差"]
        D3["🏋️ 髋关节<br/>屈曲·骨盆倾斜·稳定性"]
        D4["🧍 躯干控制<br/>侧倾·前倾·质心偏移"]
        D5["⚖️ 左右不对称<br/>双侧负荷差异指数"]
        D6["🎯 动作稳定性<br/>缓冲时间·稳定时间"]
    end

    subgraph Output["输出"]
        Score["综合风险评分 0-100"]
        Level["风险等级"]
        Prob["高风险动作概率"]
        Causes["主要风险原因"]
        Advice["训练预防建议"]
    end

    Bio --> D1 & D2 & D3 & D4 & D5 & D6
    Athlete --> D1 & D2 & D3 & D4 & D5 & D6
    D1 & D2 & D3 & D4 & D5 & D6 --> Score
    Score --> Level
    Score --> Prob
    D1 & D2 & D3 & D4 & D5 & D6 --> Causes
    Causes --> Advice

    style Input fill:#f0e8fd,stroke:#7c5cff,stroke-width:2px,color:#1a1a1a
    style Dimensions fill:#fff4e8,stroke:#ff6b35,stroke-width:2px,color:#1a1a1a
    style Output fill:#e8f8f0,stroke:#06d6a0,stroke-width:2px,color:#1a1a1a
```

### 风险等级划分

| 等级 | 评分范围 | 含义 |
|---|---|---|
| 🟢 低风险 | < 35 | 动作模式良好，维持现有训练 |
| 🟡 中风险 | 35 - 65 | 存在风险因素，建议针对性纠正训练 |
| 🔴 高风险 | > 65 | 高风险动作模式明显，需立即干预 |

### 个体因素影响

系统会根据运动员的个体因素对基础评分进行动态调整：

```mermaid
flowchart LR
    Base["基础评分<br/>（生物力学特征）"]
    Adjust{"个体因素调整"}
    Final["最终评分"]

    A1["+ 年龄偏小/偏大"]
    A2["+ BMI 偏高"]
    A3["+ 既往伤病史"]
    A4["+ 当前疼痛"]
    A5["+ 疲劳程度高"]
    A6["+ 训练频率不足"]

    Base --> Adjust
    Adjust --> A1 & A2 & A3 & A4 & A5 & A6
    A1 & A2 & A3 & A4 & A5 & A6 --> Final

    style Base fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px,color:#1a1a1a
    style Adjust fill:#fff4e8,stroke:#ff6b35,stroke-width:2px,color:#1a1a1a
    style Final fill:#e8f8f0,stroke:#06d6a0,stroke-width:2px,color:#1a1a1a
```

## 技术栈

```mermaid
graph LR
    subgraph Frontend["前端"]
        React["React 18"]
        Vite["Vite"]
        TS["TypeScript"]
        Recharts["Recharts 图表"]
        Axios["Axios HTTP"]
    end

    subgraph Backend["后端"]
        FastAPI["FastAPI"]
        Uvicorn["Uvicorn"]
        MediaPipe["MediaPipe Pose"]
        OpenCV["OpenCV"]
        NumPy["NumPy + SciPy"]
        Pydantic["Pydantic"]
    end

    subgraph Infra["基础设施"]
        Docker["Docker"]
        Render["Render 部署"]
    end

    style Frontend fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px
    style Backend fill:#e8f8f0,stroke:#06d6a0,stroke-width:2px
    style Infra fill:#fff4e8,stroke:#ff6b35,stroke-width:2px
```

| 模块 | 技术方案 | 说明 |
|---|---|---|
| Web 前端 | React 18 + Vite + TypeScript | 9 个页面，含风险雷达图、骨骼叠加视频、特征可视化 |
| 视频后端 | FastAPI + Uvicorn | 异步 API，任务式分析管线 |
| 姿态识别 | MediaPipe Pose | 逐帧提取 33 个关键点，生成骨骼叠加视频 |
| 轨迹分析 | Savitzky-Golay 滤波 | 关节位移/速度/加速度/平滑去抖 |
| 动作阶段 | 重心高度 + 足部速度 | 准备/起跳/腾空/触地/缓冲/稳定 |
| 生物力学 | 三点向量夹角法 | 膝/髋/踝/躯干/整体 5 大类特征 |
| 风险评估 | 启发式阈值规则引擎 | 0-100 评分 + 6 维分项 + 风险等级 |
| 干预知识库 | 结构化规则库 | 按风险成因映射循证训练建议 |

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+

### 方式一：一键启动（macOS）

双击 `篮球分析系统.command` 文件即可自动启动前后端并打开浏览器。

### 方式二：手动启动

```mermaid
flowchart LR
    subgraph BackendStart["启动后端"]
        B1["cd backend"]
        B2["python -m venv venv<br/>&& source venv/bin/activate"]
        B3["pip install -r requirements.txt"]
        B4["uvicorn app.main:app<br/>--reload --port 8000"]
        B1 --> B2 --> B3 --> B4
    end

    subgraph FrontendStart["启动前端"]
        F1["cd frontend"]
        F2["npm install"]
        F3["npm run dev"]
        F1 --> F2 --> F3
    end

    BackendStart -->|"http://localhost:8000/docs"| API["API 文档"]
    FrontendStart -->|"http://localhost:5173"| Web["Web 界面"]

    style BackendStart fill:#e8f8f0,stroke:#06d6a0,stroke-width:2px
    style FrontendStart fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px
    style API fill:#fff4e8,stroke:#ff6b35,stroke-width:2px
    style Web fill:#fff4e8,stroke:#ff6b35,stroke-width:2px
```

**启动后端：**
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
后端启动后访问 http://localhost:8000/docs 查看 API 文档。

**启动前端：**
```bash
cd frontend
npm install
npm run dev
```
前端启动后访问 http://localhost:5173。

### 拍摄指导

```mermaid
flowchart TD
    Cam["📷 相机固定，画面稳定"]
    Angle["📐 拍摄角度与运动方向垂直（侧拍）"]
    Body["🧍 确保全身入镜，关节不被遮挡"]
    Light["💡 光线充足，避免强逆光"]
    BG["🏞️ 背景简洁，减少干扰元素"]
    Duration["⏱️ 视频时长 5-15 秒"]

    Cam --> Angle --> Body --> Light --> BG --> Duration

    style Cam fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px,color:#1a1a1a
    style Angle fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px,color:#1a1a1a
    style Body fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px,color:#1a1a1a
    style Light fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px,color:#1a1a1a
    style BG fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px,color:#1a1a1a
    style Duration fill:#e8f4fd,stroke:#00b4d8,stroke-width:2px,color:#1a1a1a
```

## API 接口

```mermaid
sequenceDiagram
    participant U as 用户浏览器
    participant F as 前端 (React)
    participant B as 后端 (FastAPI)

    U->>F: 1. 填写运动员信息
    U->>F: 2. 选择动作 + 上传视频
    F->>B: POST /api/analysis/upload
    B-->>F: { task_id }
    F->>F: 跳转 /analysis/:task_id

    loop 每 1.5s 轮询
        F->>B: GET /api/analysis/:task_id/progress
        B-->>F: { progress, status, message }
    end

    Note over B: 质量检测 → 姿态识别 → 特征提取 → 风险评分

    B-->>F: { status: "done" }
    F->>B: GET /api/analysis/:task_id/result
    B-->>F: 完整分析结果 (JSON)
    F->>B: GET /api/analysis/:task_id/annotated-video
    B-->>F: 骨骼叠加视频 (MP4)
    F->>U: 展示风险报告
```

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/analysis/upload` | 上传视频+运动员信息，启动分析，返回 task_id |
| GET | `/api/analysis/{task_id}/progress` | 轮询分析进度 |
| GET | `/api/analysis/{task_id}/result` | 获取完整分析结果 |
| GET | `/api/analysis/{task_id}/annotated-video` | 获取带骨骼叠加的 mp4 |
| GET | `/api/analysis/{task_id}/problem-moment/{clip_index}/video` | 获取问题动作片段视频 |
| GET | `/api/analysis/{task_id}/pdf` | 导出 PDF 报告 |
| GET | `/api/analysis/{task_id}/timeline` | 逐帧特征时间序列 |
| GET | `/api/analysis/history` | 历史分析记录 |
| GET | `/api/meta/actions` | 支持的动作列表 |
| GET | `/api/meta/guide` | 拍摄指导要点 |

## 目录结构

```
.
├── backend/                     # Python 分析后端
│   ├── app/
│   │   ├── main.py              # FastAPI 入口
│   │   ├── config.py            # 配置(阈值/路径/CORS)
│   │   ├── api/analysis.py      # API 路由
│   │   ├── core/                # 核心分析模块
│   │   │   ├── pose_estimation.py    # 姿态识别(MediaPipe)
│   │   │   ├── trajectory.py         # 轨迹提取与平滑
│   │   │   ├── phase_detection.py    # 动作阶段识别
│   │   │   ├── biomechanics.py       # 生物力学特征提取
│   │   │   ├── risk_assessment.py    # 风险评估引擎
│   │   │   ├── video_quality.py      # 视频质量检测
│   │   │   ├── evidence.py           # 学术依据
│   │   │   ├── pdf_generator.py      # PDF 报告生成
│   │   │   └── pipeline.py           # 分析编排管线
│   │   ├── knowledge/intervention.py # 干预措施知识库
│   │   └── models/schemas.py    # 数据模型契约(Pydantic)
│   ├── data/                    # 上传/结果/样本
│   ├── scripts/                 # 工具脚本
│   ├── tests/                   # 测试
│   ├── requirements.txt
│   ├── Dockerfile
│   └── render.yaml
├── frontend/                    # React 前端
│   ├── src/
│   │   ├── pages/               # 9 个页面
│   │   │   ├── Home.tsx             # 首页
│   │   │   ├── Athlete.tsx          # 运动员信息录入
│   │   │   ├── Upload.tsx           # 视频上传
│   │   │   ├── Analysis.tsx         # 分析进度
│   │   │   ├── Report.tsx           # 风险报告
│   │   │   ├── History.tsx          # 历史记录
│   │   │   ├── About.tsx            # 关于
│   │   │   ├── Methodology.tsx      # 方法论
│   │   │   └── MLPredict.tsx        # ML 预测
│   │   ├── components/          # 布局/导航/页脚
│   │   ├── services/api.ts      # API 封装
│   │   ├── types/index.ts       # 类型定义
│   │   └── utils/index.ts       # 工具函数
│   ├── package.json
│   └── vite.config.ts
├── 篮球分析系统.command           # macOS 一键启动脚本
├── start_servers.sh             # 服务器启动脚本
├── stop_servers.sh              # 服务器停止脚本
├── keepalive.sh                 # 保活脚本
└── README.md
```

## 操作演示

> 系统操作流程动画演示，展示从首页到生成风险报告的完整过程（自动循环播放，正确渲染中文）。

🖥️ **[在线查看动画演示](./docs/demo.html)**

<details>
<summary>📋 演示内容说明</summary>

动画依次展示 5 个界面，每个界面约 4-6 秒，自动循环：

1. **首页** — 系统标题与「开始评估」入口
2. **运动员信息录入** — 姓名 / 年龄 / 身高 / 体重 / 运动项目 / 伤病史，字段逐个填充
3. **视频上传** — 拖拽上传区 + 动作类型选择（投篮 / 运球 / 跳跃 / 变向）
4. **AI 分析中** — 圆形进度环 0→100%，4 阶段依次完成（视频预处理→姿态识别→动作分析→风险评估）
5. **评估报告** — 六维雷达图展开 + 风险等级卡片（高 / 中 / 低）+ MediaPipe 骨架追踪演示

</details>

## 局限性与未来工作

- 当前风险评分为启发式规则，非基于真实伤病随访数据训练的预测模型
- 姿态识别为 2D 近似，部分三维特征(如真实膝外翻)精度有限
- 首版聚焦篮球跳跃落地类动作，急停/变向的生物力学模型待细化
- 未来可接入多机位/深度摄像头提升 3D 精度，并积累纵向数据训练真实预测模型

## 许可

本项目为学术演示用途。
