# 运动损伤风险评估系统 - Web 前端

基于计算机视觉与生物力学分析的运动损伤风险评估系统前端，使用 React + Vite + TypeScript 构建。

## 技术栈

- **框架**：React 18 + Vite 5 + TypeScript 5
- **路由**：react-router-dom v6
- **HTTP**：axios
- **可视化**：recharts（雷达图）
- **UI**：纯 CSS + CSS 变量，浅色主题，运动科技风格
- **中文界面**

## 目录结构

```
frontend/
├── public/
│   └── logo.svg              # 站点 logo
├── src/
│   ├── components/           # 公共组件（Layout / Navbar / Footer）
│   ├── pages/                # 6 个页面
│   │   ├── Home.tsx          # 首页 / 项目介绍
│   │   ├── Athlete.tsx       # 运动员信息录入
│   │   ├── Upload.tsx        # 视频上传
│   │   ├── Analysis.tsx      # 分析进行中（进度轮询）
│   │   ├── Report.tsx        # 分析报告（核心展示页）
│   │   └── About.tsx         # 关于 / 技术说明
│   ├── services/
│   │   └── api.ts            # axios 封装所有后端接口
│   ├── styles/
│   │   └── global.css        # 全局样式 + CSS 变量
│   ├── utils/
│   │   └── index.ts          # 工具函数（风险着色、状态映射等）
│   ├── types/
│   │   └── index.ts          # TypeScript 类型定义
│   ├── App.tsx               # 路由配置
│   └── main.tsx              # 应用入口
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

## 环境要求

- Node.js ≥ 18（本项目使用 Node 22.22.2）
- npm

## 运行方式

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式启动

```bash
npm run dev
```

启动后访问 http://localhost:5173

### 3. 生产构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 4. 预览构建产物

```bash
npm run preview
```

## 后端接口约定

前端默认请求 `http://localhost:8000/api`，接口如下：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/analysis/upload` | POST | 上传视频与分析请求（multipart/form-data） |
| `/api/analysis/{task_id}/progress` | GET | 轮询分析进度 |
| `/api/analysis/{task_id}/result` | GET | 获取完整分析结果 |
| `/api/analysis/{task_id}/annotated-video` | GET | 带骨骼叠加的分析视频 |
| `/api/meta/actions` | GET | 支持的动作列表 |
| `/api/meta/guide` | GET | 拍摄指导文本 |

接口封装位于 `src/services/api.ts`。

## 页面说明

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | 首页 | 项目介绍、特性卡片、分析流程、开始评估入口 |
| `/athlete` | 运动员信息录入 | 表单收集基础数据，存入 sessionStorage |
| `/upload` | 视频上传 | 动作选择、拖拽上传、拍摄指导 |
| `/analysis/:taskId` | 分析进行中 | 1.5s 轮询进度，阶段化进度展示 |
| `/report/:taskId` | 分析报告 | 综合评分环、风险雷达图、骨骼叠加视频、风险详情卡、生物力学特征、阶段时间轴 |
| `/about` | 关于 | 技术栈说明、风险等级说明、使用须知 |

## 风险着色规则

- **低风险（0-33）**：绿色 `#06d6a0`
- **中风险（34-66）**：黄色 `#ffd166`
- **高风险（67-100）**：红色 `#ef476f`

> 注意：风险分数越高代表越危险，与一般"分数越高越好"的认知相反。

## 注意事项

1. 前端为演示项目，非医学诊断工具。
2. 需后端服务运行在 `http://localhost:8000` 才能正常上传与分析。
3. 分析进度页采用 1.5 秒间隔轮询，完成后自动跳转报告页。
4. 运动员信息保存在浏览器 sessionStorage，关闭标签页即清除。
