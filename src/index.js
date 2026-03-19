#!/usr/bin/env node

/**
 * @keeponfirst/kof-stitch-mcp
 *
 * MCP Server for Google Stitch - AI-powered UI/UX design tool.
 * Works with Claude Code, Cursor, and any MCP-compatible client.
 *
 * GitHub: https://github.com/keeponfirst/kof-stitch-mcp
 *
 * This package wraps the official Google Stitch MCP API (stitch.googleapis.com/mcp)
 * as a stdio MCP server that handles authentication automatically via gcloud ADC.
 *
 * @license MIT
 * @author KeepOnFirst
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const os = require("os");
const fetch = require("node-fetch");

const execAsync = promisify(exec);

// Constants
const STITCH_API_URL = "https://stitch.googleapis.com/mcp";
const TIMEOUT_MS = 180000; // 3 minutes

// Logging (to stderr to avoid interfering with stdio transport)
const log = {
    info: (msg) => console.error(`[stitch-mcp] ${msg}`),
    success: (msg) => console.error(`[stitch-mcp] ✓ ${msg}`),
    error: (msg) => console.error(`[stitch-mcp] ✗ ${msg}`),
};

// ============================================================================
// Authentication Helpers
// ============================================================================

async function runGcloud(params) {
    const isWin = os.platform() === "win32";
    const command = isWin ? "gcloud.cmd" : "gcloud";

    try {
        const { stdout } = await execAsync(`${command} ${params}`, {
            encoding: "utf8",
            timeout: 10000,
        });
        return stdout.trim();
    } catch (error) {
        if (error.message.includes("ENOENT")) {
            throw new Error("gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install");
        }
        if (error.message.includes("Reauthentication")) {
            throw new Error("Auth expired. Run: gcloud auth application-default login");
        }
        throw error;
    }
}

async function getAccessToken() {
    return await runGcloud("auth application-default print-access-token");
}

async function getProjectId() {
    // 1. Environment variable
    if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
    if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;

    // 2. gcloud config
    try {
        const project = await runGcloud("config get-value project");
        if (project && project !== "(unset)") return project;
    } catch (e) { /* ignore */ }

    throw new Error("Project ID not found. Set GOOGLE_CLOUD_PROJECT or run: gcloud config set project YOUR_PROJECT");
}

// ============================================================================
// Stitch API Client
// ============================================================================

