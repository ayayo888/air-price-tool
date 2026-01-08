import { ParsedProfile } from "../types";

// Using Gemini 3.0 Flash Preview
const MODEL_NAME = "google/gemini-3-flash-preview";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// 1. Define strict JSON Schema for Profile Extraction
const EXTRACT_SCHEMA = {
  type: "json_schema",
  json_schema: {
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
              username: { type: "string", description: "账号的名称/用户名" },
              douyinId: { type: "string", description: "抖音号/唯一ID" },
              fans: { type: "string", description: "粉丝数量，保留原始单位如'1.5w'" },
              bio: { type: "string", description: "个人简介全文" },
              contact: { type: "string", description: "提取到的手机/微信/邮箱，无则为空字符串" }
            },
            required: ["username", "douyinId", "fans", "bio", "contact"],
            additionalProperties: false
          }
        }
      },
      required: ["profiles"],
      additionalProperties: false
    }
  }
};

// 2. Define strict JSON Schema for Filtering
const FILTER_SCHEMA = {
  type: "json_schema",
  json_schema: {
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
  }
};

const SYSTEM_PROMPT_EXTRACT = `
你是一个专业的数据清洗助手。你的任务是从用户提供的非结构化文本中提取抖音/TikTok账号信息。
请严格按照提供的 JSON Schema 提取数据。
如果文本中包含多个账号，请全部提取。
如果某个字段在文本中未提及，请留空字符串。
`;

const SYSTEM_PROMPT_FILTER = `
你是一个国际物流行业的数据分析师。请分析提供的账号列表，进行相关性清洗。
目标：找出所有与“国际物流、跨境贸易、货代”【无关】的账号ID。

判定标准（保留，即相关）：
- 关键词：空运、海运、快递、物流、货代、双清包税、空派、海派、集运、海外仓、跨境电商供应链、外贸。

判定标准（删除，即无关）：
- 纯娱乐、生活分享、甚至修车/餐饮等本地服务。
- 纯粹的博览会推广（除非明确是物流展）。
- 卖衣服、卖百货的直播号（除非是卖物流服务）。

请返回那些【完全无关】的账号的 ID 列表。
`;

// Helper to parse JSON even if the model wraps it in markdown (though json_schema usually prevents this)
const parseResponse = (content: string): any => {
  try {
    return JSON.parse(content);
  } catch (e) {
    // Fallback: clean markdown
    const clean = content.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  }
};

export const extractProfilesFromText = async (text: string, apiKey: string): Promise<ParsedProfile[]> => {
  if (!apiKey) throw new Error("请输入 OpenRouter API Key");

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
          { role: "system", content: SYSTEM_PROMPT_EXTRACT },
          { role: "user", content: text }
        ],
        response_format: EXTRACT_SCHEMA,
        // Reasoning is compatible with structured outputs on some models, keeping it enabled for better logic
        reasoning: { enabled: true },
        max_tokens: 64000 
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "API 请求失败");
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    const parsedObj = parseResponse(content);
    
    // According to schema, the root object has a 'profiles' array
    if (parsedObj && Array.isArray(parsedObj.profiles)) {
      return parsedObj.profiles;
    }

    return [];

  } catch (error) {
    console.error("Extraction Error:", error);
    throw error;
  }
};

export const filterIrrelevantProfiles = async (rows: { id: number | string, text: string }[], apiKey: string): Promise<any[]> => {
  if (!apiKey) throw new Error("请输入 OpenRouter API Key");

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
        response_format: FILTER_SCHEMA,
        reasoning: { enabled: true },
        max_tokens: 64000
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "API 请求失败");
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    const parsedObj = parseResponse(content);

    // According to schema, the root object has 'ids_to_remove' array
    if (parsedObj && Array.isArray(parsedObj.ids_to_remove)) {
      return parsedObj.ids_to_remove;
    }
    
    return [];

  } catch (error) {
    console.error("Filter Error:", error);
    throw error;
  }
};
