import { ParsedProfile } from "../types";

// Using Gemini 2.0 Flash
const MODEL_NAME = "google/gemini-2.0-flash-001";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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

const SYSTEM_PROMPT_EXTRACT = `
你是一个专业的数据清洗助手。你的任务是从用户提供的非结构化文本中提取抖音/TikTok账号信息。
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
`;

// --- Helper: Robust JSON Parsing with Logging ---
const safeJsonParse = (rawText: string, context: string) => {
  console.log(`[${context}] Raw Model Output:`, rawText); // DEBUG LOG

  try {
    // 1. Try direct parse
    return JSON.parse(rawText);
  } catch (e) {
    console.warn(`[${context}] Direct JSON parse failed, trying to strip Markdown...`);
    
    // 2. Try stripping Markdown code blocks (common issue even with structured outputs)
    const cleanText = rawText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
      
    try {
      return JSON.parse(cleanText);
    } catch (e2) {
      console.error(`[${context}] Final JSON parse failed.`, e2);
      throw new Error(`无法解析 API 返回的 JSON: ${(e2 as Error).message}`);
    }
  }
};

export const extractProfilesFromText = async (text: string, apiKey: string): Promise<ParsedProfile[]> => {
  if (!apiKey) throw new Error("请输入 OpenRouter API Key");

  console.log("[Extract] Sending request to OpenRouter...", { model: MODEL_NAME });

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
        response_format: {
          type: "json_schema",
          json_schema: EXTRACT_JSON_SCHEMA
        },
        max_tokens: 64000
      })
    });

    // Get raw text first to avoid crashing on non-JSON error pages
    const responseBodyText = await response.text();
    
    // Log the status and body length
    console.log(`[Extract] Response Status: ${response.status}`);
    console.log(`[Extract] Response Body Preview: ${responseBodyText.substring(0, 200)}...`);

    if (!response.ok) {
      // Try to parse error message from JSON, otherwise use text
      let errorMsg = `API Error: ${response.status}`;
      try {
        const errorJson = JSON.parse(responseBodyText);
        if (errorJson.error && errorJson.error.message) {
          errorMsg = errorJson.error.message;
        }
      } catch {
        errorMsg += ` - ${responseBodyText}`; // Append raw text if not JSON
      }
      throw new Error(errorMsg);
    }

    const data = JSON.parse(responseBodyText);
    const contentStr = data.choices?.[0]?.message?.content;
    
    if (!contentStr) {
      console.error("[Extract] Unexpected structure:", data);
      throw new Error("API 返回结构异常: choices[0].message.content 为空");
    }

    // Robust Parse
    const parsedObj = safeJsonParse(contentStr, "Extract");
    
    if (parsedObj && Array.isArray(parsedObj.profiles)) {
      return parsedObj.profiles;
    }

    console.warn("[Extract] Valid JSON but missing 'profiles' array:", parsedObj);
    return [];

  } catch (error) {
    console.error("[Extract] Fatal Error:", error);
    throw error;
  }
};

export const filterIrrelevantProfiles = async (rows: { id: number | string, text: string }[], apiKey: string): Promise<any[]> => {
  if (!apiKey) throw new Error("请输入 OpenRouter API Key");

  console.log("[Filter] Sending request...", { count: rows.length });

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

    console.log(`[Filter] Response Status: ${response.status}`);
    
    if (!response.ok) {
       let errorMsg = `API Error: ${response.status}`;
       try {
         const errorJson = JSON.parse(responseBodyText);
         if (errorJson.error && errorJson.error.message) {
           errorMsg = errorJson.error.message;
         }
       } catch {
         errorMsg += ` - ${responseBodyText}`;
       }
       throw new Error(errorMsg);
    }

    const data = JSON.parse(responseBodyText);
    const contentStr = data.choices?.[0]?.message?.content;

    if (!contentStr) {
      console.error("[Filter] Unexpected structure:", data);
      throw new Error("API 返回内容为空");
    }
    
    // Robust Parse
    const parsedObj = safeJsonParse(contentStr, "Filter");

    if (parsedObj && Array.isArray(parsedObj.ids_to_remove)) {
      return parsedObj.ids_to_remove;
    }
    
    console.warn("[Filter] Valid JSON but missing 'ids_to_remove':", parsedObj);
    return [];

  } catch (error) {
    console.error("[Filter] Fatal Error:", error);
    throw error;
  }
};
