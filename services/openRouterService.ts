import { ParsedProfile } from "../types";

// Using Gemini 2.0 Flash on OpenRouter for high speed and long context
const MODEL_NAME = "google/gemini-2.0-flash-001";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT_EXTRACT = `
你是一个专业的数据清洗助手。你的任务是从用户提供的非结构化文本中提取抖音/TikTok账号信息。
请严格按照以下规则提取 JSON 数组：

字段定义：
1. username (用户名): 账号的名称。
2. douyinId (抖音号): 账号的唯一ID。如果没找到，尝试从主页链接或文本中提取。
3. fans (粉丝数): 粉丝数量（保留原始单位，如 10.5w）。
4. bio (简介): 用户的个人简介文本。
5. contact (联系方式): 从简介或文本中提取手机号、微信号、邮箱。如果没有，留空。

输出格式要求：
只返回纯净的 JSON 数组，不要包含 Markdown 格式（如 \`\`\`json）。不要有任何其他解释性文字。
示例：
[
  { "username": "国际物流小王", "douyinId": "wang_logistics", "fans": "5.2w", "bio": "专注欧美空派，V: 13800000000", "contact": "13800000000" }
]
`;

const SYSTEM_PROMPT_FILTER = `
你是一个国际物流行业的数据分析师。请分析提供的账号列表，进行相关性清洗。
目标：保留所有可能与“国际物流”或“国际贸易”相关的账号，排除完全不相关的账号。

判定标准（保留）：
- 关键词：空运、海运、快递、速递、物流、货代、双清包税、空派、海派、集运、海外仓、跨境电商供应链、外贸、进出口。
- 即使是擦边的（如“义乌小商品出海”），只要涉及贸易或运输，都保留。

判定标准（排除/删除）：
- 完全无关的娱乐账号、个人生活分享。
- 国内本地生活服务（如修车、餐饮）。
- 纯粹的博览会推广（除非明确是物流展）。
- 甄选店、带货直播（除非是卖物流服务）。

输入：一个包含 id 和 text (用户名+简介) 的 JSON 数组。
输出：只返回一个包含需要【删除/排除】的 id 的 JSON 数组。不要Markdown格式。
示例输出：[1, 5, 8]  <-- 这些是无关账号的ID
`;

export const extractProfilesFromText = async (text: string, apiKey: string): Promise<ParsedProfile[]> => {
  if (!apiKey) throw new Error("请输入 OpenRouter API Key");

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin, // OpenRouter requirement
        "X-Title": "Data Cleaner Tool"
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_EXTRACT },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" } // Try to force JSON
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "API 请求失败");
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Cleanup potential Markdown
    const cleanContent = content.replace(/```json/g, "").replace(/```/g, "").trim();
    
    // OpenRouter/Gemini might wrap array in object like { profiles: [...] } or just return [...]
    // We try to handle both.
    let parsed;
    try {
        parsed = JSON.parse(cleanContent);
    } catch(e) {
        throw new Error("API 返回格式错误，非 JSON");
    }

    if (Array.isArray(parsed)) return parsed;
    if (parsed.profiles && Array.isArray(parsed.profiles)) return parsed.profiles;
    if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
    
    // Last ditch: if it returned a single object instead of array
    if (typeof parsed === 'object') return [parsed];

    return [];

  } catch (error) {
    console.error("Extraction Error:", error);
    throw error;
  }
};

export const filterIrrelevantProfiles = async (rows: { id: number | string, text: string }[], apiKey: string): Promise<any[]> => {
  if (!apiKey) throw new Error("请输入 OpenRouter API Key");

  // Chunking logic: If rows are too many, we might need to split, but Gemini Flash has huge context.
  // We'll send batches of 50 to be safe and get quicker feedback.
  
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
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "API 请求失败");
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const cleanContent = content.replace(/```json/g, "").replace(/```/g, "").trim();
    
    return JSON.parse(cleanContent); // Should be array of IDs

  } catch (error) {
    console.error("Filter Error:", error);
    throw error;
  }
};
