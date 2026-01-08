import { useState, useEffect } from 'react';
import { DataGrid } from './components/DataGrid';
import { CleaningPanel } from './components/CleaningPanel';
import { CleanerRow } from './types';

// Standard Headers for Data Cleaning
const HEADERS = ['用户名', '抖音号', '粉丝数', '简介', '联系方式'];

const INITIAL_ROWS: CleanerRow[] = [
  { _internal_id: 1, 用户名: '示例-国际物流', 抖音号: 'example_logistics', 粉丝数: '1.2w', 简介: '专注欧美FBA头程，双清包税', 联系方式: '13800000000' }
];

interface ProjectState {
  rows: CleanerRow[];
}

export default function App() {
  const [project, setProject] = useState<ProjectState>(() => {
    const savedRows = localStorage.getItem('cleaner_db');
    return {
      rows: savedRows ? JSON.parse(savedRows) : INITIAL_ROWS
    };
  });

  // Save to local storage
  useEffect(() => {
    localStorage.setItem('cleaner_db', JSON.stringify(project.rows));
  }, [project]);

  // Handle adding new rows (from Initial Cleaning)
  const handleAddRows = (newRows: CleanerRow[]) => {
    setProject(prev => ({
      rows: [...prev.rows, ...newRows]
    }));
  };

  // Handle removing rows (from Relevance Cleaning)
  const handleRemoveRows = (idsToRemove: (string | number)[]) => {
    const idSet = new Set(idsToRemove);
    setProject(prev => ({
      rows: prev.rows.filter(row => !idSet.has(row._internal_id!))
    }));
  };

  const handleCellEdit = (rowId: number | string, column: string, value: any) => {
    setProject(prev => {
      const newRows = prev.rows.map(row => {
        if (row._internal_id === rowId) {
          return { ...row, [column]: value };
        }
        return row;
      });
      return { ...prev, rows: newRows };
    });
  };

  const handleImportData = (newRows: CleanerRow[], newHeaders: string[]) => {
    // For this specific tool, we might want to map imported data to our specific columns
    // But for simplicity, we just take them if they match, or append.
    // The DataGrid logic handles raw imports well.
    if (newRows.length > 0) {
      setProject(prev => ({ rows: [...prev.rows, ...newRows] }));
    }
  };

  const resetDatabase = () => {
    if(confirm("确定要清空所有数据吗？此操作不可恢复。")) {
      setProject({ rows: [] });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 text-slate-800 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 justify-between flex-shrink-0 shadow-sm z-10">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">🧬</span>
          <h1 className="text-lg font-bold tracking-tight text-gray-800">数据清洗工具 - 国际物流版</h1>
          <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 ml-2">v3.0 Gemini</span>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={resetDatabase}
            className="text-xs text-gray-400 hover:text-red-500 underline"
          >
            清空表格
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden p-4 gap-4">
        
        {/* Left Panel: Control Panel */}
        <section className="w-[380px] flex flex-col flex-shrink-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
             <CleaningPanel 
               currentRows={project.rows}
               onAddRows={handleAddRows}
               onRemoveRows={handleRemoveRows}
             />
          </div>
        </section>

        {/* Right Panel: Data Grid */}
        <section className="flex-1 flex flex-col min-w-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
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