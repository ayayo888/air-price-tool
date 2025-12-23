import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ParsedPortData, PriceUpdatePreview, SheetRow } from '../types';
import { parseRateSheetImage, AIResponse } from '../services/geminiService';

interface PriceUpdaterProps {
  currentData: SheetRow[];
  headers: string[];
  onApplyUpdates: (updates: PriceUpdatePreview[]) => void;
}

interface ColumnMapping {
  port: string; p45: string; p100: string; p300: string; p500: string; p1000: string;
}
type AdjustmentMode = 'default' | 'add' | 'subtract';
interface PriceAdjustment { mode: AdjustmentMode; value: number; }
interface AdjustmentRules {
  p45: PriceAdjustment; p100: PriceAdjustment; p300: PriceAdjustment; p500: PriceAdjustment; p1000: PriceAdjustment;
}

export const PriceUpdater: React.FC<PriceUpdaterProps> = ({ currentData, headers, onApplyUpdates }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [previews, setPreviews] = useState<PriceUpdatePreview[]>([]);
  // Removed API key state to comply with guidelines (use process.env.API_KEY)
  const [stats, setStats] = useState({ foundInImage: 0, matchesInSheet: 0 });
  const [rawResponse, setRawResponse] = useState<string>("");
  const [debugInfo, setDebugInfo] = useState<{ aiSample: string[], sheetSample: string[] } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({ port: '', p45: '', p100: '', p300: '', p500: '', p1000: '' });
  const [adjustments, setAdjustments] = useState<AdjustmentRules>({
    p45: { mode: 'add', value: 0 }, p100: { mode: 'add', value: 0 }, p300: { mode: 'add', value: 0 }, p500: { mode: 'add', value: 0 }, p1000: { mode: 'add', value: 0 },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headers.length === 0) return;
    const guess = (keywords: string[]) => headers.find(h => keywords.some(k => h.toLowerCase().includes(k))) || '';
    setMapping({
      port: guess(['port', 'code', 'dest', 'pod', 'city']), 
      p45:  headers.find(h => h.includes('45')) || '',
      p100: headers.find(h => h.includes('100') && !h.includes('1000')) || '',
      p300: headers.find(h => h.includes('300')) || '',
      p500: headers.find(h => h.includes('500')) || '',
      p1000: headers.find(h => h.includes('1000')) || '',
    });
  }, [headers]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => { if (event.target?.result) { setImage(event.target.result as string); setStatusMsg("Image pasted."); } };
          reader.readAsDataURL(blob);
        }
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => { if (event.target?.result) { setImage(event.target.result as string); setStatusMsg("Image loaded."); } };
      reader.readAsDataURL(file);
    }
  };

  const handleParse = async () => {
    if (!image) return;
    if (!mapping.port) { alert("Please configure the Port column mapping."); setShowConfig(true); return; }

    setIsLoading(true);
    setStatusMsg("Analyzing with AI...");
    setRawResponse("");
    setDebugInfo(null);

    try {
      // API Key is now handled in service via process.env
      const result: AIResponse = await parseRateSheetImage(image);
      setRawResponse(result.raw); 
      generatePreviews(result.parsed);
      setStep(2);
      setStatusMsg("Done.");
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
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
        const calculatePrice = (key: string, rule: PriceAdjustment): number | string => {
           const val = rawPrices[key];
           if (val !== undefined && val !== null && val !== "") {
             const num = Number(val);
             if (isNaN(num)) return "";
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
        const updates: Record<string, number | string> = {};
        if (mapping.p45 && calculatedPrices.P45 !== "") updates[mapping.p45] = calculatedPrices.P45;
        if (mapping.p100 && calculatedPrices.P100 !== "") updates[mapping.p100] = calculatedPrices.P100;
        if (mapping.p300 && calculatedPrices.P300 !== "") updates[mapping.p300] = calculatedPrices.P300;
        if (mapping.p500 && calculatedPrices.P500 !== "") updates[mapping.p500] = calculatedPrices.P500;
        if (mapping.p1000 && calculatedPrices.P1000 !== "") updates[mapping.p1000] = calculatedPrices.P1000;

        if (Object.keys(updates).length > 0) {
          newPreviews.push({
            rowId: row._internal_id || index, 
            rowIndex: index + 1,
            port: portKey,
            updates: updates,
            isMatch: true,
            oldP45: row[mapping.p45] as string | number,
            newP45: updates[mapping.p45] as string | number
          });
        }
      }
    });
    
    setPreviews(newPreviews);
    setStats({ foundInImage: totalPortsFound, matchesInSheet: matchedPortsCount });
    setDebugInfo({ aiSample: aiSampleKeys, sheetSample: sheetSampleValues });

    if (newPreviews.length === 0) {
       setStatusMsg(`Analysis complete. Found ${totalPortsFound} ports in image, but matched 0 with your sheet.`);
    }
  };

  const handleApply = () => {
    onApplyUpdates(previews);
    setStep(1);
    setPreviews([]);
    setImage(null);
    setStatusMsg("Updates applied!");
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-auto" onPaste={handlePaste}>
      <div className="p-4 border-b border-gray-200 bg-white shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Updater AI</h2>
        <p className="text-xs text-gray-500">Paste an image or import to update rates.</p>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4">
        {step === 1 && (
          <>
             <div 
               className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:border-blue-500 transition-colors bg-white cursor-pointer min-h-[150px]"
               onClick={() => fileInputRef.current?.click()}
             >
               <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
               {image ? (
                 <img src={image} alt="Preview" className="max-h-40 object-contain mb-2" />
               ) : (
                 <div className="text-4xl mb-2">📷</div>
               )}
               <p className="text-sm text-gray-600 font-medium">Click to upload or Paste image</p>
               <p className="text-xs text-gray-400 mt-1">Supports PNG, JPG</p>
             </div>

             <button onClick={() => setShowConfig(!showConfig)} className="text-xs text-blue-600 hover:underline self-start">
               {showConfig ? 'Hide Configuration' : 'Show Configuration'}
             </button>

             {showConfig && (
               <div className="bg-white p-3 rounded border border-gray-200 text-xs">
                 <p className="font-bold mb-2">Column Mapping</p>
                 <div className="grid grid-cols-2 gap-2">
                   <div>
                     <label className="block text-gray-500">Port Col</label>
                     <select className="w-full border p-1 rounded" value={mapping.port} onChange={e => setMapping({...mapping, port: e.target.value})}>
                       <option value="">Select...</option>
                       {headers.map(h => <option key={h} value={h}>{h}</option>)}
                     </select>
                   </div>
                   {['p45', 'p100', 'p300', 'p500', 'p1000'].map(k => (
                     <div key={k}>
                       <label className="block text-gray-500 uppercase">{k}</label>
                       <select 
                        className="w-full border p-1 rounded" 
                        value={mapping[k as keyof ColumnMapping]} 
                        onChange={e => setMapping({...mapping, [k]: e.target.value})}
                       >
                         <option value="">(Skip)</option>
                         {headers.map(h => <option key={h} value={h}>{h}</option>)}
                       </select>
                     </div>
                   ))}
                 </div>
               </div>
             )}
             
             {statusMsg && <p className="text-xs text-center text-blue-600">{statusMsg}</p>}
             
             <button 
               onClick={handleParse} 
               disabled={!image || isLoading}
               className={`w-full py-2 rounded text-white font-medium shadow-sm ${!image || isLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
             >
               {isLoading ? 'Processing...' : 'Analyze Image'}
             </button>
          </>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-2 h-full">
            <div className="bg-white p-3 rounded border border-gray-200">
              <div className="flex justify-between items-center mb-2">
                 <span className="text-xs font-bold text-gray-700">Preview Updates</span>
                 <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">{previews.length} matches</span>
              </div>
              <div className="text-xs text-gray-500 mb-2">
                Found {stats.foundInImage} ports in image. Matched {stats.matchesInSheet} in sheet.
              </div>
              
              <div className="max-h-[200px] overflow-auto border border-gray-100 rounded">
                 <table className="w-full text-xs text-left">
                   <thead className="bg-gray-50 sticky top-0">
                     <tr>
                       <th className="p-1">Port</th>
                       <th className="p-1">Change</th>
                     </tr>
                   </thead>
                   <tbody>
                     {previews.map((p, i) => (
                       <tr key={i} className="border-b border-gray-50">
                         <td className="p-1 font-mono">{p.port}</td>
                         <td className="p-1 text-gray-600">
                           {Object.keys(p.updates).length} cols updated
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
              </div>
            </div>

            <div className="flex gap-2 mt-auto">
               <button onClick={() => setStep(1)} className="flex-1 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 text-xs font-bold">
                 Cancel
               </button>
               <button onClick={handleApply} className="flex-1 py-2 bg-green-600 rounded text-white hover:bg-green-700 text-xs font-bold shadow-sm">
                 Apply Updates
               </button>
            </div>
            
            {debugInfo && (
               <div className="mt-2 p-2 bg-gray-100 rounded text-[10px] text-gray-500 font-mono break-all">
                 <p>AI Sample: {debugInfo.aiSample.join(', ')}</p>
                 <p>DB Sample: {debugInfo.sheetSample.join(', ')}</p>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};