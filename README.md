# 造片局 Logo 投票页

这是一个手机端优先的投票页，适合部署成链接后转二维码发到群里。当前版本支持 Supabase 云端实时同步，也保留本地模式兜底。

## 使用方式

直接打开 `index.html` 就能预览。部署静态版时，把整个 `zaopianju-logo-vote` 文件夹上传到 Netlify、Vercel、静态网站托管或服务器目录即可。

## 免费部署

这个项目不需要自建 Node 服务器，正式发给用户时只要部署静态前端即可。推荐任选一个免费静态托管：

- Vercel
- Netlify
- GitHub Pages
- Cloudflare Pages

部署根目录选择 `zaopianju-logo-vote`。部署后有两个常用链接：

- 普通投票链接：`https://你的域名/`
- 发起方编辑链接：`https://你的域名/?admin=1`

发起方在电脑或手机端保存寓意、方案、图片后，会写入 Supabase；普通用户重新打开或保持页面在线时会看到最新内容。

## 云端实时同步

这一版默认使用 Supabase，同步内容包括：

- 发起方填写的整体寓意
- Logo 方案名称、关键词、图片
- 新增或删除的方案
- 用户投票结果

首次使用前，在 Supabase SQL Editor 里执行：

```text
supabase/logo-vote.sql
```

默认发起方云端编辑码：

```text
zpj2026
```

你用发起方链接保存时，页面会弹窗让你输入这个编辑码。普通投票链接不会显示编辑区，只能投票。

如果暂时不用 Supabase，也可以改成本机 JSON 后端：

1. 把 `logo-options.js` 里的 `mode` 改成 `"api"`。
2. 把 `apiBaseUrl` 改成 `"/api"`。
3. 运行：

```bash
node server.js
```

然后访问 `http://localhost:4177`。

## 本机开机自启动

如果你只是想在这台电脑上长期预览本地链接，可以安装开机自动唤醒：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-Zaopianju-Logo-Vote-Autostart.ps1
```

安装后，Windows 登录时会在后台启动本地服务：

```text
http://127.0.0.1:4177/
```

当前这台电脑已经安装过。启动方式是 Windows“启动”文件夹里的隐藏脚本：

```text
Start-Zaopianju-Logo-Vote.vbs
```

注意：这个本地链接只在你的电脑开机且服务运行时可用。正式发给手机用户投票，建议部署到 Vercel、Netlify、GitHub Pages 或 Cloudflare Pages，这样电脑关机也能访问。

## 替换 Logo 和文案

1. 把真实 Logo 图片放到 `assets/logos/`，建议使用 `png`、`jpg`、`webp` 或 `svg`。
2. 打开 `logo-options.js`。
3. 修改每个方案的 `image`、`name`、`keywords`。
4. 如果要改顶部整体寓意，修改 `meaning`。

也可以用发起方填写模式在电脑或手机端编辑：

- 普通投票链接：`index.html`
- 发起方填写链接：`index.html?admin=1`

发起方填写页可以编辑：

- 开头整体寓意
- 每个方案名称
- 每个方案关键词
- 每个方案 Logo 图片
- 新增或删除投票方案

手机端可以从相册选择 Logo 图片。云端模式下，图片会上传到 Supabase Storage；保存方案后，电脑和手机会实时同步。

## 增加或减少投票方案

投票入口数量由 `logo-options.js` 里的 `options` 数组决定：

- 3 个方案就保留 3 段配置。
- 4 个方案就再复制一段，改成新的 `id`、`name`、`image`、`keywords`。
- 删除某个方案，就删除对应那一整段配置。
- `id` 必须唯一，建议按 `optionA`、`optionB`、`optionC`、`optionD` 这样写。
- `initialVotes` 可以不用改，新方案会自动从 0 票开始。

新增方案示例：

```js
{
  id: "optionD",
  name: "方案 D",
  image: "./assets/logos/your-logo-d.png",
  keywords: ["高级", "视觉感", "传播感"]
}
```

## 当前投票数据

如果 `logo-options.js` 里把 `mode` 改成 `"local"`，页面会使用 `localStorage` 本地模拟投票：

- 同一台手机或同一个浏览器只能投一次。
- 票数统计保存在当前浏览器里，适合第一版演示和样式确认。
- 如果要收集群里所有人的真实票数，请使用默认的 Supabase 模式，或切换到上面的 Node JSON 后端。

## 预留接口模式

后续接 Supabase、Firebase、云函数、Node JSON 后端或自己的接口时，把 `logo-options.js` 里的配置改成：

```js
mode: "api",
apiBaseUrl: "https://your-domain.com/api"
```

前端会调用：

- `GET /votes?pollId=zaopianju-logo-2026`
- `POST /votes`

`POST /votes` 请求体：

```json
{
  "pollId": "zaopianju-logo-2026",
  "optionId": "optionA",
  "voterKey": "browser-generated-id"
}
```

接口返回建议：

```json
{
  "votes": {
    "optionA": 12,
    "optionB": 8,
    "optionC": 5
  }
}
```
