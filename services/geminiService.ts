import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ParsedPortData } from "../types";

// Using Gemini 3.0 Flash Preview as per guidelines for basic tasks
const MODEL_NAME = "gemini-3-flash-preview";

const SYSTEM_PROMPT = `
你是一个OCR和数据结构化专家。请分析这张空运价格表的图片。
目标：提取所有目的港及其对应的重量等级价格。

规则：
1. 目的港列如果包含多个代码（如 "AER/ASF/BAX..."），请拆分为 JSON 数组。
2. 提取以下列的价格："+45" mapped to "P45", "+100" mapped to "P100", "+300" mapped to "P300", "+500" mapped to "P500", "+1000" mapped to "P1000".
3. 如果没有对应列，忽略该字段。
4. 忽略 M 和 -45 的价格。
5. 返回纯净的 JSON 格式，不要 Markdown 标记。

JSON 结构示例：
[
  { "ports": ["SVO"], "prices": { "P45": 70, "P100": 45, "P300": 43, "P500": 41, "P1000": 39 } },
  { "ports": ["AER", "ASF"], "prices": { "P45": 100, ... } }
]
`;

export interface AIResponse {
  parsed: ParsedPortData[];
  raw: string;
}

export const parseRateSheetImage = async (base64Image: string): Promise<AIResponse> => {
  // ADAPTATION FOR VITE + VERCEL:
  // Using process.env.API_KEY as per guidelines.
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("API Key not found. Please set API_KEY in your environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });

  // Ensure Base64 is formatted correctly (remove data URI scheme if present)
  // The SDK expects raw base64 data for inlineData
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { text: SYSTEM_PROMPT },
          {
            inlineData: {
              mimeType: "image/png", // Assuming PNG or generic image handling
              data: base64Data
            }
          }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    const content = response.text || "";
    
    let parsed: ParsedPortData[];
    try {
       parsed = JSON.parse(content);
    } catch (e) {
       // Fallback cleanup if model returns markdown block despite JSON mime type
       const clean = content.replace(/```json/g, "").replace(/```/g, "").trim();
       parsed = JSON.parse(clean);
    }
    
    if (!Array.isArray(parsed)) {
      throw new Error("AI returned a JSON object, but it was not an array.");
    }

    return { parsed: parsed, raw: content };

  } catch (error: any) {
    console.error("Gemini API Request Failed:", error);
    throw error;
  }
};