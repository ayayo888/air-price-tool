import { ParsedProfile } from "../types";

// Using Gemini 2.0 Flash (OpenRouter ID)
const MODEL_NAME = "google/gemini-2.0-flash-001";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

console.log("[System] OpenRouter Service Loaded - Version: Win10-Gemini2.0-Flash-AutoBatch");

// Custom Error class to transport raw response to UI
export class ApiError extends Error {
  rawResponse?: string;
  constructor(message: string, rawResponse?: string) {
    super(message);
    this.name = 'ApiError';
    this.rawResponse = rawResponse;
  }
}

// 1. Strict Schema for Extraction
const EXTRACT_JSON_SCHEMA = {
  name: "extracted_profiles_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      profiles: {
        type: "array",
        description: "A list of extracted user profiles",
        items: {
          type: "object",
          properties: {
            username: { 
              type: "string", 
              description: "账号的名称/用户名" 
            },
            douyinId: { 
              type: "string", 
              description: "抖音号/唯一ID. 如果未找到，请返回空字符串" 
            },
            fans: { 
              type: "string", 
              description: "粉丝数量，保留原始单位如'1.5w'. 如果未找到，请返回空字符串" 
            },
            bio: { 
              type: "string", 
              description: "个人简介全文. 如果未找到，请返回空字符串" 
            },
            contact: { 
              type: "string", 
              description: "提取到的手机/微信/邮箱. 如果未找到，请返回空字符串" 
            }
          },
          required: ["username", "douyinId", "fans", "bio", "contact"],
          additionalProperties: false
        }
      }
    },
    required: ["profiles"],
    additionalProperties: false
  }
};

// 2. Strict Schema for Filtering
const FILTER_JSON_SCHEMA = {
  name: "filtered_ids_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      ids_to_remove: {
        type: "array",
        description: "List of IDs belonging to irrelevant profiles that should be removed",
        items: {
          type: "number",
          description: "The numeric ID of the profile"
        }
      }
    },
    required: ["ids_to_remove"],
    additionalProperties: false
  }
};

// --- UPDATED PROMPTS ---

const SYSTEM_PROMPT_EXTRACT = `
你是一个专业的数据清洗助手。你的任务是从用户提供的非结构化文本中提取抖音/TikTok账号信息。

【目标输出格式示例】
请严格按照以下 JSON 格式输出，不要包含任何其他文字：
{
  "profiles": [
    {
      "username": "示例用户A",
      "douyinId": "dy123456",
      "fans": "10.5w",
      "bio": "专注欧美物流",
      "contact": "13800138000"
    }
  ]
}

【严格规则】
1. 直接返回 JSON 对象，不要使用 Markdown 代码块。
2. 如果未提取到数据，返回 { "profiles": [] }。
`;

const SYSTEM_PROMPT_FILTER = `
你是一个国际物流行业的数据分析师。请分析提供的账号列表，进行相关性清洗。
目标：找出所有与“国际物流、跨境贸易、货代”【无关】的账号ID。

【判定标准】
- 保留（相关）：空运、海运、快递、物流、货代、双清包税、空派、海派、集运、海外仓、跨境电商供应链、外贸。
- 删除（无关）：纯娱乐、生活分享、甚至修车/餐饮等本地服务、纯粹的博览会推广（除非明确是物流展）、卖衣服/百货直播号。

【目标输出格式示例】
请严格按照以下 JSON 格式输出，只包含需要删除的 ID 列表：
{
  "ids_to_remove": [ 101, 102, 505 ]
}
`;

// --- Helper: Robust JSON Parsing ---
const safeJsonParse = (rawText: string, context: string) => {
  try {
    return JSON.parse(rawText);
  } catch (e) {
    console.warn(`[${context}] Direct JSON parse failed, trying to strip Markdown...`);
    let cleanText = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }
      
    try {
      return JSON.parse(cleanText);
    } catch (e2) {
      console.error(`[${context}] Final JSON parse failed.`, e2);
      throw new ApiError(`JSON Parse Failed: ${(e2 as Error).message}`, rawText);
    }
  }
};

