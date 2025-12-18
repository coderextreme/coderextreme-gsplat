import React, { useState, useCallback } from 'react';
import { parsePlyFile } from './services/plyParser';
import { ParsedSplatData, ViewerState } from './types';
import Viewer from './components/Viewer';

const App: React.FC = () => {
  const [status, setStatus] = useState<ViewerState>(ViewerState.IDLE);
  const [data, setData] = useState<ParsedSplatData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStatus(ViewerState.LOADING);
    setErrorMsg('');
    setData(null);

    // Small delay to allow UI to update to "Loading"
    setTimeout(async () => {
      try {
        setStatus(ViewerState.PARSING);
        const parsedData = await parsePlyFile(file);
        setData(parsedData);
        setStatus(ViewerState.RENDERING);
      } catch (err: any) {
        console.error(err);
        setStatus(ViewerState.ERROR);
        setErrorMsg(err.message || 'Failed to parse PLY file');
      }
    }, 100);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col font-sans">
      {/* Header */}
      <header className="px-6 py-4 bg-gray-950 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Lumina Splat Viewer
          </h1>
        </div>
        
        <div className="flex items-center space-x-4">
           {status !== ViewerState.IDLE && fileName && (
             <span className="text-xs font-mono text-gray-500 border border-gray-800 px-2 py-1 rounded bg-gray-900">
               {fileName}
             </span>
           )}
           <a 
            href="#" 
            className="text-sm text-gray-400 hover:text-white transition-colors"
           >
             Docs
           </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 flex flex-col lg:flex-row gap-6">
        
        {/* Sidebar / Controls */}
        <aside className="w-full lg:w-80 flex flex-col space-y-6">
          
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Upload Data</h2>
            
            <label className="block w-full cursor-pointer group">
              <input 
                type="file" 
                accept=".ply" 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <div className="w-full h-32 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center bg-gray-900/50 group-hover:border-blue-500 group-hover:bg-gray-900 transition-all">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-500 group-hover:text-blue-400 mb-2 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                 </svg>
                 <span className="text-sm text-gray-500 group-hover:text-gray-300">Click to select .ply file</span>
              </div>
            </label>
          </div>

          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg flex-1">
             <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Status</h2>
             
             <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">System State:</span>
                  <span className={`font-mono font-medium ${
                    status === ViewerState.ERROR ? 'text-red-400' : 
                    status === ViewerState.RENDERING ? 'text-green-400' : 'text-blue-400'
                  }`}>
                    {ViewerState[status]}
                  </span>
                </div>
                
                {data && (
                  <div className="space-y-2 pt-4 border-t border-gray-700">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400">Vertex Count:</span>
                      <span className="font-mono text-white">{data.vertexCount.toLocaleString()}</span>
                    </div>
                     <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400">Memory:</span>
                      <span className="font-mono text-white">~{Math.round(data.vertexCount * 44 / 1024 / 1024)} MB</span>
                    </div>
                  </div>
                )}

                {status === ViewerState.LOADING || status === ViewerState.PARSING ? (
                  <div className="pt-4">
                    <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-blue-500 h-1.5 rounded-full animate-progress-indeterminate"></div>
                    </div>
                    <p className="text-xs text-center text-gray-500 mt-2">Processing binary data...</p>
                  </div>
                ) : null}

                {errorMsg && (
                  <div className="p-3 bg-red-900/30 border border-red-800 rounded text-xs text-red-200 mt-4">
                    Error: {errorMsg}
                  </div>
                )}
             </div>
          </div>

        </aside>

        {/* Viewer Area */}
        <section className="flex-1 h-[600px] lg:h-auto min-h-[500px]">
          <Viewer data={data} />
        </section>

      </main>
      
      {/* Custom Keyframes for loading bar */}
      <style>{`
        @keyframes progress-indeterminate {
          0% { width: 30%; margin-left: -30%; }
          50% { width: 30%; margin-left: 100%; }
          100% { width: 30%; margin-left: 100%; }
        }
        .animate-progress-indeterminate {
          animation: progress-indeterminate 1.5s infinite linear;
        }
      `}</style>
    </div>
  );
};

export default App;