async function callStitchAPI(method, params, projectId) {
    const token = await getAccessToken();

    const body = {
        jsonrpc: "2.0",
        method,
        params,
        id: Date.now()
    };

    log.info(`API: ${method}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(STITCH_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "X-Goog-User-Project": projectId,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || JSON.stringify(data.error));
        }

        return data;

    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error("Request timeout (3 minutes)");
        }
        throw error;
    }
}

// ============================================================================
// Custom Tool Handlers
// ============================================================================

/**
 * 下載 screen 的 HTML 程式碼
 */
async function fetchScreenCode(projectId, screenId, gcpProjectId) {
    const screenRes = await callStitchAPI("tools/call", {
        name: "get_screen",
        arguments: { projectId, screenId }
    }, gcpProjectId);

    if (!screenRes.result) {
        throw new Error("Could not fetch screen details");
    }

    // 遞迴尋找 downloadUrl
    let downloadUrl = null;
    const findUrl = (obj) => {
        if (downloadUrl || !obj || typeof obj !== 'object') return;
        if (obj.downloadUrl) { downloadUrl = obj.downloadUrl; return; }
        for (const key in obj) findUrl(obj[key]);
    };
    findUrl(screenRes.result);

    if (!downloadUrl) {
        throw new Error("No code download URL found in screen data");
    }

    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`Failed to download code: ${res.status}`);

    return await res.text();
}

/**
 * 下載 screen 的截圖
 */
async function fetchScreenImage(projectId, screenId, gcpProjectId) {
    const screenRes = await callStitchAPI("tools/call", {
        name: "get_screen",
        arguments: { projectId, screenId }
    }, gcpProjectId);

    if (!screenRes.result) {
        throw new Error("Could not fetch screen details");
    }

    // 遞迴尋找 image URL
    let imageUrl = null;
    const findImg = (obj) => {
        if (imageUrl || !obj || typeof obj !== 'object') return;

        // 優先: screenshot.downloadUrl
        if (obj.screenshot?.downloadUrl) {
            imageUrl = obj.screenshot.downloadUrl;
            return;
        }

        // 其次: 任何看起來像圖片的 downloadUrl
        const isImgUrl = (s) => typeof s === "string" && (
            s.includes(".png") || s.includes(".jpg") ||
            (s.includes("googleusercontent.com") && !s.includes("contribution"))
        );

        if (obj.downloadUrl && isImgUrl(obj.downloadUrl)) {
            imageUrl = obj.downloadUrl;
            return;
        }

        for (const key in obj) findImg(obj[key]);
    };
    findImg(screenRes.result);

    if (!imageUrl) {
        throw new Error("No image URL found in screen data");
    }

    log.info(`Downloading image...`);
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);

    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 儲存到當前目錄
    const fileName = `screen_${screenId}.png`;
    const filePath = path.join(process.cwd(), fileName);
    fs.writeFileSync(filePath, buffer);
    log.success(`Saved: ${filePath}`);

    return {
        filePath,
        fileName,
        base64: buffer.toString('base64')
    };
}

/**
 * 初始化 .stitch/ 目錄結構，供 stitch-skills 工作流程使用
 */
async function initStitchProject(projectId, gcpProjectId, outputDir) {
    const stitchDir = outputDir || path.join(process.cwd(), '.stitch');
    const designsDir = path.join(stitchDir, 'designs');

    if (!fs.existsSync(stitchDir)) fs.mkdirSync(stitchDir, { recursive: true });
    if (!fs.existsSync(designsDir)) fs.mkdirSync(designsDir, { recursive: true });

    // 取得專案詳情
    const projectRes = await callStitchAPI("tools/call", {
        name: "get_project",
        arguments: { projectId }
    }, gcpProjectId);

    // 解析專案資料（遞迴搜尋有意義的物件）
    const parseProjectData = (obj) => {
        if (!obj || typeof obj !== 'object') return {};
        if (obj.content?.[0]?.text) {
            try { return JSON.parse(obj.content[0].text); } catch (e) {}
        }
        const find = (o) => {
            if (!o || typeof o !== 'object') return null;
            if (o.projectId || o.title || o.designTheme) return o;
            for (const k in o) { const r = find(o[k]); if (r) return r; }
            return null;
        };
        return find(obj) || {};
    };
    const projectData = parseProjectData(projectRes.result);

    // 取得 screens 清單
    const screensRes = await callStitchAPI("tools/call", {
        name: "list_screens",
        arguments: { projectId }
    }, gcpProjectId);

    let screens = [];
    try {
        const text = screensRes.result?.content?.[0]?.text;
        if (text) screens = JSON.parse(text);
    } catch (e) { /* 保持空陣列 */ }

    // 建立 screens map（stitch-skills 格式）
    const deviceType = projectData.deviceType || 'MOBILE';
    const defaultWidth = deviceType === 'MOBILE' ? 390 : 1440;
    const defaultHeight = deviceType === 'MOBILE' ? 844 : 900;
    const screensMap = {};
    let xOffset = 0;

    for (const screen of (Array.isArray(screens) ? screens : [])) {
        const sid = screen.id || screen.screenId;
        if (!sid) continue;
        const rawName = screen.title || screen.displayName || screen.name || sid;
        const pageKey = String(rawName).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || String(sid);
        screensMap[pageKey] = {
            id: sid,
            sourceScreen: `projects/${projectId}/screens/${sid}`,
            x: xOffset,
            y: 0,
            width: screen.width || defaultWidth,
            height: screen.height || defaultHeight
        };
        xOffset += defaultWidth + 159;
    }

    // 寫入 metadata.json
    const metadata = {
        name: `projects/${projectId}`,
        projectId: String(projectId),
        title: projectData.title || projectData.displayName || `Project ${projectId}`,
        visibility: projectData.visibility || 'PRIVATE',
        createTime: projectData.createTime || new Date().toISOString(),
        updateTime: projectData.updateTime || new Date().toISOString(),
        projectType: projectData.projectType || 'PROJECT_DESIGN',
        origin: projectData.origin || 'STITCH',
        deviceType,
        designTheme: projectData.designTheme || {},
        screens: screensMap,
        metadata: { userRole: 'OWNER' }
    };
    const metadataPath = path.join(stitchDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    log.success(`Saved: ${metadataPath}`);

    // 建立 DESIGN.md 範本（不覆蓋已存在的）
    const designMdPath = path.join(stitchDir, 'DESIGN.md');
    if (!fs.existsSync(designMdPath)) {
        const theme = metadata.designTheme;
        const colorMode = theme.colorMode === 'DARK' ? 'Dark' : 'Light';
        const platform = deviceType === 'MOBILE' ? 'Mobile' : 'Web';
        fs.writeFileSync(designMdPath, `# Design System: ${metadata.title}
**Project ID:** ${projectId}

## 1. Visual Theme & Atmosphere
[Describe the mood, density, and aesthetic philosophy of this design]

## 2. Color Palette & Roles
- **Primary** (${theme.customColor || '#000000'}) – Primary accent color
- **Background** – [Add hex + description]
- **Text Primary** – [Add hex + description]
- **Text Secondary** – [Add hex + description]

## 3. Typography Rules
- Font: ${theme.font || 'DEFAULT'}
- [Add heading sizes, body sizes, weights]

## 4. Component Stylings
* **Buttons:** [shape, padding, color strategy]
* **Cards:** [corner radius, background, shadow]
* **Inputs:** [border style, background, focus state]
* **Navigation:** [style, position, behavior]

## 5. Layout Principles
[Whitespace strategy, margins, grid alignment, max-width]

## 6. Design System Notes for Stitch Generation
**Copy this block into every prompt:**

**DESIGN SYSTEM (REQUIRED):**
- Platform: ${platform}, ${platform}-first
- Theme: ${colorMode}
- Font: ${theme.font || 'Default'}
- Primary Accent: ${theme.customColor || '#000000'}
- Color Mode: ${colorMode}
- Roundness: ${theme.roundness || 'DEFAULT'}
`);
        log.success(`Saved: ${designMdPath}`);
    }

    // 建立 SITE.md 範本（不覆蓋已存在的）
    const siteMdPath = path.join(stitchDir, 'SITE.md');
    if (!fs.existsSync(siteMdPath)) {
        const pageList = Object.keys(screensMap).map(p => `- [ ] ${p}`).join('\n') || '- [ ] index';
        fs.writeFileSync(siteMdPath, `# Site Vision: ${metadata.title}

## Overview
[Describe what this site/app does and who it's for]

## Pages
${pageList}

## Design Goals
- [Goal 1: e.g., fast onboarding for new users]
- [Goal 2: e.g., clear call-to-action on every page]

## Target Audience
[Who is this for?]
`);
        log.success(`Saved: ${siteMdPath}`);
    }

    return { stitchDir, metadata, screenCount: Object.keys(screensMap).length };
}

/**
 * 下載專案的 DESIGN.md 設計系統規範文件
 */
async function fetchDesignMd(projectId, gcpProjectId, outputPath) {
    const projectRes = await callStitchAPI("tools/call", {
        name: "get_project",
        arguments: { projectId }
    }, gcpProjectId);

    if (!projectRes.result) {
        throw new Error("Could not fetch project details");
    }

    // 遞迴尋找 DESIGN.md 相關 URL
    let designMdUrl = null;
    const findDesignMdUrl = (obj) => {
        if (designMdUrl || !obj || typeof obj !== 'object') return;
        for (const key in obj) {
            const val = obj[key];
            if (typeof val === 'string' && val.startsWith('http')) {
                const lk = key.toLowerCase();
                // 尋找 key 名稱包含 designmd / design_md 的欄位
                if (lk.includes('design') && lk.includes('md')) {
                    designMdUrl = val;
                    return;
                }
                // 或 URL 本身包含 DESIGN.md
                if (val.includes('DESIGN.md') || val.includes('design.md')) {
                    designMdUrl = val;
                    return;
                }
            }
            if (typeof val === 'object') findDesignMdUrl(val);
        }
    };
    findDesignMdUrl(projectRes.result);

    if (!designMdUrl) {
        throw new Error(
            "No DESIGN.md found in this project. " +
            "Export your design system from Stitch first: " +
            "Project Settings → Export Design System → DESIGN.md"
        );
    }

    log.info(`Downloading DESIGN.md...`);
    const res = await fetch(designMdUrl);
    if (!res.ok) throw new Error(`Failed to download DESIGN.md: ${res.status}`);

    const content = await res.text();
    const filePath = outputPath || path.join(process.cwd(), 'DESIGN.md');
    fs.writeFileSync(filePath, content);
    log.success(`Saved: ${filePath}`);

    return { filePath, content };
}

/**
 * 匯出整個專案的所有 screens（code + images）
 */
async function exportProject(projectId, gcpProjectId, outputDir) {
    const exportDir = outputDir || path.join(process.cwd(), `stitch_export_${projectId}`);

    // 建立匯出目錄
    if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
    }

    log.info(`Exporting project ${projectId} to ${exportDir}`);

    // 取得所有 screens
    const listRes = await callStitchAPI("tools/call", {
        name: "list_screens",
        arguments: { projectId }
    }, gcpProjectId);

    const screens = listRes.result?.content?.[0]?.text
        ? JSON.parse(listRes.result.content[0].text)
        : [];

    if (!Array.isArray(screens) || screens.length === 0) {
        throw new Error("No screens found in project");
    }

    log.info(`Found ${screens.length} screens`);

    const results = [];

    for (const screen of screens) {
        const screenId = screen.id || screen.name;
        if (!screenId) continue;

        log.info(`Processing screen: ${screenId}`);
        const screenResult = { screenId, code: null, image: null };

        // 下載 code
        try {
            const code = await fetchScreenCode(projectId, screenId, gcpProjectId);
            const codeFile = path.join(exportDir, `${screenId}.html`);
            fs.writeFileSync(codeFile, code);
            screenResult.code = codeFile;
        } catch (e) {
            log.error(`Code download failed for ${screenId}: ${e.message}`);
        }

        // 下載 image
        try {
            const imgResult = await fetchScreenImage(projectId, screenId, gcpProjectId);
            // 移動到匯出目錄
            const destFile = path.join(exportDir, `${screenId}.png`);
            fs.renameSync(imgResult.filePath, destFile);
            screenResult.image = destFile;
        } catch (e) {
            log.error(`Image download failed for ${screenId}: ${e.message}`);
        }

        results.push(screenResult);
    }

    // 建立 manifest
    const manifest = {
        projectId,
        exportedAt: new Date().toISOString(),
        screens: results
    };
    const manifestFile = path.join(exportDir, 'manifest.json');
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

    log.success(`Export complete: ${results.length} screens`);

    return {
        exportDir,
        manifest,
        screenCount: results.length
    };
}

// ============================================================================
// MCP Server
// ============================================================================

// 自訂工具定義（包裝官方 API）
const CUSTOM_TOOLS = [
    {
        name: "fetch_screen_code",
        description: "下載 screen 的 HTML 程式碼。傳回完整的 HTML 內容。",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Stitch 專案 ID" },
                screenId: { type: "string", description: "Screen ID" }
            },
            required: ["projectId", "screenId"]
        }
    },
    {
        name: "fetch_screen_image",
        description: "下載 screen 的截圖。儲存 PNG 到當前目錄並傳回 base64。",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Stitch 專案 ID" },
                screenId: { type: "string", description: "Screen ID" }
            },
            required: ["projectId", "screenId"]
        }
    },
    {
        name: "export_project",
        description: "批次匯出整個專案的所有 screens。下載每個 screen 的 HTML 和 PNG 到指定目錄，並建立 manifest.json。",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Stitch 專案 ID" },
                outputDir: { type: "string", description: "匯出目錄路徑（選填，預設為當前目錄下的 stitch_export_<projectId>）" }
            },
            required: ["projectId"]
        }
    },
    {
        name: "init_stitch_project",
        description: "初始化 .stitch/ 目錄結構，讓此專案與 stitch-skills (google-labs-code/stitch-skills) 工作流程相容。自動建立 metadata.json（含完整 screens map）、DESIGN.md 範本、SITE.md 範本、designs/ 目錄。執行後即可使用 stitch-loop、design-md、react-components 等進階 Skill。",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Stitch 專案 ID" },
                outputDir: { type: "string", description: ".stitch/ 目錄路徑（選填，預設為當前目錄下的 .stitch/）" }
            },
            required: ["projectId"]
        }
    },
    {
        name: "fetch_design_md",
        description: "下載 Stitch 專案的 DESIGN.md 設計系統規範文件。DESIGN.md 包含色彩、字體、間距、元件規範，可供 AI coding agent（如 Claude Code）在生成 UI 時遵循一致的設計系統。需先在 Stitch 匯出設計系統。",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Stitch 專案 ID" },
                outputPath: { type: "string", description: "儲存路徑（選填，預設為當前目錄下的 DESIGN.md）" }
            },
            required: ["projectId"]
        }
    }
];

async function main() {
    try {
        log.info("Starting Stitch MCP Server...");

        // 檢查認證
        const gcpProjectId = await getProjectId();
        log.info(`Project: ${gcpProjectId}`);

        await getAccessToken();
        log.success("Auth verified");

        // 建立 MCP Server
        const server = new Server(
            { name: "stitch", version: "1.3.0" },
            { capabilities: { tools: {} } }
        );

        const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

        // Handler: 列出工具
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            try {
                // 從官方 API 取得工具列表
                const result = await callStitchAPI("tools/list", {}, gcpProjectId);
                const officialTools = result.result?.tools || [];

                // 合併自訂工具
                return { tools: [...officialTools, ...CUSTOM_TOOLS] };
            } catch (error) {
                log.error(`tools/list failed: ${error.message}`);
                // 回傳自訂工具作為 fallback
                return { tools: CUSTOM_TOOLS };
            }
        });

        // Handler: 呼叫工具
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                // 處理自訂工具
                if (name === "fetch_screen_code") {
                    const code = await fetchScreenCode(args.projectId, args.screenId, gcpProjectId);
                    return {
                        content: [{ type: "text", text: code }]
                    };
                }

                if (name === "fetch_screen_image") {
                    const result = await fetchScreenImage(args.projectId, args.screenId, gcpProjectId);
                    return {
                        content: [
                            { type: "text", text: `Image saved to ${result.fileName}` },
                            { type: "image", data: result.base64, mimeType: "image/png" }
                        ]
                    };
                }

                if (name === "export_project") {
                    const result = await exportProject(args.projectId, gcpProjectId, args.outputDir);
                    return {
                        content: [{
                            type: "text",
                            text: `✅ Exported ${result.screenCount} screens to ${result.exportDir}\n\nManifest:\n${JSON.stringify(result.manifest, null, 2)}`
                        }]
                    };
                }

                if (name === "init_stitch_project") {
                    const result = await initStitchProject(args.projectId, gcpProjectId, args.outputDir);
                    const screens = Object.keys(result.metadata.screens);
                    return {
                        content: [{
                            type: "text",
                            text: [
                                `✅ .stitch/ initialized at ${result.stitchDir}`,
                                ``,
                                `Files created:`,
                                `  metadata.json  — ${result.screenCount} screens mapped`,
                                `  DESIGN.md      — fill in colors, typography, components`,
                                `  SITE.md        — fill in page goals and audience`,
                                `  designs/       — output directory for Stitch exports`,
                                ``,
                                screens.length > 0 ? `Screens: ${screens.join(', ')}` : `No screens found yet`,
                                ``,
                                `Next steps:`,
                                `  1. Edit .stitch/DESIGN.md — or run: npx skills add google-labs-code/stitch-skills --skill design-md`,
                                `  2. Edit .stitch/SITE.md   — describe your site vision and pages`,
                                `  3. Use stitch-loop skill to auto-generate all pages`
                            ].join('\n')
                        }]
                    };
                }

                if (name === "fetch_design_md") {
                    const result = await fetchDesignMd(args.projectId, gcpProjectId, args.outputPath);
                    return {
                        content: [
                            { type: "text", text: `✅ DESIGN.md saved to ${result.filePath}\n\n---\n\n${result.content}` }
                        ]
                    };
                }

                // 其他工具：轉發給官方 API
                const result = await callStitchAPI("tools/call", {
                    name,
                    arguments: args || {}
                }, gcpProjectId);

                if (result.result) {
                    return result.result;
                }

                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
                };

            } catch (error) {
                log.error(`Tool ${name} failed: ${error.message}`);
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }],
                    isError: true
                };
            }
        });

        // 連接 stdio transport
        const transport = new StdioServerTransport();
        await server.connect(transport);
        log.success("Server ready (stdio)");

    } catch (error) {
        log.error(`Startup failed: ${error.message}`);
        process.exit(1);
    }
}

main();
