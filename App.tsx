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
    if(confirm("确定要清空所有数据吗？\n此操作将清除所有已提取的表格数据。\n(API Key配置不会被清除)")) {
      setProject({ rows: [] });
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F3F3F3] overflow-hidden font-segoe">
      {/* Windows 10 Title Bar Style Header */}
      <header className="h-[32px] bg-white border-b border-[#E5E5E5] flex items-center justify-between px-3 select-none app-region-drag">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#0078D7] flex items-center justify-center text-white text-[10px] font-bold">
            D
          </div>
          <span className="text-xs text-[#333333]">抖音数据清洗工具 Pro</span>
        </div>
        <div className="flex items-center gap-4 app-region-no-drag">
          <span className="text-[10px] text-[#999999]">Auto-saved to LocalStorage</span>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Controls - Windows 10 Side Panel Style */}
        <aside className="w-[360px] bg-[#F2F2F2] border-r border-[#D9D9D9] flex flex-col z-10">
          <CleaningPanel 
            currentRows={project.rows}
            onAddRows={handleAddRows}
            onRemoveRows={handleRemoveRows}
            onUpdateStatus={handleUpdateStatus}
            onClearAll={resetDatabase}
          />
        </aside>

        {/* Right Panel: Data Grid - Windows 10 Content Area */}
        <section className="flex-1 flex flex-col min-w-0 bg-white">
          <div className="flex-1 overflow-hidden flex flex-col">
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