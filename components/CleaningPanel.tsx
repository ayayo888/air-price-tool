import React, { useState, useEffect } from 'react';
import { CleanerRow, ParsedProfile } from '../types';
import { extractProfilesFromText, filterIrrelevantProfiles } from '../services/openRouterService';

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
    setStatus("正在调用 AI 进行提取...");

    try {
      const parsedData = await extractProfilesFromText(inputText, apiKey);
      
      if (parsedData.length === 0) {
        setStatus("AI 未能提取到任何数据，请检查输入内容。");
        setIsLoading(false);
        return;
      }

      setStatus(`提取成功 ${parsedData.length} 条，正在进行去重录入...`);

      const newRows: CleanerRow[] = [];
      let duplicateCount = 0;

      // Existing Douyin IDs Set for O(1) lookup
      const existingIds = new Set(currentRows.map(r => String(r.抖音号 || "").trim()));

      parsedData.forEach(p => {
        const dId = String(p.douyinId || "").trim();
        // 重复标准：抖音号相同
        if (dId && existingIds.has(dId)) {
          duplicateCount++;
        } else {
          newRows.push({
            _internal_id: Date.now() + Math.random(),
            checkStatus: 'unverified', // Default new rows to unverified
            用户名: p.username,
            抖音号: p.douyinId,
            粉丝数: p.fans,
            简介: p.bio,
            联系方式: p.contact
          });
          // Add to set to prevent duplicates within the new batch itself
          if(dId) existingIds.add(dId);
        }
      });

      onAddRows(newRows);
      setStatus(`完成！新增 ${newRows.length} 条，跳过重复 ${duplicateCount} 条。`);
      setInputText(""); // Clear input on success

    } catch (e: any) {
      setStatus(`错误: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRelevanceCleaning = async () => {
    if (currentRows.length === 0) { alert("表格为空，无需清洗"); return; }
    if (!apiKey) { alert("请先输入 OpenRouter API Key"); return; }
    
    // 1. Filter only unverified rows
    const rowsToCheck = currentRows.filter(r => r.checkStatus !== 'verified');
    
    if (rowsToCheck.length === 0) {
      setStatus("所有数据均已通过验证，无需重复清洗。");
      return;
    }

    setIsLoading(true);
    setStatus(`正在分析 ${rowsToCheck.length} 条新数据 (已跳过 ${verifiedCount} 条已验证数据)...`);

    try {
      // Prepare data for AI: minimal payload to save tokens
      const payload = rowsToCheck.map(r => ({
        id: r._internal_id!,
        text: `用户名:${r.用户名}, 简介:${r.简介}`
      }));

      // Call service
      const idsToRemove = await filterIrrelevantProfiles(payload, apiKey);

      // 2. Process results
      if (Array.isArray(idsToRemove) && idsToRemove.length > 0) {
        onRemoveRows(idsToRemove);
      } 

      // 3. Mark survivors as verified
      // Survivors are rows that were sent to AI (in rowsToCheck) BUT NOT in idsToRemove
      const idsToRemoveSet = new Set(idsToRemove || []);
      const survivorIds = rowsToCheck
        .filter(r => !idsToRemoveSet.has(r._internal_id!))
        .map(r => r._internal_id!);

      if (survivorIds.length > 0) {
        onUpdateStatus(survivorIds, 'verified');
      }

      const removedCount = idsToRemove ? idsToRemove.length : 0;
      setStatus(`清洗完成！本次检查 ${rowsToCheck.length} 条，移除了 ${removedCount} 条无关数据，验证通过 ${survivorIds.length} 条。`);

    } catch (e: any) {
      setStatus(`错误: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Settings Area */}
      <div className="p-5 border-b border-gray-100">
        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">OpenRouter API Key</label>
        <div className="relative">
          <input 
            type="password" 
            value={apiKey}
            onChange={(e) => handleSaveKey(e.target.value)}
            placeholder="sk-or-..."
            className="w-full text-xs p-2.5 pl-8 bg-gray-50 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
          <span className="absolute left-2.5 top-2.5 text-gray-400">🔑</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button 
          onClick={() => setActiveTab('initial')}
          className={`flex-1 py-3 text-xs font-bold text-center transition-colors relative ${activeTab === 'initial' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          第一步：提取录入
          {activeTab === 'initial' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('relevance')}
          className={`flex-1 py-3 text-xs font-bold text-center transition-colors relative ${activeTab === 'relevance' ? 'text-purple-600 bg-purple-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          第二步：清洗验证
          {activeTab === 'relevance' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-600"></div>}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-5 flex flex-col overflow-auto">
        
        {activeTab === 'initial' && (
          <div className="flex flex-col h-full gap-4">
            <div className="flex-1 flex flex-col">
              <label className="text-xs font-medium text-gray-700 mb-2">粘贴文本内容</label>
              <textarea 
                className="flex-1 w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono leading-relaxed text-gray-600 placeholder-gray-400"
                placeholder="在此粘贴包含大量抖音账号信息的非结构化文本...&#10;&#10;AI将自动提取：&#10;- 用户名&#10;- 抖音号&#10;- 粉丝数&#10;- 简介&#10;- 联系方式"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </div>
            
            <button 
              onClick={handleInitialCleaning}
              disabled={isLoading}
              className={`w-full py-3 rounded-lg text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2
                ${isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md active:transform active:scale-[0.98]'}`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>处理中...</span>
                </>
              ) : (
                <>
                  <span>🚀</span> 开始提取
                </>
              )}
            </button>
          </div>
        )}

        {activeTab === 'relevance' && (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-lg">💡</span>
                <div>
                  <h3 className="text-sm font-bold text-purple-900">增量清洗模式</h3>
                  <p className="text-xs text-purple-700 mt-1 leading-relaxed">
                    系统只会发送 <span className="font-bold bg-white px-1 rounded border border-purple-200">未验证</span> 的数据给 AI。已通过验证的数据将被跳过，从而节省 Token 费用。
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-xs bg-white/60 p-2 rounded">
                 <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                 <span className="text-gray-600">待检查: <strong>{unverifiedCount}</strong> 条</span>
                 <span className="text-gray-300 mx-1">|</span>
                 <div className="w-2 h-2 rounded-full bg-green-500"></div>
                 <span className="text-green-600">已验证: <strong>{verifiedCount}</strong> 条</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-2 opacity-60">
               <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
               </svg>
               <span className="text-xs">点击下方按钮开始分析</span>
            </div>

            <button 
              onClick={handleRelevanceCleaning}
              disabled={isLoading || unverifiedCount === 0}
              className={`w-full py-3 rounded-lg text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2
                ${isLoading || unverifiedCount === 0 
                  ? 'bg-gray-300 cursor-not-allowed' 
                  : 'bg-purple-600 hover:bg-purple-700 hover:shadow-md active:transform active:scale-[0.98]'}`}
            >
              {isLoading ? '正在清洗...' : unverifiedCount === 0 ? '所有数据已验证' : `清洗 ${unverifiedCount} 条新数据`}
            </button>
          </div>
        )}

        {status && (
          <div className={`mt-auto p-3 rounded-lg text-xs leading-5 border shadow-sm animate-fade-in
            ${status.includes('错误') 
              ? 'bg-red-50 border-red-200 text-red-700' 
              : 'bg-white border-gray-200 text-gray-600'}`}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
};
