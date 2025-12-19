import { ParsedSplatData } from '../types';

// Requirement FR-PLY-150: Limit for debugging/performance
// Increased to 1M to support standard Gaussian Splatting benchmark scenes
const MAX_VERTEX_COUNT = 1000000; 

export const parsePlyFile = async (file: File): Promise<ParsedSplatData> => {
  const buffer = await file.arrayBuffer();
  const dataView = new DataView(buffer);
  const textDecoder = new TextDecoder('ascii');

  // Helper to read line by line from buffer
  let headerOffset = 0;
  const headerTextChunk = textDecoder.decode(buffer.slice(0, 5000)); // Read first 5KB for header
  const headerLines = headerTextChunk.split('\n');

  let endHeaderIndex = -1;
  let vertexCount = 0;
  let isBinary = false;
  
  interface Property {
    name: string;
    type: string;
    offset?: number;
  }
  const properties: Property[] = [];

  // FR-PLY-100: Locate end_header
  // FR-PLY-110: Binary format confirmation
  // FR-PLY-120: Vertex Property Mapping
  
  let inVertexElement = false;

  for (let i = 0; i < headerLines.length; i++) {
    const line = headerLines[i].trim();
    headerOffset += line.length + 1; // Approximate offset calculation for the actual binary start

    if (line === 'end_header') {
      endHeaderIndex = i;
      // Re-calculate exact binary offset based on the bytes consumed by the header string
      // Finding the exact byte offset of 'end_header' + newline
      const exactHeaderString = headerLines.slice(0, i + 1).join('\n') + '\n';
      headerOffset = exactHeaderString.length; 
      break;
    }

    if (line.startsWith('format')) {
      if (line.includes('binary_little_endian 1.0')) {
        isBinary = true;
      } else {
        throw new Error('Unsupported PLY format. Must be binary_little_endian 1.0');
      }
    }

    if (line.startsWith('element vertex')) {
      const parts = line.split(' ');
      vertexCount = parseInt(parts[2], 10);
      inVertexElement = true;
    } else if (line.startsWith('element') && !line.includes('vertex')) {
      inVertexElement = false;
    }

    if (inVertexElement && line.startsWith('property')) {
      const parts = line.split(' ');
      // format: property <type> <name>
      const type = parts[1];
      const name = parts[2];
      properties.push({ name, type });
    }
  }

  if (!isBinary) {
    throw new Error('PLY file is not binary.');
  }

  // FR-PLY-150: Limit data
  const renderCount = Math.min(vertexCount, MAX_VERTEX_COUNT);

  // FR-PLY-140: Data Structure Generation
  const positions = new Float32Array(renderCount * 3);
  const scales = new Float32Array(renderCount * 3);
  const rotations = new Float32Array(renderCount * 4);
  const opacities = new Float32Array(renderCount);
  const colors = new Float32Array(renderCount * 3); // RGB

  let byteOffset = headerOffset;

  // We need to know the stride of a single vertex
  // FR-PLY-130: Binary Data Reading (advance by 4 for floats, skip others)
  // We assume standard PLY where listed properties are sequential in the binary block
  
  for (let i = 0; i < renderCount; i++) {
    // Safety check for buffer bounds
    if (byteOffset >= buffer.byteLength) break;

    // Default values
    let x = 0, y = 0, z = 0;
    let r = 0.5, g = 0.5, b = 0.5;
    let opacity = 1.0;
    let sx = 0.1, sy = 0.1, sz = 0.1;
    let rw = 1, rx = 0, ry = 0, rz = 0;

    for (const prop of properties) {
      if (prop.type === 'float' || prop.type === 'float32') {
        const value = dataView.getFloat32(byteOffset, true); // Little endian
        byteOffset += 4;

        switch (prop.name) {
          case 'x': x = value; break;
          case 'y': y = value; break;
          case 'z': z = value; break;
          case 'scale_0': sx = Math.exp(value); break; // Splats usually store log scale
          case 'scale_1': sy = Math.exp(value); break;
          case 'scale_2': sz = Math.exp(value); break;
          case 'rot_0': rw = value; break;
          case 'rot_1': rx = value; break;
          case 'rot_2': ry = value; break;
          case 'rot_3': rz = value; break;
          case 'opacity': opacity = 1 / (1 + Math.exp(-value)); break; // Sigmoid
          case 'f_dc_0': r = 0.5 + 0.28209479177387814 * value; break; // SH0 to RGB approx
          case 'f_dc_1': g = 0.5 + 0.28209479177387814 * value; break;
          case 'f_dc_2': b = 0.5 + 0.28209479177387814 * value; break;
        }
      } else {
        // Skip non-float properties (FR-PLY-130)
        // This is a simplification. Real robustness needs a map of type sizes.
        // For standard splats, most are floats. If uchar, skip 1 byte.
        if (prop.type === 'uchar' || prop.type === 'uint8') byteOffset += 1;
        else if (prop.type === 'int' || prop.type === 'int32') byteOffset += 4;
        else if (prop.type === 'double') byteOffset += 8;
        // fallback generic skip 4 if unknown to avoid infinite loops, though risky
      }
    }

    // Populate buffers
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    scales[i * 3 + 0] = sx;
    scales[i * 3 + 1] = sy;
    scales[i * 3 + 2] = sz;

    rotations[i * 4 + 0] = rw;
    rotations[i * 4 + 1] = rx;
    rotations[i * 4 + 2] = ry;
    rotations[i * 4 + 3] = rz;

    opacities[i] = opacity;

    colors[i * 3 + 0] = Math.max(0, Math.min(1, r));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
  }

  // Skip remaining vertices if we limited the count
  // No need to process them.

  return {
    vertexCount: renderCount,
    positions,
    scales,
    rotations,
    opacities,
    colors
  };
};