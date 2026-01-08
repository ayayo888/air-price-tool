import React, { useState, useEffect } from 'react';
import { CleanerRow, ParsedProfile } from '../types';
import { extractProfilesFromText, filterIrrelevantProfiles } from '../services/openRouterService';

interface CleaningPanelProps {
  currentRows: CleanerRow[];
  onAddRows: (newRows: CleanerRow[]) => void;
  onRemoveRows: (ids: (string | number)[]) => void;
}

export const CleaningPanel: React.FC<CleaningPanelProps> = ({ currentRows, onAddRows, onRemoveRows }) => {
  const [activeTab, setActiveTab] = useState<'initial' | 'relevance'>('initial');
  const [apiKey, setApiKey] = useState('');
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');

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

    setIsLoading(true);
    setStatus("正在分析数据相关性...");

    try {
      // Prepare data for AI: minimal payload to save tokens
      const payload = currentRows.map(r => ({
        id: r._internal_id!,
        text: `用户名:${r.用户名}, 简介:${r.简介}`
      }));

      // Call service
      const idsToRemove = await filterIrrelevantProfiles(payload, apiKey);

      if (Array.isArray(idsToRemove) && idsToRemove.length > 0) {
        onRemoveRows(idsToRemove);
        setStatus(`清洗完成！移除了 ${idsToRemove.length} 条无关数据。`);
      } else {
        setStatus("清洗完成！所有数据均判定为相关，未移除任何行。");
      }

    } catch (e: any) {
      setStatus(`错误: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Settings Area */}
      <div className="p-4 bg-white border-b border-gray-200">
        <label className="block text-xs font-bold text-gray-700 mb-1">OpenRouter API Key</label>
        <input 
          type="password" 
          value={apiKey}
          onChange={(e) => handleSaveKey(e.target.value)}
          placeholder="sk-or-..."
          className="w-full text-xs p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        <button 
          onClick={() => setActiveTab('initial')}
          className={`flex-1 py-3 text-xs font-bold text-center ${activeTab === 'initial' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          第一步：初步清洗
        </button>
        <button 
          onClick={() => setActiveTab('relevance')}
          className={`flex-1 py-3 text-xs font-bold text-center ${activeTab === 'relevance' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          第二步：相关性清洗
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 flex flex-col overflow-auto">
        
        {activeTab === 'initial' && (
          <div className="flex flex-col h-full gap-3">
            <div className="flex-1 flex flex-col">
              <label className="text-xs text-gray-500 mb-1">输入原始内容 (支持长文本):</label>
              <textarea 
                className="flex-1 w-full p-3 text-xs border border-gray-300 rounded resize-none focus:ring-2 focus:ring-blue-500 outline-none font-mono leading-relaxed"
                placeholder="在此粘贴包含大量抖音账号信息的文本...&#10;AI将自动提取：用户名、抖音号、粉丝数、简介、联系方式"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </div>
            <div className="text-xs text-gray-400">
              * 新数据将追加到表格底部，并根据抖音号自动去重。
            </div>
            <button 
              onClick={handleInitialCleaning}
              disabled={isLoading}
              className={`w-full py-3 rounded text-white font-bold shadow-sm transition-colors ${isLoading ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isLoading ? '正在清洗录入...' : '开始初步清洗并录入'}
            </button>
          </div>
        )}

        {activeTab === 'relevance' && (
          <div className="flex flex-col h-full justify-between">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <h3 className="text-sm font-bold text-blue-800 mb-2">清洗逻辑说明</h3>
              <p className="text-xs text-blue-700 mb-2 leading-relaxed">
                系统将分析右侧表格中现有账号的 <strong>用户名</strong> 和 <strong>简介</strong>。
              </p>
              <ul className="list-disc list-inside text-xs text-blue-700 space-y-1">
                <li><strong>保留：</strong>空运、海运、快递、双清包税、跨境电商、外贸等相关内容。</li>
                <li><strong>剔除：</strong>博览会推广、纯甄选店、完全无关的个人生活或娱乐内容。</li>
              </ul>
            </div>

            <div className="text-center py-8">
               <div className="text-3xl mb-2">🧹</div>
               <p className="text-sm text-gray-600">当前表格共有 <strong>{currentRows.length}</strong> 条数据</p>
            </div>

            <button 
              onClick={handleRelevanceCleaning}
              disabled={isLoading || currentRows.length === 0}
              className={`w-full py-3 rounded text-white font-bold shadow-sm transition-colors ${isLoading || currentRows.length === 0 ? 'bg-purple-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
            >
              {isLoading ? '正在分析过滤...' : '开始相关性清洗'}
            </button>
          </div>
        )}

        {status && (
          <div className={`mt-3 p-2 rounded text-xs text-center border ${status.includes('错误') ? 'bg-red-50 border-red-100 text-red-600' : 'bg-green-50 border-green-100 text-green-700'}`}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
};
