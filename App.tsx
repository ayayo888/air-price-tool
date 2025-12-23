import { useState, useEffect } from 'react';
import { DataGrid } from './components/DataGrid';
import { PriceUpdater } from './components/PriceUpdater';
import { SheetRow, PriceUpdatePreview } from './types';

// Default Sample Data
const INITIAL_HEADERS = ['Port', 'Dest Code', 'P45', 'P100', 'P300', 'P500', 'P1000'];
const INITIAL_ROWS: SheetRow[] = [
  { _internal_id: 1, Port: 'Moscow', 'Dest Code': 'SVO', P45: 65, P100: 44, P300: 42, P500: 40, P1000: 38 },
  { _internal_id: 2, Port: 'Sochi', 'Dest Code': 'AER', P45: 95, P100: 80, P300: 75, P500: 70, P1000: 65 },
  { _internal_id: 3, Port: 'Astrakhan', 'Dest Code': 'ASF', P45: 90, P100: 82, P300: 78, P500: 75, P1000: 70 },
];

interface ProjectState {
  headers: string[];
  rows: SheetRow[];
}

export default function App() {
  const [project, setProject] = useState<ProjectState>(() => {
    const savedHeaders = localStorage.getItem('airfreight_headers');
    const savedRows = localStorage.getItem('airfreight_db');
    return {
      headers: savedHeaders ? JSON.parse(savedHeaders) : INITIAL_HEADERS,
      rows: savedRows ? JSON.parse(savedRows) : INITIAL_ROWS
    };
  });

  // Save to local storage whenever project state changes
  useEffect(() => {
    localStorage.setItem('airfreight_db', JSON.stringify(project.rows));
    localStorage.setItem('airfreight_headers', JSON.stringify(project.headers));
  }, [project]);

  const handleApplyUpdates = (updates: PriceUpdatePreview[]) => {
    setProject(prev => {
      const newRows = [...prev.rows];
      
      updates.forEach(update => {
        const index = newRows.findIndex(row => row._internal_id === update.rowId);
        if (index !== -1) {
          // 1. Get existing highlights or init empty
          const currentHighlights = newRows[index]._highlights || {};
          const newHighlights = { ...currentHighlights };

          // 2. Mark updated columns as true
          Object.keys(update.updates).forEach(key => {
            newHighlights[key] = true;
          });

          // 3. Merge data and highlights
          newRows[index] = {
            ...newRows[index],
            ...update.updates,
            _highlights: newHighlights
          };
        }
      });
      return { ...prev, rows: newRows };
    });
  };

  // New: Handle manual edits from the DataGrid
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

  const handleImportData = (newRows: SheetRow[], newHeaders: string[]) => {
    if (newRows.length > 0) {
      setProject({
        headers: newHeaders,
        rows: newRows
      });
    } else {
      alert("No valid rows found in the imported file.");
    }
  };

  const resetDatabase = () => {
    if(confirm("Are you sure you want to reset the database to default test data?")) {
      setProject({
        headers: INITIAL_HEADERS,
        rows: INITIAL_ROWS
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 text-slate-800 font-sans">
      {/* Header / Title Bar */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 justify-between flex-shrink-0 shadow-sm z-10">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">✈️</span>
          <h1 className="text-lg font-bold tracking-tight text-gray-800">AirFreight Smart Updater</h1>
          <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 ml-2">v2.1</span>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={resetDatabase}
            className="text-xs text-gray-400 hover:text-red-500 underline"
          >
            Reset
          </button>
          <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">
            JD
          </div>
        </div>
      </header>

      {/* Main Content Area - Split View */}
      <main className="flex-1 flex overflow-hidden p-6 gap-6">
        
        {/* Left Panel: Actions / Updater */}
        <section className="w-1/3 min-w-[400px] flex flex-col">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
             <PriceUpdater 
               currentData={project.rows}
               headers={project.headers}
               onApplyUpdates={handleApplyUpdates} 
             />
          </div>
        </section>

        {/* Right Panel: Data Grid (The "Spreadsheet") */}
        <section className="flex-1 flex flex-col min-w-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
            <DataGrid 
              data={project.rows}
              headers={project.headers}
              onImportData={handleImportData}
              onCellEdit={handleCellEdit}
            />
          </div>
        </section>

      </main>

      {/* SEO Footer - Visible to Bots, helpful for users, keeps 'app' feel */}
      <footer className="bg-gray-50 border-t border-gray-200 p-4 text-xs text-gray-500">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h2 className="font-semibold text-gray-700 mb-1">About AirFreight Smart Updater</h2>
            <p>
              This is a free online <strong>Logistics OCR tool</strong> designed for freight forwarders. 
              Upload images of air freight rate sheets, and our AI (powered by Gemini Vision) automatically 
              extracts destination codes (e.g., SVO, HKG) and weight breaks (+45kg, +100kg, etc.) into an 
              editable Excel-like grid.
            </p>
          </div>
          <div>
            <h2 className="font-semibold text-gray-700 mb-1">Features</h2>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Instant <strong>Image to Excel</strong> conversion for rate sheets.</li>
              <li>Privacy-focused: Data is processed in memory and saved to Local Storage.</li>
              <li>Export refined data to <strong>CSV or XLSX</strong> for your ERP system.</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}