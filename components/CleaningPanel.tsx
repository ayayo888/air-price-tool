import React, { useState, useEffect } from 'react';
import { CleanerRow, ParsedProfile } from '../types';
import { extractProfilesFromText, filterIrrelevantProfiles, ApiError, SYSTEM_PROMPT_FILTER } from '../services/openRouterService';

interface CleaningPanelProps {
  currentRows: CleanerRow[];
  onAddRows: (newRows: CleanerRow[]) => void;
  onRemoveRows: (ids: (string | number)[]) => void;
  onUpdateStatus: (ids: (string | number)[], status: 'verified' | 'unverified') => void;
  onClearAll: () => void;
}

export const CleaningPanel: React.FC<CleaningPanelProps> = ({ currentRows, onAddRows, onRemoveRows, onUpdateStatus, onClearAll }) => {
  const [activeTab, setActiveTab] = useState<'initial' | 'relevance'>('initial');
  const [apiKey, setApiKey] = useState('');
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [debugLog, setDebugLog] = useState<string | null>(null);

  // New State for Editable Prompt
  const [filterPrompt, setFilterPrompt] = useState(SYSTEM_PROMPT_FILTER);

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

  const handleClearKey = () => {
    setApiKey('');
    localStorage.removeItem('openrouter_api_key');
  };

  const handleInitialCleaning = async () => {
    if (!inputText.trim()) { alert("请输入需要清洗的内容"); return; }
    if (!apiKey) { alert("请先输入 OpenRouter API Key"); return; }

    setIsLoading(true);
    setStatus("准备开始...");
    setDebugLog(null);

    try {
      const onProgress = (current: number, total: number) => {
        // Show the 500-line batch logic to the user
        setStatus(`正在自动分批处理 (500行/批): 第 ${current} / ${total} 批...`);
      };

      // Calling the service which now handles batching internally
      const parsedData = await extractProfilesFromText(inputText, apiKey, onProgress);
      
      if (parsedData.length === 0) {
        setStatus("未提取到数据，请检查输入或 Key 配额。");
        setIsLoading(false);
        return;
      }

      const newRows: CleanerRow[] = [];
      let duplicateCount = 0;
      const existingIds = new Set(currentRows.map(r => String(r.抖音号 || "").trim()));

      parsedData.forEach(p => {
        const dId = String(p.douyinId || "").trim();
        // Skip duplicate Douyin IDs if they already exist in the table
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
      setStatus(`处理完成: 共提取 ${parsedData.length} 条 (新增 ${newRows.length}，重复 ${duplicateCount})`);
      
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
    if (!filterPrompt.trim()) { alert("清洗规则不能为空"); return; }
    
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

      // Pass the editable prompt to the service
      const idsToRemove = await filterIrrelevantProfiles(payload, apiKey, filterPrompt);

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

  // Comprehensive Reset Function
  const handleFullReset = () => {
    const isConfirmed = confirm(
      "【确定要彻底清空吗？】\n\n" +
      "1. 清空所有已提取的表格数据\n" +
      "2. 清空左侧输入框文本\n" +
      "3. 重置所有操作状态\n\n" +
      "(您的 API Key 会被保留)"
    );

    if (isConfirmed) {
      // 1. Clear Local State
      setInputText('');
      setFilterPrompt(SYSTEM_PROMPT_FILTER); // Reset Prompt to Default
      setStatus('已重置所有数据');
      setDebugLog(null);
      setIsLoading(false);
      
      // 2. Clear App State (Table Data)
      onClearAll();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F3F3F3]">
      {/* API Key Input - Win10 style input */}
      <div className="p-4 border-b border-[#E5E5E5] bg-white">
        <label className="block text-[11px] text-[#666666] mb-1">OpenRouter API Key</label>
        <div className="flex gap-1">
          <input 
            type="password" 
            value={apiKey}
            onChange={(e) => handleSaveKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 text-xs p-1.5 bg-white border border-[#999999] hover:border-[#666666] focus:border-[#0078D7] focus:ring-1 focus:ring-[#0078D7] outline-none transition-colors rounded-none placeholder-gray-400"
          />
          <button 
            onClick={handleClearKey} 
            title="清除 Key"
            className="px-2 bg-[#F0F0F0] border border-[#CCCCCC] hover:bg-[#E0E0E0] text-[#666666]"
          >
            ✕
          </button>
        </div>
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
              placeholder="请粘贴要提取的原始文本... (程序会自动分批处理长文本)"
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

            <div className="flex-1 flex flex-col min-h-0">
               <div className="flex justify-between items-center mb-1">
                 <label className="text-[11px] text-[#666666]">AI 清洗规则 (可编辑)</label>
                 <button 
                   onClick={() => setFilterPrompt(SYSTEM_PROMPT_FILTER)}
                   className="text-[10px] text-[#0078D7] hover:underline cursor-pointer"
                   title="恢复默认的物流行业清洗规则"
                 >
                   恢复默认
                 </button>
               </div>
               <textarea 
                 className="flex-1 w-full p-2 text-xs bg-white border border-[#999999] hover:border-[#666666] focus:border-[#0078D7] outline-none font-mono resize-none rounded-none text-[#333333]"
                 value={filterPrompt}
                 onChange={(e) => setFilterPrompt(e.target.value)}
                 placeholder="在这里输入 Prompt 提示词，定义哪些账号是需要的，哪些是无关的..."
               />
            </div>

            <button 
              onClick={handleRelevanceCleaning}
              disabled={isLoading || unverifiedCount === 0}
              className={`w-full py-1.5 text-white text-sm bg-[#0078D7] hover:bg-[#006CC1] active:bg-[#005A9E] disabled:bg-[#CCCCCC] disabled:text-[#666666] transition-colors border-none rounded-none`}
            >
              {isLoading ? '处理中...' : '开始 AI 清洗'}
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

      {/* Footer Actions (Reset Cache) */}
      <div className="p-4 border-t border-[#E5E5E5] bg-[#F9F9F9]">
         <div className="text-[10px] text-[#666666] mb-2 text-center">
            清理缓存与数据
         </div>
         <button
            onClick={handleFullReset}
            className="w-full py-1.5 text-[#333333] text-xs border border-[#999999] hover:bg-[#E5E5E5] hover:border-[#666666] active:bg-[#CCCCCC] transition-colors bg-white font-semibold"
            title="此操作将清空表格数据和输入框内容"
          >
            清空所有数据 (Reset All)
          </button>
      </div>
    </div>
  );
};