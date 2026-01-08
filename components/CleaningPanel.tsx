import React, { useState, useEffect } from 'react';
import { CleanerRow, ParsedProfile } from '../types';
import { extractProfilesFromText, filterIrrelevantProfiles, ApiError } from '../services/openRouterService';

interface CleaningPanelProps {
  currentRows: CleanerRow[];
  onAddRows: (newRows: CleanerRow[]) => void;
  onRemoveRows: (ids: (string | number)[]) => void;
  onUpdateStatus: (ids: (string | number)[], status: 'verified' | 'unverified') => void;
}

export const CleaningPanel: React.FC<CleaningPanelProps> = ({ currentRows, onAddRows, onRemoveRows, onUpdateStatus }) => {
  const [activeTab, setActiveTab] = useState<'initial' | 'relevance'>('initial');
  const [apiKey, setApiKey] = useState('');
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [debugLog, setDebugLog] = useState<string | null>(null);

  // Stats for the relevance tab
  const unverifiedCount = currentRows.filter(r => r.checkStatus !== 'verified').length;
  const verifiedCount = currentRows.length - unverifiedCount;

  useEffect(() => {
    const storedKey = localStorage.getItem('openrouter_api_key');
    if (storedKey) setApiKey(storedKey);
  }, []);

  const handleSaveKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem('openrouter_api_key', val);
  };

  const handleInitialCleaning = async () => {
    if (!inputText.trim()) { alert("请输入需要清洗的内容"); return; }
    if (!apiKey) { alert("请先输入 OpenRouter API Key"); return; }

    setIsLoading(true);
    setStatus("正在处理...");
    setDebugLog(null);

    try {
      const parsedData = await extractProfilesFromText(inputText, apiKey);
      
      if (parsedData.length === 0) {
        setStatus("未提取到数据，请检查输入。");
        setIsLoading(false);
        return;
      }

      setStatus(`提取 ${parsedData.length} 条，正在录入...`);

      const newRows: CleanerRow[] = [];
      let duplicateCount = 0;
      const existingIds = new Set(currentRows.map(r => String(r.抖音号 || "").trim()));

      parsedData.forEach(p => {
        const dId = String(p.douyinId || "").trim();
        if (dId && existingIds.has(dId)) {
          duplicateCount++;
        } else {
          newRows.push({
            _internal_id: Date.now() + Math.random(),
            checkStatus: 'unverified',
            用户名: p.username,
            抖音号: p.douyinId,
            粉丝数: p.fans,
            简介: p.bio,
            联系方式: p.contact
          });
          if(dId) existingIds.add(dId);
        }
      });

      onAddRows(newRows);
      setStatus(`完成: 新增 ${newRows.length}，重复 ${duplicateCount}`);
      setInputText("");

    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message}`);
      if (e instanceof ApiError && e.rawResponse) {
         setDebugLog(e.rawResponse);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRelevanceCleaning = async () => {
    if (currentRows.length === 0) { alert("无数据"); return; }
    if (!apiKey) { alert("请输入 API Key"); return; }
    
    const rowsToCheck = currentRows.filter(r => r.checkStatus !== 'verified');
    
    if (rowsToCheck.length === 0) {
      setStatus("所有数据已验证");
      return;
    }

    setIsLoading(true);
    setStatus(`正在分析 ${rowsToCheck.length} 条数据...`);
    setDebugLog(null);

    try {
      const payload = rowsToCheck.map(r => ({
        id: r._internal_id!,
        text: `用户名:${r.用户名}, 简介:${r.简介}`
      }));

      const idsToRemove = await filterIrrelevantProfiles(payload, apiKey);

      if (Array.isArray(idsToRemove) && idsToRemove.length > 0) {
        onRemoveRows(idsToRemove);
      } 

      const idsToRemoveSet = new Set(idsToRemove || []);
      const survivorIds = rowsToCheck
        .filter(r => !idsToRemoveSet.has(r._internal_id!))
        .map(r => r._internal_id!);

      if (survivorIds.length > 0) {
        onUpdateStatus(survivorIds, 'verified');
      }

      const removedCount = idsToRemove ? idsToRemove.length : 0;
      setStatus(`完成: 移除 ${removedCount}，验证 ${survivorIds.length}`);

    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message}`);
      if (e instanceof ApiError && e.rawResponse) {
         setDebugLog(e.rawResponse);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F3F3F3]">
      {/* API Key Input - Win10 style input */}
      <div className="p-4 border-b border-[#E5E5E5] bg-white">
        <label className="block text-[11px] text-[#666666] mb-1">OpenRouter API Key</label>
        <input 
          type="password" 
          value={apiKey}
          onChange={(e) => handleSaveKey(e.target.value)}
          placeholder="sk-..."
          className="w-full text-xs p-1.5 bg-white border border-[#999999] hover:border-[#666666] focus:border-[#0078D7] focus:ring-1 focus:ring-[#0078D7] outline-none transition-colors rounded-none placeholder-gray-400"
        />
      </div>

      {/* Win10 Pivot Headers */}
      <div className="flex pl-4 pt-4 bg-[#F3F3F3] space-x-6">
        <button 
          onClick={() => setActiveTab('initial')}
          className={`pb-2 text-[15px] font-semibold transition-colors ${activeTab === 'initial' ? 'text-[#000000] border-b-2 border-[#0078D7]' : 'text-[#777777] hover:text-[#333333]'}`}
        >
          提取
        </button>
        <button 
          onClick={() => setActiveTab('relevance')}
          className={`pb-2 text-[15px] font-semibold transition-colors ${activeTab === 'relevance' ? 'text-[#000000] border-b-2 border-[#0078D7]' : 'text-[#777777] hover:text-[#333333]'}`}
        >
          清洗
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 flex flex-col overflow-auto">
        
        {activeTab === 'initial' && (
          <div className="flex flex-col h-full gap-3">
            <textarea 
              className="flex-1 w-full p-2 text-xs bg-white border border-[#999999] hover:border-[#666666] focus:border-[#0078D7] outline-none font-mono resize-none rounded-none text-[#333333]"
              placeholder="粘贴文本..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            
            <button 
              onClick={handleInitialCleaning}
              disabled={isLoading}
              className={`w-full py-1.5 text-white text-sm bg-[#0078D7] hover:bg-[#006CC1] active:bg-[#005A9E] disabled:bg-[#CCCCCC] disabled:text-[#666666] transition-colors border-none rounded-none shadow-none`}
            >
              {isLoading ? '处理中...' : '开始提取'}
            </button>
          </div>
        )}

        {activeTab === 'relevance' && (
          <div className="flex flex-col h-full gap-4">
            <div className="bg-white p-3 border border-[#D9D9D9]">
              <h3 className="text-xs font-bold text-[#333333] mb-2">状态概览</h3>
              <div className="space-y-1">
                 <div className="flex justify-between text-xs">
                   <span className="text-[#666666]">待检查</span>
                   <span className="font-semibold text-[#000000]">{unverifiedCount}</span>
                 </div>
                 <div className="flex justify-between text-xs">
                   <span className="text-[#666666]">已验证</span>
                   <span className="font-semibold text-[#000000]">{verifiedCount}</span>
                 </div>
              </div>
            </div>

            <button 
              onClick={handleRelevanceCleaning}
              disabled={isLoading || unverifiedCount === 0}
              className={`mt-auto w-full py-1.5 text-white text-sm bg-[#0078D7] hover:bg-[#006CC1] active:bg-[#005A9E] disabled:bg-[#CCCCCC] disabled:text-[#666666] transition-colors border-none rounded-none`}
            >
              {isLoading ? '处理中...' : '开始清洗'}
            </button>
          </div>
        )}

        {/* Log Area */}
        <div className="mt-3 flex flex-col gap-2">
          {status && (
            <div className={`text-xs p-2 border-l-2 ${status.includes('Error') ? 'border-red-500 bg-red-50 text-red-700' : 'border-[#0078D7] bg-white text-[#333333]'}`}>
              {status}
            </div>
          )}
          
          {debugLog && (
            <div className="border border-red-200 bg-white">
              <div className="bg-red-50 px-2 py-1 text-[10px] text-red-600 border-b border-red-100 flex justify-between items-center">
                <span>API Raw Response (Error)</span>
                <button onClick={() => navigator.clipboard.writeText(debugLog)} className="hover:underline">Copy</button>
              </div>
              <div className="p-2 text-[10px] font-mono overflow-auto max-h-32 text-[#333333]">
                {debugLog}
              </div>
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
};
