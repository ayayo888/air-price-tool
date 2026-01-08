
// The standardized row structure for the Data Cleaner
export interface CleanerRow {
  _internal_id?: number | string; // React Key
  用户名: string;
  抖音号: string;
  粉丝数: string | number;
  简介: string;
  联系方式: string;
  [key: string]: any; // Allow dynamic access
}

export interface ParsedProfile {
  username: string;
  douyinId: string;
  fans: string;
  bio: string;
  contact: string;
}

export interface AIResponse {
  raw: string;
  parsed: ParsedProfile[];
}

export type SheetRow = CleanerRow;
