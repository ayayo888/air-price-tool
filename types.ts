
export interface PriceSet {
  P45: number | string | null;
  P100: number | string | null;
  P300: number | string | null;
  P500: number | string | null;
  P1000: number | string | null;
}

// Represents the "Database" row (The Spreadsheet Row)
// Generic record to support any structure
export interface SheetRow {
  _internal_id?: number | string; // Used for React keys / internal tracking
  // New: Track which specific columns were updated by AI to highlight them
  _highlights?: Record<string, boolean>; 
  [key: string]: any; 
}

// Represents the data parsed from Gemini
export interface ParsedPortData {
  ports: string[];
  prices: Partial<PriceSet>;
}

// Represents the calculated update to be previewed
export interface PriceUpdatePreview {
  rowId: number | string;
  rowIndex: number;     // 1-based index for display
  port: string;
  // We store the specific updates we want to apply as key-value pairs
  updates: Record<string, number | string>;
  isMatch: boolean;
  
  // Fields for UI Preview (mimicking the GAS HTML table)
  oldP45?: string | number;
  newP45?: string | number;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  UPDATER = 'UPDATER',
}