// --- Internal Single Batch Request ---
const processSingleBatch = async (textChunk: string, apiKey: string): Promise<ParsedProfile[]> => {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "Data Cleaner Tool"
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_EXTRACT },
        { role: "user", content: textChunk }
      ],
      response_format: {
        type: "json_schema",
        json_schema: EXTRACT_JSON_SCHEMA
      },
      max_tokens: 64000 
    })
  });

  const responseBodyText = await response.text();
  
  if (!response.ok) {
    let errorMsg = `API Error: ${response.status}`;
    try {
      const errorJson = JSON.parse(responseBodyText);
      if (errorJson.error && errorJson.error.message) {
        errorMsg = errorJson.error.message;
      }
    } catch { /* ignore */ }
    throw new ApiError(errorMsg, responseBodyText);
  }

  const data = JSON.parse(responseBodyText);
  const contentStr = data.choices?.[0]?.message?.content;
  
  if (!contentStr) throw new ApiError("Empty Content", responseBodyText);

  const parsedObj = safeJsonParse(contentStr, "ExtractBatch");
  return parsedObj?.profiles || [];
};

// --- Main Export with Batching Logic ---
export const extractProfilesFromText = async (
  fullText: string, 
  apiKey: string,
  onProgress?: (current: number, total: number) => void
): Promise<ParsedProfile[]> => {
  if (!apiKey) throw new Error("请输入 OpenRouter API Key");

  // 1. Split text into chunks to avoid token limits/truncation
  // Splitting by 50 lines is a safe heuristic for ~4k output tokens
  const lines = fullText.split('\n');
  const CHUNK_SIZE = 50; 
  const chunks: string[] = [];
  
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunk = lines.slice(i, i + CHUNK_SIZE).join('\n');
    if (chunk.trim()) {
      chunks.push(chunk);
    }
  }

  console.log(`[Batching] Input split into ${chunks.length} chunks.`);
  
  let allProfiles: ParsedProfile[] = [];

  // 2. Process chunks sequentially
  for (let i = 0; i < chunks.length; i++) {
    if (onProgress) onProgress(i + 1, chunks.length);
    
    try {
      console.log(`[Batching] Processing chunk ${i + 1}/${chunks.length}...`);
      const batchProfiles = await processSingleBatch(chunks[i], apiKey);
      allProfiles = [...allProfiles, ...batchProfiles];
    } catch (error) {
      console.error(`[Batching] Chunk ${i + 1} failed:`, error);
      // We continue to the next chunk instead of failing everything
      // Optional: Add a placeholder error profile or just log it
    }
  }

  return allProfiles;
};

export const filterIrrelevantProfiles = async (rows: { id: number | string, text: string }[], apiKey: string): Promise<any[]> => {
  if (!apiKey) throw new Error("请输入 OpenRouter API Key");

  // Filtering is usually lighter on output tokens (just IDs), 
  // but if input is huge, we might need batching here too later.
  // For now, let's keep it simple as user explicitly asked about extraction issues.

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "Data Cleaner Tool"
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_FILTER },
          { role: "user", content: JSON.stringify(rows) }
        ],
        response_format: {
          type: "json_schema",
          json_schema: FILTER_JSON_SCHEMA
        },
        max_tokens: 64000
      })
    });

    const responseBodyText = await response.text();
    
    if (!response.ok) {
       throw new Error(`API Error: ${response.status}`);
    }

    const data = JSON.parse(responseBodyText);
    const contentStr = data.choices?.[0]?.message?.content;
    const parsedObj = safeJsonParse(contentStr || "{}", "Filter");

    return parsedObj?.ids_to_remove || [];

  } catch (error) {
    console.error("[Filter] Fatal Error:", error);
    throw error;
  }
};