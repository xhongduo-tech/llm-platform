# BRDC.ai API Platform

企业内网 LLM API 管理平台。统一管理大模型接入、API Key 分发、用量统计、社区答疑，完全离线部署，无需公网访问。

---

## 目录

- [功能概览](#功能概览)
- [技术架构](#技术架构)
- [目录结构](#目录结构)
- [本地开发](#本地开发)
- [生产部署（离线内网）](#生产部署离线内网)
- [环境变量](#环境变量)
- [API 端点速查](#api-端点速查)
- [前端路由](#前端路由)
- [管理员使用说明](#管理员使用说明)
- [用户使用说明](#用户使用说明)

---

## 功能概览

| 模块 | 功能 |
|------|------|
| **首页** | 智能推荐适用模型（按业务场景：业务研发/测试自动化/需求维度/数据运营/数据可视化等） |
| **模型目录** | 展示所有可用模型，含状态、上下文长度、输入输出价格、标签筛选 |
| **申请 Key** | 用户填写姓名/工号/部门/用途，后端自动生成并入库 API Key；支持查询已有 Key |
| **日志** | 登录用户查看自己的历史调用记录（时间/模型/Token 数/延迟） |
| **统计** | 登录用户查看按月 Token 消耗与调用次数趋势图（可切换年份） |
| **社区** | 贴吧式问答，支持发帖/回复/楼层标记/管理员置顶 |
| **通知** | 管理员发布系统公告，首次访问弹窗提示，未读红点标记 |
| **代码示例** | Python / Node.js / cURL 三种语言示例，动态填充当前平台地址 |
| **管理后台** (`/admin`) | 数据看板、模型管理、用户管理、通知管理、调用记录（JWT 鉴权，不在导航栏显示） |

---

## 技术架构

```
浏览器
  │
  ▼
Nginx (port 80)
  ├── /          → 静态 SPA（预编译 React）
  ├── /api/*     → FastAPI (internal :8000)
  └── /v1/*      → FastAPI proxy → 上游 LLM API
  
FastAPI (port 8000, 内部)
  ├── REST API（管理/用户/公开端点）
  ├── OpenAI-Compatible Proxy (/v1/*)
  └── SQLite (/data/bxdc.db)
```

**前端**
- React 18 + TypeScript + Vite 6
- Tailwind CSS v4（@tailwindcss/vite）
- shadcn/ui 组件库（37 个组件，离线打包）
- React Router v7
- Recharts 2.15（图表，离线打包）
- @vitejs/plugin-legacy（兼容 Chrome 60+）

**后端**
- Python 3.11 + FastAPI 0.115
- SQLAlchemy 2.0 + SQLite（零外部数据库依赖）
- PyJWT（JWT 鉴权）
- httpx（异步代理转发）
- PBKDF2 密码哈希（Python stdlib，无额外依赖）

**部署**
- Docker multi-stage build（`--platform=linux/amd64`，Mac M 系列可交叉编译）
- docker buildx + QEMU（Apple Silicon → x86_64）
- 完全离线：所有 npm 包、Python 包、字体均打包进镜像

---

## 目录结构

```
llm-platform/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── main.py             # 所有 API 路由（~1000 行）
│   │   ├── models.py           # SQLAlchemy ORM 模型
│   │   ├── auth.py             # JWT + 密码哈希工具
│   │   ├── proxy.py            # OpenAI-compatible 代理转发
│   │   └── database.py         # SQLite 连接 + 初始化
│   ├── Dockerfile              # Python 3.11-slim 镜像
│   └── requirements.txt        # 7 个依赖（无 torch/numpy 等重量级包）
│
├── frontend/                   # React SPA
│   ├── src/app/
│   │   ├── components/
│   │   │   ├── layout.tsx          # 全局布局（导航栏、User Provider）
│   │   │   ├── home-page.tsx       # 首页（场景推荐 + 快速问答）
│   │   │   ├── model-catalog.tsx   # 模型目录
│   │   │   ├── apply-page.tsx      # 申请 Key 页
│   │   │   ├── admin-page.tsx      # 管理后台（5 个 Tab）
│   │   │   ├── logs-page.tsx       # 用户调用日志
│   │   │   ├── stats-page.tsx      # Token 统计图表
│   │   │   ├── forum-page.tsx      # 社区首页
│   │   │   ├── forum-post-page.tsx # 帖子详情 + 回复
│   │   │   ├── notifications-page.tsx
│   │   │   ├── code-examples.tsx
│   │   │   ├── user-context.tsx    # 用户登录状态 Context
│   │   │   ├── user-auth-modal.tsx # 登录/注册弹窗
│   │   │   ├── model-context.tsx   # 模型列表 + 通知 Context
│   │   │   └── ui/                 # shadcn/ui 37 个组件
│   │   └── routes.tsx              # React Router 路由定义
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── nginx/
│   ├── nginx.conf              # 反向代理配置
│   └── Dockerfile              # multi-stage：Node build + nginx
│
├── docker-compose.yml          # 生产编排（2 个服务）
├── build-offline.sh            # 构建脚本（Mac 上运行，产出 .tar.gz）
├── deploy-offline.sh           # 部署脚本（内网服务器上运行）
├── .env.example                # 环境变量模板
└── offline-images/             # build-offline.sh 的产物（gitignore）
    ├── bxdc-backend.tar.gz
    ├── bxdc-nginx.tar.gz
    ├── docker-compose.yml
    ├── deploy-offline.sh
    └── .env.example
```

---

## 本地开发

### 前置条件

- Node.js 20+
- Python 3.11+
- pip

### 1. 启动后端

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 启动（开发模式，热重载）
uvicorn app.main:app --reload --port 8000
```

后端启动后访问 API 文档：http://localhost:8000/docs

### 2. 启动前端

新开一个终端：

```bash
cd frontend

# 安装依赖
npm install --legacy-peer-deps

# 启动开发服务器
npm run dev
```

前端默认监听 http://localhost:5173

> **注意**：`vite.config.ts` 中已配置 `/api` 和 `/v1` 请求代理到 `http://localhost:8000`，前后端可独立开发。

### 3. 访问平台

| 地址 | 说明 |
|------|------|
| http://localhost:5173 | 前端 SPA |
| http://localhost:8000/docs | FastAPI Swagger 文档 |
| http://localhost:5173/admin | 管理后台（密码见 `ADMIN_PASSWORD`，默认 `990115`） |

---

## 生产部署（离线内网）

### 阶段一：在联网 Mac 上构建镜像

```bash
# 确保 Docker Desktop 已启动
chmod +x build-offline.sh
./build-offline.sh
```

脚本将自动：
1. 创建 `bxdc-amd64-builder` buildx builder（仅首次）
2. 交叉编译 `bxdc-backend:latest`（linux/amd64）
3. 交叉编译 `bxdc-nginx:latest`（linux/amd64，含前端静态文件）
4. 导出为 `offline-images/bxdc-backend.tar.gz` 和 `bxdc-nginx.tar.gz`
5. 打包 `docker-compose.yml`、`deploy-offline.sh`、`.env.example`

> 首次构建约 10-15 分钟（需下载 Node.js 镜像、npm 包、Python 包）。
> 有 Docker 层缓存后约 2-3 分钟。

产物总大小约 300-500 MB。

### 阶段二：传输到内网服务器

```bash
scp -r offline-images/ user@YOUR_SERVER_IP:/opt/bxdc/
```

### 阶段三：在内网服务器上部署

```bash
# 服务器需已安装 Docker CE（可从 Docker 官网下载离线 rpm/deb 包）
cd /opt/bxdc/offline-images

# 配置环境（必须修改 JWT_SECRET！）
cp .env.example .env
nano .env

chmod +x deploy-offline.sh
sudo ./deploy-offline.sh
```

脚本将自动：
1. `docker load` 两个镜像
2. 读取 `.env` 配置
3. `docker compose up -d`
4. 等待健康检查通过
5. 打印访问地址

### 端口说明

| 端口 | 说明 |
|------|------|
| 80 | HTTP（可改为 `HTTP_PORT=8080` 等） |
| 8000 | FastAPI（仅容器内部，不暴露） |

### 数据持久化

SQLite 数据库存储在 Docker named volume `db-data`（挂载到 `/data/bxdc.db`）。

```bash
# 备份数据库
docker run --rm -v bxdc_db-data:/data -v $(pwd):/backup alpine \
    tar czf /backup/bxdc-db-backup.tar.gz /data

# 查看日志
docker compose logs -f backend
docker compose logs -f nginx
```

### 更新部署

```bash
# 在 Mac 上重新构建
./build-offline.sh

# 传输到服务器
scp offline-images/*.tar.gz user@SERVER:/opt/bxdc/offline-images/

# 在服务器上
cd /opt/bxdc/offline-images
docker load < bxdc-backend.tar.gz
docker load < bxdc-nginx.tar.gz
docker compose up -d
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ADMIN_PASSWORD` | `990115` | 管理员登录密码，**生产必须修改** |
| `JWT_SECRET` | `change-me-...` | JWT 签名密钥，**生产必须改为随机值** |
| `JWT_TTL_HOURS` | `12` | 管理员 JWT 有效期（小时） |
| `HTTP_PORT` | `80` | Nginx 对外暴露端口 |
| `LOG_LEVEL` | `info` | uvicorn 日志级别 |
| `DB_PATH` | `/data/bxdc.db` | SQLite 数据库路径 |

生成强随机 `JWT_SECRET`：
```bash
openssl rand -hex 32
```

---

## API 端点速查

### 公开端点（无需鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/public/models` | 获取已启用的模型列表 |
| GET | `/api/public/notifications` | 获取通知列表 |
| POST | `/api/admin/login` | 管理员登录，返回 JWT |
| POST | `/api/user/register` | 用户注册（工号 + 密码） |
| POST | `/api/user/login` | 用户登录，返回 JWT |
| POST | `/api/apply` | 提交 Key 申请（自动创建 API Key） |
| GET | `/api/apply/lookup` | 查询已有 Key（`?auth_id=工号`） |

### 用户端点（Bearer 用户 JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/user/profile` | 获取个人信息 |
| GET | `/api/user/logs` | 调用日志（`?page=1&page_size=50`） |
| GET | `/api/user/stats` | Token 统计（`?year=2025`） |

### 社区端点（GET 公开，POST 需用户 JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/forum/posts` | 帖子列表（`?page=1`） |
| POST | `/api/forum/posts` | 发帖 |
| GET | `/api/forum/posts/{id}` | 帖子详情（含回复） |
| POST | `/api/forum/posts/{id}/replies` | 回复 |
| DELETE | `/api/forum/posts/{id}` | 删除帖子（作者本人） |

### 管理端点（Bearer 管理员 JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/models` | 模型列表 |
| POST | `/api/admin/models` | 新增模型 |
| PUT | `/api/admin/models/{id}` | 更新模型 |
| DELETE | `/api/admin/models/{id}` | 删除模型 |
| POST | `/api/admin/models/sync` | 批量同步模型列表 |
| GET | `/api/admin/keys` | API Key 列表 |
| POST | `/api/admin/keys` | 新增 Key |
| POST | `/api/admin/keys/{id}/revoke` | 吊销 Key |
| DELETE | `/api/admin/keys/{id}` | 删除 Key |
| GET | `/api/admin/applications` | 待审批申请列表 |
| POST | `/api/admin/applications/{id}/approve` | 审批通过 |
| POST | `/api/admin/applications/{id}/reject` | 拒绝申请 |
| GET | `/api/admin/usage` | 调用记录（分页 + 模型过滤） |
| GET | `/api/admin/user-logs` | 指定用户日志（`?auth_id=X`） |
| GET | `/api/admin/notifications` | 通知列表 |
| POST | `/api/admin/notifications` | 发布通知 |
| PUT | `/api/admin/notifications/{id}` | 更新通知 |
| DELETE | `/api/admin/notifications/{id}` | 删除通知 |
| GET | `/api/admin/stats/overview` | 概览（总调用/Token/用户数等） |
| GET | `/api/admin/stats/daily` | 每日调用趋势（`?days=30`） |
| GET | `/api/admin/stats/monthly` | 每月趋势 |
| GET | `/api/admin/stats/by_model` | 按模型分布 |
| GET | `/api/admin/stats/by_user` | Top 用户排行 |
| PATCH | `/api/forum/posts/{id}/pin` | 置顶/取消置顶帖子 |

### 代理端点（用户 API Key）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/chat/completions` | Chat 对话（OpenAI 格式） |
| POST | `/v1/embeddings` | 向量嵌入 |
| GET | `/v1/models` | 可用模型列表 |

---

## 前端路由

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | HomePage | 首页 + 场景推荐 |
| `/models` | ModelCatalog | 模型目录 |
| `/apply` | ApplyPage | 申请 API Key |
| `/examples` | CodeExamples | 代码示例 |
| `/logs` | LogsPage | 调用日志（需登录） |
| `/stats` | StatsPage | Token 统计（需登录） |
| `/forum` | ForumPage | 社区帖子列表 |
| `/forum/:id` | ForumPostPage | 帖子详情 + 回复 |
| `/notifications` | NotificationsPage | 通知中心 |
| `/admin` | AdminPage | 管理后台（不在导航栏） |

---

## 管理员使用说明

1. 直接访问 `/admin`（不在导航栏显示）
2. 输入 `ADMIN_PASSWORD`（默认 `990115`）登录
3. **数据看板**：查看今日/本月/全年调用量和 Token 消耗，折线图/柱图/饼图
4. **模型管理**：新增模型（填写 Model ID、上游 API Base、Provider Key）、启用/停用、编辑、删除；支持 CSV 导出
5. **用户管理**：查看所有 API Key，新增/吊销/删除；查看待审批申请并一键通过/拒绝；支持 CSV 导出
6. **通知管理**：发布、编辑、删除系统公告；支持标记"最新"
7. **调用记录**：按模型筛选，查看完整调用日志；支持 CSV 导出

---

## 用户使用说明

### 注册与登录

点击导航栏右上角"登录"按钮，切换到"注册"标签，填写工号和密码完成注册。

### 申请 API Key

1. 访问「申请」页
2. 填写姓名、工号、部门、用途
3. 提交后系统自动生成 API Key（同时入库，可直接调用）
4. 复制 Key 和 Base URL，填入你的应用或测试工具

### 调用示例

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://YOUR_INTRANET_IP/v1",   # 替换为实际内网地址
    api_key="YOUR_API_KEY"
)

response = client.chat.completions.create(
    model="gpt-4o-mini",                     # 使用平台配置的 Model ID
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### 查询 Key / 日志

- 已有 Key 遗忘：访问「申请」→「查询已有 Key」→ 输入工号
- 调用日志：导航栏「日志」（需登录）
- Token 统计：导航栏「统计」（需登录）

---

## 常见问题

**Q: 部署后前端白屏？**
> 检查 nginx 容器日志：`docker compose logs nginx`。通常是 backend 健康检查未通过，等待 30-60s 后刷新。

**Q: API Key 调用返回 401？**
> 确保 Key 通过「申请」页提交（而非手动生成）。可在管理后台「调用记录」确认 Key 是否存在。

**Q: 忘记管理员密码？**
> 修改 `.env` 中的 `ADMIN_PASSWORD`，然后 `docker compose restart backend`。

**Q: 如何修改端口？**
> 修改 `.env` 中的 `HTTP_PORT`，然后 `docker compose up -d`。

**Q: Apple Silicon Mac 构建的镜像可以在 x86 服务器运行吗？**
> 可以。`build-offline.sh` 使用 `docker buildx --platform linux/amd64` 确保产物为 x86_64 架构。

**Q: 数据库在哪里？如何备份？**
> 数据存储在 Docker volume `bxdc_db-data` 中。备份命令见上方「数据持久化」章节。
