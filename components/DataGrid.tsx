import React, { useRef, useState, useEffect, useMemo } from 'react';
import { read, utils, writeFile } from 'xlsx';
import { CleanerRow } from '../types';

interface DataGridProps {
  data: CleanerRow[];
  headers: string[];
  onImportData: (data: CleanerRow[], headers: string[]) => void;
  onCellEdit: (rowId: number | string, column: string, value: any) => void;
}

// Icon for the filter button
const FilterIcon = ({ active }: { active: boolean }) => (
  <svg 
    className={`w-3 h-3 ${active ? 'text-[#0078D7]' : 'text-[#999999] hover:text-[#666666]'}`} 
    fill="currentColor" 
    viewBox="0 0 24 24"
  >
    <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
  </svg>
);

export const DataGrid: React.FC<DataGridProps> = ({ data, headers, onImportData, onCellEdit }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // -- Export Menu State --
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // -- Filter System State --
  // openFilterHeader: Which column's menu is currently open (null = none)
  const [openFilterHeader, setOpenFilterHeader] = useState<string | null>(null);
  
  // activeFilters: Map of 'Column Name' -> Set of allowed values
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>({});
  
  // tempFilterSelection: Used while the menu is open (before clicking OK)
  const [tempFilterSelection, setTempFilterSelection] = useState<Set<string>>(new Set());

  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        // If clicking outside filter menu, close it without applying
        setOpenFilterHeader(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -- Filter Logic Helpers --

  // 1. Calculate Unique Values and Counts for a specific column
  const getUniqueStats = (column: string) => {
    const stats = new Map<string, number>();
    data.forEach(row => {
      let val = row[column];
      // Normalize value: convert null/undefined/empty to "(空白)" for display
      if (val === null || val === undefined || String(val).trim() === '') {
        val = '(空白)';
      } else {
        val = String(val);
      }
      stats.set(val, (stats.get(val) || 0) + 1);
    });
    return Array.from(stats.entries()).sort((a, b) => {
       // Sort: (Blank) usually goes last or first, let's put it first for visibility or alpha sort
       if (a[0] === '(空白)') return -1;
       if (b[0] === '(空白)') return 1;
       return a[0].localeCompare(b[0]);
    });
  };

  // 2. Open Filter Menu
  const handleFilterClick = (header: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If opening a new menu, initialize temp selection
    if (openFilterHeader !== header) {
      const stats = getUniqueStats(header);
      const allValues = stats.map(s => s[0]);
      
      // If a filter already exists for this column, load it. Otherwise, select all.
      if (activeFilters[header]) {
        setTempFilterSelection(new Set(activeFilters[header]));
      } else {
        setTempFilterSelection(new Set(allValues));
      }
      setOpenFilterHeader(header);
    } else {
      setOpenFilterHeader(null);
    }
  };

  // 3. Toggle a specific value in the temporary selection
  const toggleFilterValue = (val: string) => {
    const newSet = new Set(tempFilterSelection);
    if (newSet.has(val)) {
      newSet.delete(val);
    } else {
      newSet.add(val);
    }
    setTempFilterSelection(newSet);
  };

  // 4. Toggle Select All
  const toggleSelectAll = (allValues: string[]) => {
    if (tempFilterSelection.size === allValues.length) {
      // If all selected, deselect all
      setTempFilterSelection(new Set());
    } else {
      // Otherwise, select all
      setTempFilterSelection(new Set(allValues));
    }
  };

  // 5. Apply Filter (Click OK)
  const applyFilter = () => {
    if (!openFilterHeader) return;
    
    const stats = getUniqueStats(openFilterHeader);
    const allValues = stats.map(s => s[0]);

    // If all values are selected, we can actually remove the filter key to save performance
    // But keeping it explicit is safer for UI consistency. 
    // Optimization: If selection size == allValues size, remove from activeFilters to denote "no filter"
    
    const newFilters = { ...activeFilters };
    if (tempFilterSelection.size === allValues.length) {
      delete newFilters[openFilterHeader];
    } else {
      newFilters[openFilterHeader] = tempFilterSelection;
    }
    
    setActiveFilters(newFilters);
    setOpenFilterHeader(null);
  };

  // 6. Clear Filter for current column
  const clearFilter = () => {
    if (!openFilterHeader) return;
    const newFilters = { ...activeFilters };
    delete newFilters[openFilterHeader];
    setActiveFilters(newFilters);
    setOpenFilterHeader(null);
  };

  // -- Derived Data --
  // Apply active filters to data
  const filteredData = useMemo(() => {
    return data.filter(row => {
      // Must match ALL active column filters
      return Object.keys(activeFilters).every(colKey => {
        const allowedValues = activeFilters[colKey];
        if (!allowedValues) return true;

        let cellValue = row[colKey];
        if (cellValue === null || cellValue === undefined || String(cellValue).trim() === '') {
          cellValue = '(空白)';
        } else {
          cellValue = String(cellValue);
        }
        
        return allowedValues.has(cellValue);
      });
    });
  }, [data, activeFilters]);

  // -- Standard Handlers --

  const handleExport = (format: 'xlsx' | 'csv') => {
    setIsExportMenuOpen(false);
    if (filteredData.length === 0) {
      alert("表格为空或筛选结果为空");
      return;
    }
    // Export only what is visible (filteredData)
    const exportData = filteredData.map(row => {
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
    // Importing new data clears filters to avoid confusion
    setActiveFilters({});
    onImportData(parsedRows, filteredRawHeaders);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="px-2 py-1 bg-[#F3F3F3] border-b border-[#E5E5E5] flex justify-between items-center h-[36px]">
        <div className="flex items-center gap-2">
           <span className="text-xs text-[#333333]">
             显示: {filteredData.length} / 总计: {data.length}
           </span>
        </div>
        
        <div className="flex items-center gap-1">
          <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 text-xs text-[#333333] hover:bg-[#D9D9D9] transition-colors border border-transparent hover:border-[#CCCCCC] rounded-none"
          >
            导入
          </button>
          
          <div className="relative" ref={exportMenuRef}>
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
        <table className="w-full text-sm text-left border-collapse table-fixed">
          <thead className="bg-white sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="w-8 border-b border-r border-[#D9D9D9] bg-[#F5F5F5] text-center"></th>
              {headers.map((h, i) => {
                 const isFilterActive = !!activeFilters[h];
                 const isMenuOpen = openFilterHeader === h;

                 return (
                   <th key={i} className="relative px-2 py-1 border-b border-r border-[#D9D9D9] font-normal text-xs text-[#333333] h-[30px] hover:bg-[#EBEBEB] group select-none">
                     <div className="flex items-center justify-between w-full">
                       <span className="truncate mr-1">{h}</span>
                       <button 
                          onClick={(e) => handleFilterClick(h, e)}
                          className={`p-1 rounded hover:bg-[#DADADA] focus:outline-none ${isMenuOpen || isFilterActive ? 'visible' : 'invisible group-hover:visible'}`}
                       >
                         <FilterIcon active={isFilterActive} />
                       </button>
                     </div>

                     {/* Filter Dropdown Menu */}
                     {isMenuOpen && (
                       <div 
                         ref={filterMenuRef}
                         className="absolute left-0 top-full mt-0 w-64 bg-white border border-[#CCCCCC] shadow-[2px_2px_10px_rgba(0,0,0,0.1)] z-50 flex flex-col font-normal"
                       >
                         {/* Action Buttons */}
                         <div className="flex justify-between p-2 border-b border-[#E5E5E5] bg-[#F9F9F9]">
                           <button onClick={applyFilter} className="text-xs px-3 py-1 bg-[#0078D7] text-white hover:bg-[#006CC1]">确定</button>
                           <button onClick={() => setOpenFilterHeader(null)} className="text-xs px-3 py-1 border border-[#CCCCCC] bg-white hover:bg-[#F0F0F0]">取消</button>
                         </div>

                         {/* List Area */}
                         <div className="max-h-60 overflow-y-auto p-2 scrollbar-win10">
                            {(() => {
                              const stats = getUniqueStats(h);
                              const allValues = stats.map(s => s[0]);
                              const isAllSelected = tempFilterSelection.size === allValues.length;
                              
                              return (
                                <div className="flex flex-col gap-1">
                                  {/* Select All */}
                                  <label className="flex items-center gap-2 px-1 py-0.5 hover:bg-[#F0F0F0] cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      checked={isAllSelected}
                                      onChange={() => toggleSelectAll(allValues)}
                                      className="accent-[#0078D7]"
                                    />
                                    <span className="text-xs text-[#333333]">(全选) {filteredData.length}</span>
                                  </label>
                                  
                                  <div className="h-[1px] bg-[#E5E5E5] my-1"></div>
                                  
                                  {/* Individual Items */}
                                  {stats.map(([val, count]) => (
                                    <label key={val} className="flex items-center gap-2 px-1 py-0.5 hover:bg-[#F0F0F0] cursor-pointer">
                                      <input 
                                        type="checkbox" 
                                        checked={tempFilterSelection.has(val)}
                                        onChange={() => toggleFilterValue(val)}
                                        className="accent-[#0078D7]"
                                      />
                                      <span className="text-xs text-[#333333] truncate flex-1" title={val}>{val}</span>
                                      <span className="text-xs text-[#999999]">({count})</span>
                                    </label>
                                  ))}
                                </div>
                              );
                            })()}
                         </div>
                       </div>
                     )}
                   </th>
                 );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, rIdx) => (
              <tr key={row._internal_id || rIdx} className="hover:bg-[#E5F3FF] group border-b border-[#F0F0F0]">
                <td className="w-8 border-r border-[#F0F0F0] bg-[#F9F9F9] text-center text-[10px] text-[#999999] select-none">
                  {rIdx + 1}
                </td>
                {headers.map((header, cIdx) => {
                    if (header === '状态') {
                      const isVerified = row.checkStatus === 'verified';
                      return (
                        <td key={cIdx} className="px-2 border-r border-[#F0F0F0] text-xs w-[60px]">
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
            {filteredData.length === 0 && (
              <tr>
                <td colSpan={headers.length + 1} className="text-center py-8 text-[#999999] text-xs">
                  {data.length > 0 ? "没有符合筛选条件的数据" : "表格为空，请导入数据或使用左侧工具提取"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};