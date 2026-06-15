# Paddock Club

面向 F1 车迷的社区评分、逐站表现评价、社区排行榜和 2026 赛车展厅。

## 本地运行

```bash
npm install
npm start
```

打开 `http://localhost:3000`。本地开发继续使用 Express 和 `data/` 下的 JSON 文件。

## Cloudflare Pages 零成本部署

线上版本使用：

- Cloudflare Pages 托管静态网页
- Pages Functions 提供 `/api/*`
- Cloudflare D1 保存账号、登录会话、评论和评分

### 1. 创建 D1 数据库

1. 在 Cloudflare 控制台进入 **Storage & databases → D1 SQL database**。
2. 创建数据库，名称可使用 `paddock-club-db`。
3. 打开数据库的 **Console**。
4. 将仓库中的 `schema.sql` 全部粘贴并执行。

### 2. 创建 Pages 项目

1. 进入 **Workers & Pages → Create → Pages → Connect to Git**。
2. 选择此 GitHub 仓库。
3. 构建配置填写：

| 配置 | 值 |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | 留空 |
| Node.js version | 20 或更高 |

### 3. D1 绑定

仓库中的 `wrangler.jsonc` 已将 Pages Functions 的 `DB` 绑定连接到
`paddock-club-db`，部署时会作为项目配置的唯一来源，无需在控制台重复添加。

### 4. 验证

访问以下地址，域名替换为自己的 Pages 域名：

```text
https://你的域名.pages.dev/api/health
```

正常结果：

```json
{"status":"ok","runtime":"cloudflare-pages"}
```

然后测试注册、登录、评论和车手逐站评分。

## 管理后台

管理后台地址：

```text
https://你的域名.pages.dev/admin
```

后台显示注册人数、24 小时和 7 天活跃用户、14 天访问趋势、最近用户和留言。
访问统计从部署 `analytics.js` 后开始累计，不会补录此前的历史访问。

管理员账号通过 Cloudflare Pages 加密环境变量配置：

```bash
npx wrangler pages secret put ADMIN_USERNAME --project-name paddock-club
```

变量值填写允许进入后台的现有用户名。多个管理员可使用英文逗号分隔。

## GitHub Actions 自动部署

仓库包含 `.github/workflows/deploy-pages.yml`。在 GitHub 仓库的
**Settings → Secrets and variables → Actions** 中添加：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

之后每次推送 `main` 都会自动构建并部署到 Cloudflare Pages。

## 公开仓库安全

以下内容已被 `.gitignore` 排除：

- `data/*.json`
- `.env`
- `.dev.vars`
- `.wrangler/`
- `node_modules/`
- `dist/`

不要把 Cloudflare API Token、真实用户数据或本地令牌提交到 GitHub。

## 数据说明

本地 JSON 数据不会自动迁移到 D1。Cloudflare 上线后将使用一个全新的线上数据库。
