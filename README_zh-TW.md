# @keeponfirst/kof-stitch-mcp

> **屬於 [KOF Agentic Workflow](https://github.com/keeponfirst/keeponfirst-agentic-workflow-starter) 的一部分** - 用於建立現代應用程式的完整 AI 代理工作流程。如果您想了解此工具如何融入整體架構，歡迎查看完整的工作流程。

---

## ☕ 支持這個專案

如果這個專案對您有幫助，歡迎在這裡支持開發：

👉 https://buymeacoffee.com/keeponfirst

<a href="https://www.buymeacoffee.com/keeponfirst" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="45" />
</a>

---

[Google Stitch](https://stitch.withgoogle.com/) 的 MCP (Model Context Protocol) 伺服器 - AI 驅動的 UI/UX 設計工具。

支援 **Claude Code**、**Cursor** 以及任何相容 MCP 的客戶端。

## 為什麼需要這個套件？

Google Stitch 在 `stitch.googleapis.com/mcp` 提供官方 MCP 端點，但它需要：
- 來自 Google Cloud ADC 的動態 OAuth 令牌
- 正確的認證標頭

大多數 MCP 客戶端（Claude Code、Cursor）原生不支援 Google 的 `google_credentials` 認證類型。這個套件將官方 API 包裝為 **stdio MCP 伺服器**，自動處理認證。

```
您的 MCP 客戶端 → kof-stitch-mcp → Google Stitch API
     (stdio)         (處理認證)        (HTTP)
```

## 功能

### 官方 Stitch 工具（透過 Google API）
- `list_projects` - 列出所有 Stitch 專案
- `get_project` - 取得專案詳情
- `create_project` - 建立新專案
- `list_screens` - 列出專案中的畫面
- `get_screen` - 取得畫面詳情
- `generate_screen_from_text` - 從文字提示生成 UI 設計

### 額外工具（由本套件提供）
- `fetch_screen_code` - 直接下載畫面 HTML 程式碼
- `fetch_screen_image` - 下載畫面截圖為 PNG
- `export_project` - **新功能** 批次匯出所有畫面（HTML + PNG）並產生清單

## 前置需求

1. **Node.js 18+**

2. **Google Cloud CLI** 並設定 Application Default Credentials：
   ```bash
   # 安裝 gcloud：https://cloud.google.com/sdk/docs/install

   # 登入
   gcloud auth application-default login

   # 設定專案
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **啟用 Stitch MCP API**：
   ```bash
   gcloud beta services mcp enable stitch.googleapis.com --project=YOUR_PROJECT_ID
   ```

## 安裝

### 方式 1：npx（推薦）

無需安裝。直接在 MCP 客戶端中設定即可。

### 方式 2：全域安裝

```bash
npm install -g @keeponfirst/kof-stitch-mcp
```

### 方式 3：本地安裝

```bash
npm install @keeponfirst/kof-stitch-mcp
```

## 設定

### Claude Code

在專案根目錄建立 `.mcp.json`：

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["-y", "@keeponfirst/kof-stitch-mcp"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-project-id"
      }
    }
  }
}
```

或透過 CLI 新增：

```bash
claude mcp add stitch --command "npx" --args "-y" "@keeponfirst/kof-stitch-mcp" \
  --env GOOGLE_CLOUD_PROJECT=your-project-id
```

### Cursor

新增至 Cursor MCP 設定：

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["-y", "@keeponfirst/kof-stitch-mcp"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-project-id"
      }
    }
  }
}
```

### 其他 MCP 客戶端

任何支援 stdio MCP 伺服器的客戶端都可以使用：

```bash
GOOGLE_CLOUD_PROJECT=your-project-id npx @keeponfirst/kof-stitch-mcp
```

## 使用範例

設定完成後，您可以在 MCP 客戶端中使用自然語言：

```
「列出我的 Stitch 專案」
→ 使用 list_projects 工具

「生成一個有電子郵件和社群登入的手機登入畫面」
→ 使用 generate_screen_from_text 工具

「下載專案 xyz789 中畫面 abc123 的 HTML 程式碼」
→ 使用 fetch_screen_code 工具
```

## 環境變數

| 變數 | 必要 | 說明 |
|------|------|------|
| `GOOGLE_CLOUD_PROJECT` | 是 | 您的 Google Cloud 專案 ID |
| `GCLOUD_PROJECT` | 替代 | GOOGLE_CLOUD_PROJECT 的替代選項 |

## 疑難排解

### 「gcloud CLI not found」

安裝 Google Cloud SDK：https://cloud.google.com/sdk/docs/install

### 「Your default credentials were not found」

```bash
gcloud auth application-default login
```

### 「Stitch API has not been used in project」

啟用 MCP API：
```bash
gcloud beta services mcp enable stitch.googleapis.com --project=YOUR_PROJECT_ID
```

### 「Permission denied」

確保您的帳號有必要的角色：
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="user:your-email@gmail.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

## 運作原理

1. 啟動時，伺服器會驗證 gcloud 認證
2. 對於每個 MCP 工具呼叫：
   - 透過 `gcloud auth application-default print-access-token` 取得新的 OAuth 令牌
   - 使用正確的標頭呼叫 `https://stitch.googleapis.com/mcp`
   - 將結果回傳給 MCP 客戶端

## 相關連結

- [Google Stitch](https://stitch.withgoogle.com/) - 官方 Stitch 網頁應用程式
- [Stitch MCP 文件](https://stitch.withgoogle.com/docs/mcp/setup) - 官方文件
- [MCP 協定](https://modelcontextprotocol.io/) - Model Context Protocol 規格
- [KeepOnFirst Agentic Workflow](https://github.com/keeponfirst/keeponfirst-agentic-workflow-starter) - 使用此套件的工作流程入門

## 授權條款

MIT © [KeepOnFirst](https://github.com/keeponfirst)
