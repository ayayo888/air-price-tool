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
      alert("表格为空");
      return;
    }
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
    writeFile(wb, `douyin_data.${format === 'csv' ? 'csv' : 'xlsx'}`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();

    const processData = (arrayBuffer: ArrayBuffer | string, isBinary: boolean) => {
      try {
        const workbook = read(arrayBuffer, { type: isBinary ? 'array' : 'string', cellDates: true, cellNF: true, cellText: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "", raw: false });
        processRawGrid(jsonData);
      } catch (error) {
        alert("文件解析失败");
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
    if (!rows || rows.length === 0) return;
    const rawHeaders = rows[0].map(h => String(h || "").trim());
    const filteredRawHeaders = rawHeaders.filter(h => h !== '状态');
    const parsedRows: CleanerRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const rowArr = rows[i];
      if (!rowArr || rowArr.every(c => c === "" || c === null || c === undefined)) continue;
      const rowObj: CleanerRow = { 
        _internal_id: Date.now() + i + Math.random(),
        checkStatus: 'unverified',
        用户名: '', 抖音号: '', 粉丝数: '', 简介: '', 联系方式: '' 
      }; 
      rawHeaders.forEach((header, colIndex) => { 
        if (header !== '状态') rowObj[header] = rowArr[colIndex]; 
      });
      parsedRows.push(rowObj);
    }
    onImportData(parsedRows, filteredRawHeaders);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar - Win10 Ribbon-ish look */}
      <div className="px-2 py-1 bg-[#F3F3F3] border-b border-[#E5E5E5] flex justify-between items-center h-[36px]">
        <div className="flex items-center gap-2">
           <span className="text-xs text-[#333333]">记录数: {data.length}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 text-xs text-[#333333] hover:bg-[#D9D9D9] transition-colors border border-transparent hover:border-[#CCCCCC] rounded-none"
          >
            导入
          </button>
          
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="px-3 py-1 text-xs text-[#333333] hover:bg-[#D9D9D9] transition-colors border border-transparent hover:border-[#CCCCCC] rounded-none"
            >
              导出
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-0 w-32 bg-white border border-[#CCCCCC] shadow-md z-50 py-1 text-xs">
                <button onClick={() => handleExport('xlsx')} className="block w-full text-left px-3 py-2 hover:bg-[#F0F0F0] text-[#333333]">Excel (.xlsx)</button>
                <button onClick={() => handleExport('csv')} className="block w-full text-left px-3 py-2 hover:bg-[#F0F0F0] text-[#333333]">CSV (.csv)</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-auto flex-1 bg-white relative scrollbar-win10">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-white sticky top-0 z-10">
            <tr>
              <th className="w-8 border-b border-r border-[#D9D9D9] bg-[#F5F5F5] text-center"></th>
              {headers.map((h, i) => (
                 <th key={i} className="px-3 py-1 border-b border-r border-[#D9D9D9] font-normal text-xs text-[#333333] whitespace-nowrap min-w-[100px] h-[30px] hover:bg-[#EBEBEB]">
                   {h}
                 </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rIdx) => (
              <tr key={row._internal_id || rIdx} className="hover:bg-[#E5F3FF] group border-b border-[#F0F0F0]">
                <td className="w-8 border-r border-[#F0F0F0] bg-[#F9F9F9] text-center text-[10px] text-[#999999] select-none">
                  {rIdx + 1}
                </td>
                {headers.map((header, cIdx) => {
                    if (header === '状态') {
                      const isVerified = row.checkStatus === 'verified';
                      return (
                        <td key={cIdx} className="px-2 border-r border-[#F0F0F0] text-xs">
                          <span className={isVerified ? 'text-green-600' : 'text-gray-400'}>
                            {isVerified ? '●' : '○'}
                          </span>
                        </td>
                      );
                    }
                    const val = row[header] ?? "";
                    return (
                      <td key={cIdx} className="border-r border-[#F0F0F0] p-0 min-w-[140px]">
                        <input 
                          value={val}
                          onChange={(e) => onCellEdit(row._internal_id!, header, e.target.value)}
                          className="w-full h-full px-2 py-1.5 bg-transparent border-none focus:ring-1 focus:ring-inset focus:ring-[#0078D7] text-xs text-[#333333]"
                        />
                      </td>
                    );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
