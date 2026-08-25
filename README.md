# 微光问道 (GlimmerDao)

> 知命 · 不惑 · 明心

AI 驱动的中国传统命理分析平台，融合四柱八字、紫微斗数、六爻占卜、梅花易数、黄历择吉与麻衣神相等多门术数，提供排盘起卦、AI 智能问答、专业报告生成、档案管理与知识学习的一站式体验。

## 功能特性

### 六大门类术数

| 门类 | 图标 | 说明 |
|------|------|------|
| 四柱八字 | 🔮 | 精确排盘四柱、十神、五行、大运、流年，支持命理解盘与流年趋势分析 |
| 紫微斗数 | ✨ | 完整排布十二宫、星曜、四化，解读命盘格局与人生趋势 |
| 六爻占卜 | 🪙 | 铜钱起卦，纳甲装卦，结合用神、世应、六亲研判所问之事吉凶与应期 |
| 梅花易数 | 🌸 | 数字 / 时间起卦，以体用生克、卦气旺衰断事之成败与时机 |
| 黄历择吉 | 📅 | 每日宜忌、黄道吉日查询，结合事主八字与事项属性智能择日 |
| 麻衣神相 | 👤 | 上传面相 / 手相图片，AI 智能识相并出具命相合参分析 |

### 核心能力

- **AI 智能对话**：实时流式问答，自动理解用户意图并加载对应术数 Skill 的专业能力
- **专业报告生成**：每个门类内置多套报告模板，支持生成 5000–8000 字的深度分析报告，可选择 HTML / PDF 格式下载
- **档案管理**：保存与管理排盘 / 起卦 / 相学档案，支持分组、搜索、批量操作
- **报告存档**：保存生成的分析报告，支持查看、编辑、下载
- **知识库**：上传文档、AI 自动总结、生成思维导图、追踪学习进度
- **个人画像**：跨会话记忆用户偏好与生辰数据，提供更贴合的回答
- **语音输入**：基于 sherpa-onnx 的语音识别转文字
- **多端认证**：邮箱 / 短信验证码登录注册，JWT 鉴权

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + TypeScript + Vite |
| **后端** | Python 3.12 + FastAPI |
| **数据库** | SQLite (aiosqlite + SQLAlchemy) |
| **AI 引擎** | LangChain / LangGraph Agent Harness（Planner / Reflector 自主规划） |
| **计算引擎** | lunar-javascript（八字）、iztro（紫微）、iching-shifa（六爻）、mingyu-core（梅花易数） |
| **报告导出** | jsPDF（PDF）、HTML2Canvas |
| **语音识别** | sherpa-onnx |
| **可视化** | D3 + markmap（思维导图） |

## 快速开始

### 前提条件

- Python 3.12+
- Node.js 20+
- 一个 OpenAI 兼容的 LLM API Key（用于对话与报告生成）

### 1. 配置后端

```bash
cd backend

# 复制环境变量配置
cp .env.example .env

# 编辑 .env，填入 LLM 配置（快速模式 + 思考模式）
# FAST_LLM_API_KEY=your-api-key
# FAST_LLM_MODEL=your-model
# FAST_LLM_BASE_URL=https://api.openai.com/v1
# THINK_LLM_API_KEY=your-api-key
# THINK_LLM_MODEL=your-model

# 安装依赖
pip install -r requirements.txt

# 启动后端（端口 5050）
python run.py
```

### 2. 配置前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器（端口 5000）
npm run dev
```

### 3. 一键启动（Windows）

项目根目录提供 `service.bat`，可一键管理前后端服务：

```bash
service.bat            # 交互式菜单
service.bat start      # 启动所有服务
service.bat stop       # 停止所有服务
service.bat restart    # 重启所有服务
service.bat status     # 查看服务状态
```

### 4. 访问应用

- 前端界面：`http://localhost:5000`
- 后端 API 文档（Swagger）：`http://localhost:5050/docs`

## 目录结构

