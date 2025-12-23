import { ParsedPortData } from "../types";

// Using Gemini 2.0 Flash via OpenRouter
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_NAME = "google/gemini-2.0-flash-001";

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

export const parseRateSheetImage = async (base64Image: string, apiKey: string): Promise<AIResponse> => {
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  // Ensure Base64 is formatted correctly
  let formattedImage = base64Image;
  if (!base64Image.startsWith("data:")) {
    formattedImage = `data:image/png;base64,${base64Image}`;
  }

  const payload = {
    model: MODEL_NAME,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: SYSTEM_PROMPT },
          { type: "image_url", image_url: { url: formattedImage } }
        ]
      }
    ]
  };

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://airfreight-updater.local",
        "X-Title": "AirFreight Smart Updater"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    if (data.choices && data.choices.length > 0) {
      let content = data.choices[0].message.content || "";
      const originalContent = content; // Keep for debugging
      
      // Robust Parsing Strategy:
      // 1. Remove Markdown code blocks
      content = content.replace(/```json/g, "").replace(/```/g, "").trim();

      // 2. Find the first '[' and last ']' to ignore conversational text
      const firstBracket = content.indexOf('[');
      const lastBracket = content.lastIndexOf(']');

      if (firstBracket !== -1 && lastBracket !== -1) {
        content = content.substring(firstBracket, lastBracket + 1);
      } else {
        // If no brackets found, it might not be a valid array.
        // We still try to parse what we have, or return the raw text for the user to see.
        console.warn("No JSON array brackets found in response");
      }
      
      try {
        const parsed = JSON.parse(content);
        
        if (!Array.isArray(parsed)) {
          throw new Error("AI returned a JSON object, but it was not an array.");
        }

        return { parsed: parsed as ParsedPortData[], raw: originalContent };

      } catch (e) {
        console.error("JSON Parse Error:", content);
        // Throwing error with raw content so we can display it
        throw new Error(`Failed to parse JSON. Raw output: ${originalContent.substring(0, 100)}...`);
      }
    } else {
      throw new Error("No response content from AI model.");
    }

  } catch (error: any) {
    console.error("API Request Failed:", error);
    throw error;
  }
};