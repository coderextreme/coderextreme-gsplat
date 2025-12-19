import React, { useEffect, useRef } from 'react';
import { SplatRenderer } from '../services/webglRenderer';
import { ParsedSplatData } from '../types';

interface ViewerProps {
  data: ParsedSplatData | null;
}

const Viewer: React.FC<ViewerProps> = ({ data }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SplatRenderer | null>(null);

  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      try {
        rendererRef.current = new SplatRenderer(canvasRef.current);
      } catch (e) {
        console.error("Failed to initialize renderer", e);
      }
    }

    if (rendererRef.current && data) {
      rendererRef.current.init(data);
    }

    return () => {
      if (rendererRef.current) {
        rendererRef.current.cleanup();
      }
    };
  }, [data]);

  return (
    <div className="w-full h-full relative bg-gray-950 overflow-hidden rounded-lg shadow-2xl border border-gray-850">
      <canvas 
        id="gl-canvas"
        ref={canvasRef} 
        className="w-full h-full block cursor-move"
        onContextMenu={(e) => e.preventDefault()}
      />
      {!data && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-500 font-mono text-sm">Waiting for PLY data...</p>
        </div>
      )}
      <div className="absolute bottom-4 left-4 pointer-events-none">
         <div className="bg-gray-950/80 backdrop-blur-sm p-3 rounded text-xs text-gray-400 border border-gray-800 space-y-1">
            <p><span className="text-blue-400 font-bold">LMB</span> + Drag: Rotate</p>
            <p><span className="text-blue-400 font-bold">RMB</span> + Drag: Pan</p>
            <p><span className="text-blue-400 font-bold">Scroll</span>: Zoom</p>
         </div>
      </div>
    </div>
  );
};

export default Viewer;