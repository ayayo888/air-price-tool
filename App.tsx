import React, { useState, useEffect } from 'react';
import { DataGrid } from './components/DataGrid';
import { CleaningPanel } from './components/CleaningPanel';
import { CleanerRow } from './types';

// Standard Headers
const HEADERS = ['状态', '用户名', '抖音号', '粉丝数', '简介', '联系方式'];

const INITIAL_ROWS: CleanerRow[] = [
  { _internal_id: 1, checkStatus: 'unverified', 用户名: '示例-国际物流', 抖音号: 'example_logistics', 粉丝数: '1.2w', 简介: '专注欧美FBA头程，双清包税', 联系方式: '13800000000' }
];

interface ProjectState {
  rows: CleanerRow[];
}

export default function App() {
  // --- Data Logic State ---
  const [project, setProject] = useState<ProjectState>(() => {
    const savedRows = localStorage.getItem('cleaner_db');
    return {
      rows: savedRows ? JSON.parse(savedRows) : INITIAL_ROWS
    };
  });

  useEffect(() => {
    localStorage.setItem('cleaner_db', JSON.stringify(project.rows));
  }, [project]);

  const handleAddRows = (newRows: CleanerRow[]) => {
    // New rows are always unverified by default
    const rowsWithStatus = newRows.map(r => ({ ...r, checkStatus: 'unverified' as const }));
    setProject(prev => ({ rows: [...prev.rows, ...rowsWithStatus] }));
  };

  const handleRemoveRows = (idsToRemove: (string | number)[]) => {
    const idSet = new Set(idsToRemove);
    setProject(prev => ({
      rows: prev.rows.filter(row => !idSet.has(row._internal_id!))
    }));
  };

  // Batch update status (e.g., mark as verified after AI check)
  const handleUpdateStatus = (ids: (string | number)[], status: 'verified' | 'unverified') => {
    const idSet = new Set(ids);
    setProject(prev => ({
      rows: prev.rows.map(row => {
        if (idSet.has(row._internal_id!)) {
          return { ...row, checkStatus: status };
        }
        return row;
      })
    }));
  };

  const handleCellEdit = (rowId: number | string, column: string, value: any) => {
    setProject(prev => {
      const newRows = prev.rows.map(row => {
        if (row._internal_id === rowId) {
          const updatedRow = { ...row, [column]: value };
          // If critical fields change, reset status to unverified so it gets checked again next time
          if (column === '用户名' || column === '简介') {
            updatedRow.checkStatus = 'unverified';
          }
          return updatedRow;
        }
        return row;
      });
      return { ...prev, rows: newRows };
    });
  };

  const handleImportData = (newRows: CleanerRow[]) => {
    if (newRows.length > 0) {
      // Imported rows are unverified
      const rowsWithStatus = newRows.map(r => ({ ...r, checkStatus: 'unverified' as const }));
      setProject(prev => ({ rows: [...prev.rows, ...rowsWithStatus] }));
    }
  };

  const resetDatabase = () => {
    if(confirm("确定要清空所有数据吗？此操作不可恢复。")) {
      setProject({ rows: [] });
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
            D
          </div>
          <h1 className="text-lg font-bold text-gray-800 tracking-tight">抖音数据清洗工具 <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full ml-2">Pro v3.0</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">Powered by Gemini 3.0 Flash</span>
          <button onClick={resetDatabase} className="text-xs text-red-500 hover:text-red-700 hover:underline">
            清空所有数据
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Controls */}
        <aside className="w-[380px] bg-white border-r border-gray-200 flex flex-col z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <CleaningPanel 
            currentRows={project.rows}
            onAddRows={handleAddRows}
            onRemoveRows={handleRemoveRows}
            onUpdateStatus={handleUpdateStatus}
          />
        </aside>

        {/* Right Panel: Data Grid */}
        <section className="flex-1 flex flex-col min-w-0 bg-gray-50 p-4">
          <div className="flex-1 bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex flex-col">
            <DataGrid 
              data={project.rows}
              headers={HEADERS}
              onImportData={handleImportData}
              onCellEdit={handleCellEdit}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
