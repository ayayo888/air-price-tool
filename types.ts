
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

// Added types for PriceUpdater context
export interface ParsedPortData {
  ports: string[];
  prices: {
    [key: string]: number | string;
  };
}

export interface PriceUpdatePreview {
  rowId: number | string;
  rowIndex: number;
  port: string;
  updates: Record<string, number | string>;
  isMatch: boolean;
  oldP45?: string | number;
  newP45?: string | number;
}

export type SheetRow = CleanerRow;