```
GlimmerDao/
├── backend/                    # 后端服务
│   ├── app/
│   │   ├── api/v1/            # API 路由（auth/chat/report/archive/...）
│   │   ├── core/              # 核心模块
│   │   │   ├── agent/         # Agent Harness（Planner/Reflector）
│   │   │   ├── skills/        # Skill 管理与意图匹配
│   │   │   └── tools/         # 工具（排盘计算等）
│   │   ├── models/            # 数据库模型
│   │   ├── services/          # 业务服务层
│   │   ├── schemas/           # Pydantic 模型
│   │   ├── config.py          # 应用配置
│   │   ├── database.py        # 数据库连接
│   │   ├── main.py            # 应用入口
│   │   └── middleware.py      # 安全中间件
│   ├── tests/                 # 后端测试
│   ├── requirements.txt       # 生产依赖
│   └── run.py                 # 启动脚本
├── frontend/                  # 前端应用
│   ├── src/
│   │   ├── components/        # React 组件
│   │   ├── context/           # React Context
│   │   ├── hooks/             # 自定义 Hooks
│   │   ├── utils/             # 工具函数
│   │   ├── types/             # TypeScript 类型
│   │   └── App.tsx            # 主应用组件
│   └── package.json
├── .skill/                    # 六门术数 Skill 定义（专业知识库）
│   ├── bazi_analysis/         # 四柱八字
│   ├── ziwei_analysis/        # 紫微斗数
│   ├── liuyao_analysis/       # 六爻占卜
│   ├── meihua_analysis/       # 梅花易数
│   ├── huangli_analysis/      # 黄历择吉
│   └── mayi_analysis/         # 麻衣神相
├── .rpttpl/                   # 报告模板（各门类多套模板）
├── logs/                      # 运行日志
├── service.bat                # 一键服务管理脚本
└── README.md
```

## API 概览

| 模块 | 路径前缀 | 说明 |
|------|---------|------|
| 健康检查 | `GET /health` | 服务健康状态 |
| 认证 | `/api/v1/auth/*` | 邮箱 / 短信验证码、注册登录、密码重置 |
| 对话 | `/api/v1/chat/*` | 发送消息、流式对话 (SSE)、Skill 列表 |
| 会话 | `/api/v1/sessions/*` | 会话列表、历史消息、清空 |
| 报告 | `/api/v1/reports/*` | 生成报告、流式生成 (SSE)、模板列表、报告 CRUD |
| 档案 | `/api/v1/archives/*` | 八字档案 CRUD |
| 相学 | `/api/v1/physiognomy/*` | 图片上传、相学档案 CRUD |
| 黄历 | `/api/v1/huangli/*` | 每日宜忌、吉日筛选 |
| 知识库 | `/api/v1/knowledge/*` | 文档、思维导图、学习进度、AI 总结 |
| 个人画像 | `/api/v1/profile/*` | 用户画像、反馈、生辰数据 |
| 语音 | `/api/v1/speech/*` | 语音转文字 |
| 系统管理 | `/api/v1/system/*` | 用户管理、LLM 配置、提示词管理 |
| 指标 | `/api/v1/metrics/*` | 自主性、质量评估指标 |

完整 API 文档请访问 `http://localhost:5050/docs`

## 环境变量说明

主要配置项（完整见 `backend/.env.example`）：

| 变量 | 说明 |
|------|------|
| `FAST_LLM_API_KEY` / `FAST_LLM_MODEL` / `FAST_LLM_BASE_URL` | 快速模式 LLM（响应快、成本低） |
| `THINK_LLM_API_KEY` / `THINK_LLM_MODEL` / `THINK_LLM_BASE_URL` | 思考模式 LLM（深度思考、质量高） |
| `VISION_LLM_API_KEY` / `VISION_LLM_MODEL` / `VISION_LLM_BASE_URL` | 视觉模式 LLM（图片解析，可选） |
| `DATABASE_URL` | 数据库连接串（默认 SQLite） |
| `JWT_SECRET_KEY` | JWT 签名密钥（生产环境必填） |
| `HOST` / `PORT` | 后端监听地址与端口（默认 0.0.0.0:5050） |
| `CORS_ALLOW_ORIGINS` | 允许跨域的前端地址 |

> LLM 的模型、API Key 等配置也可在应用内「系统管理 → 大模型配置」中动态修改，无需重启。

## License

MIT
