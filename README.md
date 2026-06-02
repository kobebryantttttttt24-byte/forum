# 共话 - 简单论坛

一个任何人都可以发帖的简单论坛。完全基于 Node.js 原生模块，无需任何外部依赖。

## 在线访问

部署完成后，可以通过以下链接访问：

**https://forum.onrender.com**

## 一键部署

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### 手动部署到 Render（推荐，免费）

1. 登录 https://dashboard.render.com （用 GitHub 账号注册）
2. 点击 **New +** → **Web Service**
3. 连接 GitHub 仓库 `kobebryantttttttt24-byte/forum`
4. 使用以下配置：
   - **Name:** `forum`
   - **Region:** 选择离你最近的
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** 留空
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. 点击 **Create Web Service**
6. 等待 2-3 分钟部署完成
7. 访问 `https://forum.onrender.com`

### 部署到 Railway（备选）

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template)

## 本地运行

```bash
node server.js
```

访问 http://localhost:4000

## 技术栈

- **后端:** Node.js 原生 HTTP 模块
- **前端:** 纯 HTML + CSS + JavaScript
- **数据存储:** JSON 文件

## 特性

- 任何人都可以发帖
- 帖子支持删除
- 相对时间显示
- 数据持久化
- 响应式设计
