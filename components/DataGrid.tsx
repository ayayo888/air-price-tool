import React, { useRef, useState, useEffect } from 'react';
import { read, utils, writeFile } from 'xlsx';
import { SheetRow } from '../types';

interface DataGridProps {
  data: SheetRow[];
  headers: string[];
  onImportData: (data: SheetRow[], headers: string[]) => void;
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
    if (data.length === 0 || headers.length === 0) {
      alert("No data to export.");
      return;
    }
    const exportData = data.map(row => {
      const rowData: Record<string, any> = {};
      headers.forEach(h => { rowData[h] = row[h]; });
      return rowData;
    });
    const ws = utils.json_to_sheet(exportData, { header: headers });
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "FreightData");
    const dateStr = new Date().toISOString().split('T')[0];
    const extension = format === 'csv' ? 'csv' : 'xlsx';
    const fileName = `freight_data_${dateStr}.${extension}`;
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
        const jsonData = utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "", raw: false, dateNF: 'yyyy-mm-dd' });
        processRawGrid(jsonData);
      } catch (error) {
        console.error("Parse Error:", error);
        alert("Failed to parse file.");
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
    if (!rows || rows.length === 0) { alert("File is empty."); return; }
    const rawHeaders = rows[0].map(h => String(h || "").trim());
    const finalHeaders = rawHeaders.map((h, i) => {
      if (!h) return getExcelColumnName(i); 
      return h;
    });
    const counts: Record<string, number> = {};
    const uniqueHeaders = finalHeaders.map(h => {
      counts[h] = (counts[h] || 0) + 1;
      return counts[h] > 1 ? `${h}_${counts[h]}` : h;
    });
    const parsedRows: SheetRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const rowArr = rows[i];
      if (!rowArr || rowArr.every(c => c === "" || c === null || c === undefined)) continue;
      const rowObj: SheetRow = { _internal_id: Date.now() + i, _highlights: {} }; 
      uniqueHeaders.forEach((header, colIndex) => { rowObj[header] = rowArr[colIndex]; });
      parsedRows.push(rowObj);
    }
    onImportData(parsedRows, uniqueHeaders);
  };

  const getExcelColumnName = (colIndex: number) => {
      let temp, letter = '';
      while (colIndex >= 0) {
          temp = colIndex % 26;
          letter = String.fromCharCode(temp + 65) + letter;
          colIndex = (colIndex - temp - 1) / 26;
      }
      return letter;
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="p-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2">
           <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider pl-2">Data View</span>
        </div>
        
        <div className="flex items-center gap-2">
          <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
          >
            <span>📂</span> Import
          </button>
          
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors shadow-sm"
            >
              <span>💾</span> Export
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 text-xs">
                <button onClick={() => handleExport('xlsx')} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700">Excel (.xlsx)</button>
                <button onClick={() => handleExport('csv')} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700">CSV (.csv)</button>
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
              <th className="w-10 px-2 py-2 border-b border-r border-gray-200 bg-gray-50 text-center font-normal text-xs">#</th>
              {headers.map((h, i) => (
                 <th key={i} className="px-3 py-2 border-b border-r border-gray-200 font-medium text-xs whitespace-nowrap min-w-[80px]">
                   {h}
                 </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={headers.length + 1} className="text-center py-20 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-3xl">📊</span>
                    <p>No data loaded</p>
                    <p className="text-xs">Import a file or paste an image to start</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rIdx) => (
                <tr key={row._internal_id || rIdx} className="hover:bg-blue-50 group">
                  <td className="px-2 py-1.5 border-b border-r border-gray-100 bg-gray-50 text-center text-xs text-gray-400 select-none group-hover:bg-blue-50/50">
                    {rIdx + 1}
                  </td>
                  {headers.map((header, cIdx) => {
                     const val = row[header] ?? "";
                     const cleanVal = String(val).replace(/,/g, '');
                     const isNumber = !isNaN(Number(cleanVal)) && val !== "";
                     const isHighlighted = row._highlights && row._highlights[header];
                     return (
                        <td key={cIdx} className={`border-b border-r border-gray-100 p-0 ${isHighlighted ? 'bg-green-50' : ''}`}>
                          <input 
                            type="text"
                            value={val}
                            onChange={(e) => onCellEdit(row._internal_id!, header, e.target.value)}
                            className={`w-full h-full px-3 py-1.5 bg-transparent text-gray-700 border-none focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:ring-inset ${isNumber ? 'text-right' : 'text-left'}`}
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