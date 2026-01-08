
import React, { useRef, useState, useEffect } from 'react';
import { read, utils, writeFile } from 'xlsx';
import { CleanerRow } from '../types';

interface DataGridProps {
  data: CleanerRow[];
  headers: string[];
  onImportData: (data: CleanerRow[], headers: string[]) => void;
  onCellEdit: (rowId: number | string, column: string, value: any) => void;
}

export const DataGrid: React.FC<DataGridProps> = ({ data, headers, onImportData, onCellEdit }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExport = (format: 'xlsx' | 'csv') => {
    setIsExportMenuOpen(false);
    if (data.length === 0) {
      alert("表格为空，无法导出。");
      return;
    }
    // Filter out internal fields like _internal_id and checkStatus for cleaner export
    // unless user wants status. Let's keep status but rename headers if needed.
    const exportData = data.map(row => {
      const rowData: Record<string, any> = {};
      headers.forEach(h => { 
        if (h === '状态') {
           rowData[h] = row.checkStatus === 'verified' ? '已验证' : '待检查';
        } else {
           rowData[h] = row[h]; 
        }
      });
      return rowData;
    });
    const ws = utils.json_to_sheet(exportData, { header: headers });
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "CleanedData");
    const dateStr = new Date().toISOString().split('T')[0];
    const extension = format === 'csv' ? 'csv' : 'xlsx';
    const fileName = `douyin_data_${dateStr}.${extension}`;
    writeFile(wb, fileName, { bookType: format === 'csv' ? 'csv' : 'xlsx' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();

    const processData = (arrayBuffer: ArrayBuffer | string, isBinary: boolean) => {
      try {
        const workbook = read(arrayBuffer, { type: isBinary ? 'array' : 'string', cellDates: true, cellNF: true, cellText: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "", raw: false });
        processRawGrid(jsonData);
      } catch (error) {
        console.error("Parse Error:", error);
        alert("文件解析失败，请检查格式。");
      }
    };

    if (fileExt === 'csv') {
      reader.onload = (e) => processData(e.target?.result as string, false);
      reader.readAsText(file);
    } else {
      reader.onload = (e) => processData(e.target?.result as ArrayBuffer, true);
      reader.readAsArrayBuffer(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processRawGrid = (rows: any[][]) => {
    if (!rows || rows.length === 0) { alert("文件为空。"); return; }
    
    // Simple heuristic: If imports don't match our headers, we just try to map them or show as is.
    // For this specific tool, we treat the first row as headers.
    const rawHeaders = rows[0].map(h => String(h || "").trim());
    
    // Remove "状态" if it exists in raw import to avoid conflict, we manage it internally
    const filteredRawHeaders = rawHeaders.filter(h => h !== '状态');

    const parsedRows: CleanerRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const rowArr = rows[i];
      if (!rowArr || rowArr.every(c => c === "" || c === null || c === undefined)) continue;
      
      const rowObj: CleanerRow = { 
        _internal_id: Date.now() + i + Math.random(),
        checkStatus: 'unverified', // Imported data needs verification
        用户名: '', 抖音号: '', 粉丝数: '', 简介: '', 联系方式: '' 
      }; 
      
      rawHeaders.forEach((header, colIndex) => { 
        if (header !== '状态') {
          rowObj[header] = rowArr[colIndex]; 
        }
      });
      parsedRows.push(rowObj);
    }
    onImportData(parsedRows, filteredRawHeaders);
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2">
           <span className="text-xs font-semibold text-gray-600">全部数据</span>
           <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded-full">{data.length}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <span>📂</span> 导入表格
          </button>
          
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-green-600 rounded hover:bg-green-700 transition-colors shadow-sm"
            >
              <span>💾</span> 导出数据
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-xl z-50 py-1 text-xs">
                <button onClick={() => handleExport('xlsx')} className="block w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700">Excel (.xlsx)</button>
                <button onClick={() => handleExport('csv')} className="block w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700">CSV (.csv)</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-auto flex-1 bg-white relative">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="w-10 px-2 py-2.5 border-b border-r border-gray-200 bg-gray-50 text-center font-medium text-xs">#</th>
              {headers.map((h, i) => (
                 <th key={i} className="px-3 py-2.5 border-b border-r border-gray-200 font-semibold text-xs whitespace-nowrap min-w-[80px]">
                   {h}
                 </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={headers.length + 1} className="text-center py-20 text-gray-400">
                  <div className="flex flex-col items-center gap-3 opacity-50">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    <p className="text-sm">暂无数据</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rIdx) => (
                <tr key={row._internal_id || rIdx} className="hover:bg-blue-50/50 group border-b border-gray-100 transition-colors">
                  <td className="px-2 py-2 border-r border-gray-100 bg-gray-50/50 text-center text-xs text-gray-400 select-none">
                    {rIdx + 1}
                  </td>
                  {headers.map((header, cIdx) => {
                     // Render Status Column
                     if (header === '状态') {
                       const isVerified = row.checkStatus === 'verified';
                       return (
                         <td key={cIdx} className="px-3 border-r border-gray-100 bg-white">
                           <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${isVerified ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                             <span className={`w-1.5 h-1.5 rounded-full ${isVerified ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                             {isVerified ? '已验证' : '待检查'}
                           </span>
                         </td>
                       );
                     }

                     const val = row[header] ?? "";
                     return (
                        <td key={cIdx} className="border-r border-gray-100 p-0 relative min-w-[140px]">
                          <textarea 
                            value={val}
                            onChange={(e) => onCellEdit(row._internal_id!, header, e.target.value)}
                            className="w-full h-full min-h-[40px] px-3 py-2.5 bg-transparent text-gray-700 border-none focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:ring-inset text-xs resize-none overflow-hidden whitespace-pre-wrap leading-relaxed"
                            rows={1}
                          />
                        </td>
                     );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
