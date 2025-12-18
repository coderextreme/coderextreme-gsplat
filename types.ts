export interface SplatPoint {
  position: Float32Array; // x, y, z
  scale: Float32Array;    // x, y, z
  rotation: Float32Array; // w, x, y, z
  opacity: number;
  color: Float32Array;    // r, g, b (derived from SH DC)
}

export interface ParsedSplatData {
  vertexCount: number;
  positions: Float32Array; // Flattened array of all positions
  scales: Float32Array;    // Flattened array
  rotations: Float32Array; // Flattened array
  opacities: Float32Array; // Flattened array
  colors: Float32Array;    // Flattened RGB
}

export enum ViewerState {
  IDLE,
  LOADING,
  PARSING,
  RENDERING,
  ERROR
}

export interface WebGLContextConfig {
  canvas: HTMLCanvasElement;
  vertexShaderSource: string;
  fragmentShaderSource: string;
}