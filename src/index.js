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
            { name: "stitch", version: "1.0.0" },
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
