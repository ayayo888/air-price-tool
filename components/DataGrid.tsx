
import React, { useRef, useState, useEffect } from 'react';
import { read, utils, writeFile } from 'xlsx';
import { SheetRow } from '../types';

interface DataGridProps {
  data: SheetRow[];
  headers: string[];
  onImportData: (data: SheetRow[], headers: string[]) => void;
  // New: callback when a cell is edited
  onCellEdit: (rowId: number | string, column: string, value: any) => void;
}

export const DataGrid: React.FC<DataGridProps> = ({ data, headers, onImportData, onCellEdit }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Export Logic ---
  const handleExport = (format: 'xlsx' | 'csv') => {
    setIsExportMenuOpen(false);
    
    if (data.length === 0 || headers.length === 0) {
      alert("No data to export.");
      return;
    }

    // 1. Prepare Data
    // We map exactly what is in the state to the export file
    // Note: This naturally includes manual edits because 'data' is the source of truth
    const exportData = data.map(row => {
      const rowData: Record<string, any> = {};
      headers.forEach(h => {
        rowData[h] = row[h];
      });
      return rowData;
    });

    // 2. Create Sheet
    const ws = utils.json_to_sheet(exportData, { header: headers });
    
    // 3. Create Workbook
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "FreightData");

    // 4. Generate Filename
    const dateStr = new Date().toISOString().split('T')[0];
    const extension = format === 'csv' ? 'csv' : 'xlsx';
    const fileName = `freight_data_${dateStr}.${extension}`;

    // 5. Download
    writeFile(wb, fileName, { bookType: format === 'csv' ? 'csv' : 'xlsx' });
  };

  // --- Import Logic ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();

    const processData = (arrayBuffer: ArrayBuffer | string, isBinary: boolean) => {
      try {
        const workbook = read(arrayBuffer, { 
          type: isBinary ? 'array' : 'string',
          cellDates: true, 
          cellNF: true,
          cellText: false 
        });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const jsonData = utils.sheet_to_json<any[]>(worksheet, { 
          header: 1, 
          defval: "",
          raw: false, 
          dateNF: 'yyyy-mm-dd' 
        });

        processRawGrid(jsonData);
      } catch (error) {
        console.error("Parse Error:", error);
        alert("Failed to parse file. Please ensure it is a valid Excel or CSV file.");
      }
    };

    if (fileExt === 'csv') {
      reader.onload = (e) => processData(e.target?.result as string, false);
      reader.readAsText(file);
    } else {
      reader.onload = (e) => processData(e.target?.result as ArrayBuffer, true);
      reader.readAsArrayBuffer(file);
    }
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processRawGrid = (rows: any[][]) => {
    if (!rows || rows.length === 0) {
      alert("File is empty.");
      return;
    }

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

      // New rows imported do not have highlights
      const rowObj: SheetRow = { 
        _internal_id: Date.now() + i,
        _highlights: {} 
      }; 
      
      uniqueHeaders.forEach((header, colIndex) => {
        rowObj[header] = rowArr[colIndex];
      });

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

  // --- Render ---

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full relative">
      {/* Toolbar */}
      <div className="p-2 border-b border-gray-200 bg-gray-50 flex justify-between items-center gap-2 z-20 relative">
        <div className="flex items-center gap-2 px-2">
           <span className="text-sm font-semibold text-gray-700">Spreadsheet View</span>
        </div>
        
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            accept=".csv, .xlsx, .xls"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 transition-colors"
          >
            📂 Import File
          </button>
          
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-green-600 rounded hover:bg-green-700 transition-colors shadow-sm"
            >
              <span>💾 Export</span>
              <svg className={`w-4 h-4 ml-1 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-50 py-1">
                <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Select Format</div>
                <button 
                  onClick={() => handleExport('xlsx')}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                >
                  Excel Workbook (.xlsx)
                </button>
                <button 
                  onClick={() => handleExport('csv')}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                >
                  CSV (.csv)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-auto flex-1 bg-white relative z-10">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-gray-100 text-gray-700 sticky top-0 z-10 shadow-sm">
            <tr>
              {/* Row Number Column Header */}
              <th className="w-10 px-2 py-1 border border-gray-300 bg-gray-200 text-center font-normal text-xs text-gray-500">
                #
              </th>
              {headers.map((h, i) => (
                 <th key={i} className="px-3 py-1.5 border border-gray-300 font-semibold whitespace-nowrap min-w-[100px]">
                   {h}
                 </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={headers.length + 1} className="text-center py-20 text-gray-400">
                  <div className="flex flex-col items-center justify-center">
                     <p className="text-lg mb-2">Empty Sheet</p>
                     <p className="text-sm">Import an Excel or CSV file to view data.</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rIdx) => (
                <tr key={row._internal_id || rIdx} className="hover:bg-blue-50 transition-colors">
                  {/* Row Number */}
                  <td className="px-2 py-1 border border-gray-300 bg-gray-50 text-center text-xs text-gray-500 select-none">
                    {rIdx + 1}
                  </td>
                  {/* Editable Data Cells */}
                  {headers.map((header, cIdx) => {
                     const val = row[header] ?? "";
                     
                     // Helper: Check if value looks like a number for alignment
                     const cleanVal = String(val).replace(/,/g, '');
                     const isNumber = !isNaN(Number(cleanVal)) && val !== "";
                     
                     // Check Highlight
                     const isHighlighted = row._highlights && row._highlights[header];

                     return (
                        <td 
                          key={cIdx} 
                          className={`border border-gray-300 p-0 ${isHighlighted ? 'bg-green-100' : 'bg-white'}`}
                        >
                          <input 
                            type="text"
                            value={val}
                            onChange={(e) => onCellEdit(row._internal_id!, header, e.target.value)}
                            // FIX: Added text-gray-900 to ensure visibility on white background
                            className={`w-full h-full px-2 py-1 bg-transparent text-gray-900 border-none focus:ring-2 focus:ring-blue-500 focus:outline-none ${isNumber ? 'text-right' : 'text-left'}`}
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
      
      {/* Footer / Status Bar */}
      <div className="bg-gray-50 border-t border-gray-200 px-4 py-1 text-xs text-gray-500 flex justify-between z-20">
         <span>Rows: {data.length}</span>
         <span>Cols: {headers.length}</span>
         <span className="text-gray-400">Edits are auto-saved to memory</span>
      </div>
    </div>
  );
};
