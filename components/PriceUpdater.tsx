import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ParsedPortData, PriceUpdatePreview, SheetRow } from '../types';
import { parseRateSheetImage, AIResponse } from '../services/geminiService';

interface PriceUpdaterProps {
  currentData: SheetRow[];
  headers: string[];
  onApplyUpdates: (updates: PriceUpdatePreview[]) => void;
}

// Configuration for mapping Excel Headers to Logic
interface ColumnMapping {
  port: string;
  p45: string;
  p100: string;
  p300: string;
  p500: string;
  p1000: string;
}

// New: Configuration for Pricing Rules
type AdjustmentMode = 'default' | 'add' | 'subtract';

interface PriceAdjustment {
  mode: AdjustmentMode;
  value: number;
}

interface AdjustmentRules {
  p45: PriceAdjustment;
  p100: PriceAdjustment;
  p300: PriceAdjustment;
  p500: PriceAdjustment;
  p1000: PriceAdjustment;
}

export const PriceUpdater: React.FC<PriceUpdaterProps> = ({ currentData, headers, onApplyUpdates }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [previews, setPreviews] = useState<PriceUpdatePreview[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [stats, setStats] = useState({ foundInImage: 0, matchesInSheet: 0 });
  const [rawResponse, setRawResponse] = useState<string>("");
  
  // Debug info for troubleshooting
  const [debugInfo, setDebugInfo] = useState<{ aiSample: string[], sheetSample: string[] } | null>(null);
  
  // Column Mapping State
  const [showConfig, setShowConfig] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({
    port: '', p45: '', p100: '', p300: '', p500: '', p1000: ''
  });

  // Price Adjustment Rules State (Default: Add 0)
  const [adjustments, setAdjustments] = useState<AdjustmentRules>({
    p45: { mode: 'add', value: 0 },
    p100: { mode: 'add', value: 0 },
    p300: { mode: 'add', value: 0 },
    p500: { mode: 'add', value: 0 },
    p1000: { mode: 'add', value: 0 },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load API Key
  useEffect(() => {
    const savedKey = localStorage.getItem('openrouter_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setApiKey(val);
    localStorage.setItem('openrouter_api_key', val);
  };

  // --- Auto-Guess Columns on Header Change ---
  useEffect(() => {
    if (headers.length === 0) return;

    const guess = (keywords: string[]) => 
      headers.find(h => keywords.some(k => h.toLowerCase().includes(k))) || '';

    setMapping({
      port: guess(['port', 'code', 'dest', 'pod', 'city']), 
      p45:  headers.find(h => h.includes('45')) || '',
      p100: headers.find(h => h.includes('100') && !h.includes('1000')) || '',
      p300: headers.find(h => h.includes('300')) || '',
      p500: headers.find(h => h.includes('500')) || '',
      p1000: headers.find(h => h.includes('1000')) || '',
    });
  }, [headers]);

  // --- Logic 1: Handle Image Input ---
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setImage(event.target.result as string);
              setStatusMsg("Image loaded from clipboard.");
            }
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImage(event.target.result as string);
          setStatusMsg("Image loaded from file.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Logic 2: Call API & Generate Previews ---
  const handleParse = async () => {
    if (!image) return;
    if (!apiKey) {
      alert("Please enter your OpenRouter API Key first.");
      return;
    }
    if (!mapping.port) {
      alert("⚠️ Port Column is not mapped. Please open '⚙️ Column Mapping' and configure it.");
      setShowConfig(true);
      return;
    }

    setIsLoading(true);
    setStatusMsg("Sending to OpenRouter (Gemini 2.0 Flash)...");
    setRawResponse("");
    setDebugInfo(null);

    try {
      const result: AIResponse = await parseRateSheetImage(image, apiKey);
      setRawResponse(result.raw); 
      generatePreviews(result.parsed);
      setStep(2);
      setStatusMsg("Analysis complete.");
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const generatePreviews = (apiData: ParsedPortData[]) => {
    const priceMap: Record<string, any> = {};
    let totalPortsFound = 0;
    const aiSampleKeys: string[] = []; 
    
    if (apiData && Array.isArray(apiData)) {
      apiData.forEach(item => {
        if (item.ports && Array.isArray(item.ports)) {
          item.ports.forEach(port => {
            const cleanPort = port.trim().toUpperCase();
            priceMap[cleanPort] = item.prices;
            totalPortsFound++;
            if (aiSampleKeys.length < 5) aiSampleKeys.push(cleanPort);
          });
        }
      });
    }

    console.log("AI Data Map (Sample):", aiSampleKeys);

    const newPreviews: PriceUpdatePreview[] = [];
    let matchedPortsCount = 0;
    const sheetSampleValues: string[] = [];

    currentData.forEach((row, index) => {
      const rawPort = row[mapping.port]; 
      if (rawPort === undefined || rawPort === null || rawPort === "") return;
      
      const portKey = String(rawPort).trim().toUpperCase();
      if (sheetSampleValues.length < 5) sheetSampleValues.push(portKey);

      if (priceMap[portKey]) {
        matchedPortsCount++;
        const rawPrices = priceMap[portKey]; 
        
        // ============ [Updated Logic: Dynamic Markup] ============
        const calculatePrice = (key: string, rule: PriceAdjustment): number | string => {
           const val = rawPrices[key];
           if (val !== undefined && val !== null && val !== "") {
             const num = Number(val);
             if (isNaN(num)) return "";

             // Apply Rules
             if (rule.mode === 'default') return num;
             if (rule.mode === 'add') return num + rule.value;
             if (rule.mode === 'subtract') return num - rule.value;
             
             return num;
           }
           return "";
        };

        const calculatedPrices = {
          "P45":   calculatePrice("P45", adjustments.p45),
          "P100":  calculatePrice("P100", adjustments.p100),
          "P300":  calculatePrice("P300", adjustments.p300),
          "P500":  calculatePrice("P500", adjustments.p500),
          "P1000": calculatePrice("P1000", adjustments.p1000)
        };
        // =========================================================

        const updates: Record<string, number | string> = {};
        if (mapping.p45 && calculatedPrices.P45 !== "") updates[mapping.p45] = calculatedPrices.P45;
        if (mapping.p100 && calculatedPrices.P100 !== "") updates[mapping.p100] = calculatedPrices.P100;
        if (mapping.p300 && calculatedPrices.P300 !== "") updates[mapping.p300] = calculatedPrices.P300;
        if (mapping.p500 && calculatedPrices.P500 !== "") updates[mapping.p500] = calculatedPrices.P500;
        if (mapping.p1000 && calculatedPrices.P1000 !== "") updates[mapping.p1000] = calculatedPrices.P1000;

        if (Object.keys(updates).length > 0) {
          const oldP45Val = mapping.p45 ? row[mapping.p45] : '-';

          newPreviews.push({
            rowId: row._internal_id || index,
            rowIndex: index + 1,
            port: portKey,
            updates: updates,
            isMatch: true,
            oldP45: oldP45Val,
            newP45: calculatedPrices.P45
          });
        }
      }
    });
    
    console.log("Sheet Column Sample:", sheetSampleValues);
    setStats({ foundInImage: totalPortsFound, matchesInSheet: matchedPortsCount });
    setDebugInfo({ aiSample: aiSampleKeys, sheetSample: sheetSampleValues });
    setPreviews(newPreviews);
  };

  const handleReset = () => {
    setImage(null);
    setPreviews([]);
    setStep(1);
    setStatusMsg("");
    setRawResponse("");
    setDebugInfo(null);
  };

  const handleSubmit = () => {
    onApplyUpdates(previews);
    handleReset();
    setStatusMsg("Success: Database updated successfully.");
    setTimeout(() => setStatusMsg(""), 3000);
  };

  // Helper for rendering column select + markup options
  const renderPriceConfigBlock = (
    label: string, 
    colKey: keyof ColumnMapping, 
    ruleKey: keyof AdjustmentRules
  ) => {
    return (
      <div className="border border-gray-200 p-2 rounded bg-gray-50/50">
        <label className="block text-gray-600 mb-1 font-medium">{label}</label>
        
        {/* Column Select */}
        <select 
          className="w-full p-1 border border-gray-300 rounded bg-white text-gray-700 text-xs mb-2"
          value={mapping[colKey]}
          onChange={(e) => setMapping({...mapping, [colKey]: e.target.value})}
        >
          <option value="" className="text-gray-400">(Skip Column)</option>
          {headers.map(h => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>

        {/* Logic: Add/Sub/Default */}
        <div className="flex gap-1 items-center">
          <select 
            className="flex-1 p-1 border border-gray-300 rounded bg-white text-gray-700 text-xs"
            value={adjustments[ruleKey].mode}
            onChange={(e) => {
              const newMode = e.target.value as AdjustmentMode;
              setAdjustments({
                ...adjustments,
                [ruleKey]: { ...adjustments[ruleKey], mode: newMode }
              });
            }}
          >
            <option value="default">Default (No Change)</option>
            <option value="add">Increase (+)</option>
            <option value="subtract">Decrease (-)</option>
          </select>

          <input 
            type="number"
            min="0"
            className={`w-12 p-1 border border-gray-300 rounded bg-white text-gray-700 text-xs text-center ${adjustments[ruleKey].mode === 'default' ? 'opacity-50 bg-gray-100 cursor-not-allowed' : ''}`}
            value={adjustments[ruleKey].value}
            disabled={adjustments[ruleKey].mode === 'default'}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              setAdjustments({
                ...adjustments,
                [ruleKey]: { ...adjustments[ruleKey], value: val }
              });
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex flex-col">
      {/* Header with API Key & Config Toggle */}
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-3">
        <h2 className="font-semibold text-gray-700">Price Updater Wizard</h2>
        
        <div className="relative">
          <input 
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={handleApiKeyChange}
            placeholder="Enter OpenRouter API Key"
            className="w-full text-xs p-2 pr-8 border border-gray-300 rounded bg-white focus:border-blue-500 focus:outline-none"
          />
          <button 
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600"
          >
            {showApiKey ? '🙈' : '👁️'}
          </button>
        </div>

        {/* Configuration Toggle */}
        <div className="bg-white border border-gray-200 rounded p-2 shadow-sm">
           <button 
             onClick={() => setShowConfig(!showConfig)}
             className="flex items-center justify-between w-full text-xs font-semibold text-gray-600 hover:text-blue-600"
           >
             <span>⚙️ Column Mapping & Rules {(!mapping.port) && <span className="text-red-500">(Required!)</span>}</span>
             <span>{showConfig ? '▲' : '▼'}</span>
           </button>
           
           {showConfig && (
             <div className="mt-2 flex flex-col gap-3 text-xs max-h-[300px] overflow-y-auto pr-1">
               <div className="border border-gray-200 p-2 rounded bg-blue-50/50">
                 <label className="block text-gray-600 mb-1 font-medium">Port / Destination Column <span className="text-red-500">*</span></label>
                 <select 
                   className={`w-full p-1 border rounded bg-white text-gray-700 ${!mapping.port ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                   value={mapping.port}
                   onChange={(e) => setMapping({...mapping, port: e.target.value})}
                 >
                   <option value="">(Select Column with Airport Codes)</option>
                   {headers.map(h => (
                     <option key={h} value={h}>{h}</option>
                   ))}
                 </select>
               </div>
               
               {renderPriceConfigBlock("+45 kg", "p45", "p45")}
               {renderPriceConfigBlock("+100 kg", "p100", "p100")}
               {renderPriceConfigBlock("+300 kg", "p300", "p300")}
               {renderPriceConfigBlock("+500 kg", "p500", "p500")}
               {renderPriceConfigBlock("+1000 kg", "p1000", "p1000")}
             </div>
           )}
        </div>
      </div>

      <div className="p-6 flex-1 overflow-auto">
        {step === 1 && (
          <div className="flex flex-col h-full space-y-4">
            <div 
              onPaste={handlePaste}
              className="flex-1 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center bg-gray-50 hover:bg-blue-50 hover:border-blue-400 transition-colors cursor-pointer p-8 text-center"
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleFileSelect}
              />
              {image ? (
                 <div className="relative w-full h-full flex items-center justify-center">
                   <img src={image} alt="Preview" className="max-h-64 object-contain shadow-md rounded" />
                   <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-10 transition-all">
                      <span className="bg-white px-3 py-1 rounded shadow text-sm opacity-0 hover:opacity-100">Click to change</span>
                   </div>
                 </div>
              ) : (
                <>
                  <p className="text-gray-500 font-medium">Click to upload or <span className="text-blue-600">Ctrl+V</span></p>
                  <p className="text-gray-400 text-sm">PNG, JPG, Screenshots</p>
                </>
              )}
            </div>

            <button
              onClick={handleParse}
              disabled={!image || isLoading || !apiKey || !mapping.port}
              className={`w-full py-3 rounded-md font-semibold text-white transition-all shadow-md
                ${!image || isLoading || !apiKey || !mapping.port ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isLoading ? 'Processing...' : 'Identify & Parse Prices'}
            </button>
            {statusMsg && <p className="text-center text-sm text-gray-600 mt-2">{statusMsg}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col h-full">
            <div className="flex flex-col mb-4">
              <h3 className="text-lg font-medium text-gray-800">Review Updates</h3>
              <div className="text-xs text-gray-500 mt-1">
                 Image Ports: <b>{stats.foundInImage}</b> | Sheet Matches: <b>{stats.matchesInSheet}</b>
              </div>
            </div>
            
            {previews.length === 0 && stats.foundInImage > 0 && debugInfo && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 p-3 rounded text-xs text-yellow-800">
                <p className="font-bold mb-1">⚠️ No Matches Found!</p>
                <p className="mb-2">We found ports in the image, but none matched column <b>"{mapping.port}"</b> in your sheet.</p>
                
                <div className="grid grid-cols-2 gap-2 mt-2">
                   <div className="bg-white p-2 rounded border border-yellow-100">
                     <span className="block font-semibold text-gray-500 mb-1">AI Detected (Sample):</span>
                     <code className="text-gray-700 block break-words">{JSON.stringify(debugInfo.aiSample)}</code>
                   </div>
                   <div className="bg-white p-2 rounded border border-yellow-100">
                     <span className="block font-semibold text-gray-500 mb-1">Sheet Column (Sample):</span>
                     <code className="text-gray-700 block break-words">{JSON.stringify(debugInfo.sheetSample)}</code>
                   </div>
                </div>
                <div className="mt-2 text-yellow-700 italic">
                   Tip: Go to "⚙️ Column Mapping" above and ensure you selected the column containing Airport Codes (e.g., SVO, HKG), not city names.
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto border border-gray-200 rounded-lg mb-4 bg-white">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100 text-gray-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left border-b border-gray-200">Row</th>
                    <th className="px-3 py-2 text-left border-b border-gray-200">Port</th>
                    <th className="px-3 py-2 text-left border-b border-gray-200">P45 (Old)</th>
                    <th className="px-3 py-2 text-left border-b border-gray-200">P45 (New)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previews.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-gray-500">
                        {stats.foundInImage === 0 ? "AI found no data in image." : "No matches found in database."}
                      </td>
                    </tr>
                  ) : (
                    previews.map((item, idx) => (
                      <tr key={idx} className="hover:bg-blue-50">
                        <td className="px-3 py-2 text-gray-500">{item.rowIndex}</td>
                        <td className="px-3 py-2 font-bold text-gray-800">{item.port}</td>
                        <td className="px-3 py-2 text-gray-400">{item.oldP45}</td>
                        <td className="px-3 py-2 font-bold text-green-600 flex items-center">
                           {item.newP45}
                           {Object.keys(item.updates).length > 1 && (
                             <span className="ml-2 text-[10px] text-gray-400 cursor-help border-b border-dotted border-gray-300" title={`Updates included: ${Object.keys(item.updates).join(', ')}`}>
                               (+{Object.keys(item.updates).length - 1} cols)
                             </span>
                           )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Debug: Raw Response */}
            {rawResponse && (
              <details className="mb-4">
                <summary className="text-xs font-bold text-gray-500 cursor-pointer">Debug: Raw API Response</summary>
                <pre className="mt-2 text-[10px] text-gray-600 whitespace-pre-wrap overflow-auto max-h-40 p-2 bg-gray-100 rounded">
                  {rawResponse}
                </pre>
              </details>
            )}

            <div className="flex space-x-3">
              <button
                onClick={handleReset}
                className="flex-1 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={previews.length === 0}
                className={`flex-1 py-2 rounded-md font-semibold text-white shadow-sm
                  ${previews.length === 0 ? 'bg-gray-300' : 'bg-green-600 hover:bg-green-700'}`}
              >
                Confirm Updates
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};