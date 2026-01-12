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
    className={`w-3 h-3 ${active ? 'text-[#0078D7]' : 'text-[#A0A0A0]'} transition-colors duration-200`} 
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
  
  // activeFilters: Map of 'Column Name' -> Set of allowed values (Regular checkboxes)
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>({});

  // uniqueColumns: Set of columns that are currently in "Show Unique / Deduplicate" mode.
  // Logic: A row is shown only if its value in these columns has NOT been seen before (Strict Cleaning).
  const [uniqueColumns, setUniqueColumns] = useState<Set<string>>(new Set());
  
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

  // -- Reset filters when data is cleared --
  useEffect(() => {
    if (data.length === 0) {
      setActiveFilters({});
      setUniqueColumns(new Set());
    }
  }, [data]);

  // -- Filter Logic Helpers --

  // 1. Calculate Unique Values and Counts for a specific column
  const getUniqueStats = (column: string) => {
    const stats = new Map<string, number>();
    
    data.forEach(row => {
      let val = row[column];
      
      // Normalize value: Trim whitespace to avoid "123" and "123 " being separate
      if (val === null || val === undefined) {
        val = '(空白)';
      } else {
        val = String(val).trim();
        if (val === '') val = '(空白)';
      }
      
      stats.set(val, (stats.get(val) || 0) + 1);
    });

    return Array.from(stats.entries()).sort((a, b) => {
       // 1. Sort by Count Descending (High frequency first)
       const countDiff = b[1] - a[1];
       if (countDiff !== 0) return countDiff;

       // 2. Tie-break: Sort by Value Ascending
       if (a[0] === '(空白)') return 1; // Put blanks at the bottom if counts are equal
       if (b[0] === '(空白)') return -1;
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
      setTempFilterSelection(new Set());
    } else {
      setTempFilterSelection(new Set(allValues));
    }
  };

  // 5. Apply Filter (Click OK)
  const applyFilter = () => {
    if (!openFilterHeader) return;
    
    const stats = getUniqueStats(openFilterHeader);
    const allValues = stats.map(s => s[0]);

    const newFilters = { ...activeFilters };
    
    // If all values are selected, remove the explicit value filter for this column
    if (tempFilterSelection.size === allValues.length) {
      delete newFilters[openFilterHeader];
    } else {
      newFilters[openFilterHeader] = tempFilterSelection;
    }
    
    setActiveFilters(newFilters);
    // Note: hitting OK confirms the value checkboxes. It does NOT affect the Unique Toggle (which applies instantly/independently).
    setOpenFilterHeader(null);
  };

  // 6. Handle "Deduplicate" / "Show Unique" Button
  const handleToggleUniqueMode = (header: string) => {
    const newUniqueSet = new Set(uniqueColumns);
    if (newUniqueSet.has(header)) {
      newUniqueSet.delete(header);
    } else {
      newUniqueSet.add(header);
      // Optional: When enabling deduplication, we usually want to clear specific value filters 
      // to ensure the user sees the unique list properly.
      const newFilters = { ...activeFilters };
      delete newFilters[header];
      setActiveFilters(newFilters);
    }
    setUniqueColumns(newUniqueSet);
    // Keep menu open to let user see status change, or close it? 
    // Usually close is better feedback.
    setOpenFilterHeader(null); 
  };

  // -- Derived Data --
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // 1. Apply Standard Value Filters (Checkboxes)
    let result = data.filter(row => {
      return Object.keys(activeFilters).every(colKey => {
        const allowedValues = activeFilters[colKey];
        if (!allowedValues) return true;

        let cellValue = row[colKey];
        if (cellValue === null || cellValue === undefined) {
          cellValue = '(空白)';
        } else {
          cellValue = String(cellValue).trim();
          if (cellValue === '') cellValue = '(空白)';
        }
        
        return allowedValues.has(cellValue);
      });
    });

    // 2. Apply Deduplication (Strict Unique Filter)
    // Logic: If multiple columns are selected (e.g. ID and Phone), 
    // a row is hidden if its ID was seen OR its Phone was seen.
    if (uniqueColumns.size > 0) {
      const seenMaps: Record<string, Set<string>> = {};
      
      // Initialize sets for each active unique column
      uniqueColumns.forEach(col => {
        seenMaps[col] = new Set();
      });

      result = result.filter(row => {
        let isDuplicate = false;

        // Check against all active unique constraints
        for (const col of uniqueColumns) {
          let val = row[col];
          // Normalize
          if (val === null || val === undefined) {
            val = '(空白)';
          } else {
            val = String(val).trim();
            if (val === '') val = '(空白)';
          }

          if (seenMaps[col].has(val)) {
            isDuplicate = true;
          } else {
            // Important: We only add to 'seen' if we are keeping this row?
            // Actually, for "Strict Unique", yes. But wait.
            // If row has (ID=1, Phone=A) -> Keep. SeenID={1}, SeenPhone={A}
            // If next row has (ID=1, Phone=B) -> ID matches. Duplicate. Drop.
            // If next row has (ID=2, Phone=A) -> Phone matches. Duplicate. Drop.
            // This ensures the result has NO duplicate IDs and NO duplicate Phones.
          }
        }

        if (isDuplicate) {
          return false;
        }

        // If not duplicate, add values to seen and keep row
        for (const col of uniqueColumns) {
          let val = row[col];
          if (val === null || val === undefined) {
            val = '(空白)';
          } else {
            val = String(val).trim();
            if (val === '') val = '(空白)';
          }
          seenMaps[col].add(val);
        }
        return true;
      });
    }

    return result;
  }, [data, activeFilters, uniqueColumns]);

  // -- Standard Handlers --

  const handleExport = (format: 'xlsx' | 'csv') => {
    setIsExportMenuOpen(false);
    if (filteredData.length === 0) {
      alert("表格为空或筛选结果为空");
      return;
    }
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
    writeFile(wb, `douyin_data_export.${format === 'csv' ? 'csv' : 'xlsx'}`);
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
        console.error(error);
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
    setActiveFilters({});
    setUniqueColumns(new Set()); // Reset unique filter on import
    onImportData(parsedRows, filteredRawHeaders);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="px-2 py-1 bg-[#F3F3F3] border-b border-[#E5E5E5] flex justify-between items-center h-[36px]">
        <div className="flex items-center gap-2">
           <span className="text-xs text-[#333333]">
             显示: {filteredData.length} / 总计: {data.length}
             {uniqueColumns.size > 0 && (
               <span className="ml-2 text-[#0078D7] font-semibold">
                 (已去重: {Array.from(uniqueColumns).join(', ')})
               </span>
             )}
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
                 // Active logic: Either has value filters OR is IN the uniqueColumns set
                 const isFilterActive = !!activeFilters[h] || uniqueColumns.has(h);
                 const isMenuOpen = openFilterHeader === h;

                 return (
                   <th key={i} className="relative px-2 py-1 border-b border-r border-[#D9D9D9] font-normal text-xs text-[#333333] h-[30px] hover:bg-[#EBEBEB] group select-none">
                     <div className="flex items-center justify-between w-full h-full">
                       <span className="truncate mr-1 font-semibold">{h}</span>
                       <button 
                          onClick={(e) => handleFilterClick(h, e)}
                          title="筛选"
                          className={`p-1 rounded hover:bg-[#DADADA] focus:outline-none flex-shrink-0`}
                       >
                         <FilterIcon active={isFilterActive} />
                       </button>
                     </div>

                     {/* Filter Dropdown Menu (Win10 Style) */}
                     {isMenuOpen && (
                       <div 
                         ref={filterMenuRef}
                         className="absolute left-0 top-full mt-0 w-64 bg-white border border-[#CCCCCC] shadow-[3px_3px_10px_rgba(0,0,0,0.15)] z-50 flex flex-col font-normal"
                         onClick={(e) => e.stopPropagation()}
                       >
                         {(() => {
                           // Calculate stats inside the dropdown
                           const stats = getUniqueStats(h);
                           const allValues = stats.map(s => s[0]);
                           const isAllSelected = tempFilterSelection.size === allValues.length;
                           const isUniqueModeActive = uniqueColumns.has(h);

                           return (
                             <>
                               {/* Action Buttons */}
                               <div className="flex justify-between p-2 border-b border-[#E5E5E5] bg-[#F9F9F9]">
                                 <button onClick={applyFilter} className="text-xs px-4 py-1 bg-[#0078D7] text-white hover:bg-[#006CC1] transition-colors border border-transparent">确定</button>
                                 <button onClick={() => setOpenFilterHeader(null)} className="text-xs px-4 py-1 border border-[#CCCCCC] bg-white hover:bg-[#F0F0F0] text-[#333333] transition-colors">取消</button>
                               </div>

                               {/* Helper Button: Deduplicate (Filter Unique Items) */}
                               <div className="px-2 py-1.5 border-b border-[#E5E5E5] bg-white flex justify-center">
                                  <button 
                                    onClick={() => handleToggleUniqueMode(h)}
                                    className={`w-full text-xs py-1 border transition-colors flex items-center justify-center gap-1
                                      ${isUniqueModeActive 
                                        ? 'bg-[#E5F1FB] border-[#0078D7] text-[#0078D7] font-bold' 
                                        : 'bg-[#F0F0F0] border-[#CCCCCC] text-[#333333] hover:bg-[#E0E0E0]'
                                      }
                                    `}
                                    title="将重复出现的项合并，每个值只保留一行"
                                  >
                                    {isUniqueModeActive ? (
                                      <>✓ 已去重 (显示全部)</>
                                    ) : (
                                      <>✦ 筛选唯一项 (去重)</>
                                    )}
                                  </button>
                               </div>

                               {/* List Area */}
                               <div className="max-h-60 overflow-y-auto p-2 scrollbar-win10 bg-white">
                                    <div className="flex flex-col gap-1">
                                      {/* Select All */}
                                      <label className="flex items-center gap-2 px-1 py-1 hover:bg-[#F0F0F0] cursor-pointer select-none">
                                        <input 
                                          type="checkbox" 
                                          checked={isAllSelected}
                                          onChange={() => toggleSelectAll(allValues)}
                                          className="accent-[#0078D7] w-3.5 h-3.5"
                                        />
                                        <span className="text-xs text-[#333333] font-semibold">(全选)</span>
                                      </label>
                                      
                                      <div className="h-[1px] bg-[#E5E5E5] my-1"></div>
                                      
                                      {/* Individual Items - Sorted by Count Descending */}
                                      {stats.map(([val, count]) => (
                                        <label key={val} className="flex items-center gap-2 px-1 py-0.5 hover:bg-[#F0F0F0] cursor-pointer select-none">
                                          <input 
                                            type="checkbox" 
                                            checked={tempFilterSelection.has(val)}
                                            onChange={() => toggleFilterValue(val)}
                                            className="accent-[#0078D7] w-3.5 h-3.5"
                                          />
                                          <span className="text-xs text-[#333333] truncate flex-1" title={val}>{val}</span>
                                          <span className="text-xs text-[#888888]">({count})</span>
                                        </label>
                                      ))}
                                    </div>
                               </div>
                             </>
                           );
                         })()}
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
                <td colSpan={headers.length + 1} className="text-center py-10 text-[#999999] text-xs">
                  {data.length > 0 ? "没有符合筛选条件的数据" : "暂无数据，请导入或使用左侧工具提取"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};