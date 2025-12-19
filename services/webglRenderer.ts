import { ParsedSplatData } from '../types';

export class SplatRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vertexCount: number = 0;
  private animationId: number | null = null;

  // Camera State
  private target = { x: 0, y: 0, z: 0 };
  private radius = 5;
  private camRot = { x: 0, y: 0 }; // x: Pitch, y: Yaw
  
  // Interaction State
  private isDragging = false;
  private dragButton = -1; // 0: Left (Rotate), 2: Right (Pan)
  private lastMouse = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL 2.0 is not supported in this browser.');
    }
    this.gl = gl;
    this.initInputHandlers();
  }

  // FR-WEBGL-210: Shader Compilation
  private createShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${log}`);
    }
    return shader;
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const program = this.gl.createProgram();
    if (!program) throw new Error('Failed to create program');
    const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program);
      this.gl.deleteProgram(program);
      throw new Error(`Program link error: ${log}`);
    }
    return program;
  }

  public init(data: ParsedSplatData) {
    this.vertexCount = data.vertexCount;

    // Shaders
    // FR-RENDER-320: Visualization Approximation (gl.POINTS, uniform color fallback/attribute, Gaussian alpha)
    const vs = `#version 300 es
      layout(location = 0) in vec3 a_position;
      layout(location = 1) in vec3 a_scale;
      layout(location = 2) in float a_opacity;
      layout(location = 3) in vec3 a_color;

      uniform mat4 u_projection;
      uniform mat4 u_view;
      uniform float u_viewport_height;

      out vec3 v_color;
      out float v_opacity;

      void main() {
        vec4 pos = u_view * vec4(a_position, 1.0);
        gl_Position = u_projection * pos;
        
        // Approximate size based on scale magnitude and distance
        // Using log-scale (stored in exp form in buffer)
        float avgScale = (a_scale.x + a_scale.y + a_scale.z) / 3.0;
        
        // Perspective correct point size:
        // size = world_size * viewport_height / (depth * 2 * tan(fov/2))
        // FOV is 45 deg. tan(22.5) ~ 0.414. 2 * 0.414 = 0.828
        // We use a factor slightly larger to make splats fuller
        gl_PointSize = max(2.0, (avgScale * u_viewport_height * 1.5) / gl_Position.w);
        
        v_color = a_color;
        v_opacity = a_opacity;
      }
    `;

    const fs = `#version 300 es
      precision mediump float;
      in vec3 v_color;
      in float v_opacity;
      out vec4 outColor;

      void main() {
        // FR-RENDER-320: Radial falloff
        vec2 coord = gl_PointCoord - vec2(0.5);
        float distSq = dot(coord, coord);
        if (distSq > 0.25) discard;
        
        // Soft gaussian-like falloff
        float alpha = exp(-distSq * 8.0) * v_opacity;
        outColor = vec4(v_color, alpha);
      }
    `;

    this.program = this.createProgram(vs, fs);

    // FR-WEBGL-220: Buffer Setup
    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);

    // Helper for attributes
    const bindBuffer = (index: number, data: Float32Array, size: number) => {
      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
      this.gl.vertexAttribPointer(index, size, this.gl.FLOAT, false, 0, 0);
      this.gl.enableVertexAttribArray(index);
    };

    bindBuffer(0, data.positions, 3);
    bindBuffer(1, data.scales, 3);
    bindBuffer(2, data.opacities, 1);
    bindBuffer(3, data.colors, 3);

    // FR-WEBGL-240: Blending and Depth
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    // Standard alpha blending
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA); 
    this.gl.disable(this.gl.CULL_FACE);

    this.startLoop();
  }

  private initInputHandlers() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragButton = e.button;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });
    
    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.dragButton = -1;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };

      if (this.dragButton === 0) {
        // Rotate
        this.camRot.x -= dy * 0.005;
        this.camRot.y -= dx * 0.005;
        // Clamp Pitch
        this.camRot.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.camRot.x));
      } else if (this.dragButton === 2) {
        // Pan
        // Calculate basis vectors for the camera
        const cy = Math.cos(this.camRot.y);
        const sy = Math.sin(this.camRot.y);
        const cp = Math.cos(this.camRot.x);
        const sp = Math.sin(this.camRot.x);

        // Forward vector (from target to camera)
        // Note: Camera is at Target + SphericalOffset
        // Normalized direction vectors:
        const fwd = [cy * cp, sp, sy * cp]; // Not strictly fwd, this is position unit vector.
        
        // We need Camera Right and Camera Up
        // Standard LookAt formulation:
        // eye = [radius * cy * cp, radius * sp, radius * sy * cp] (if y is up? No, usually y is up in world)
        
        // Re-deriving proper basis from ViewMatrix logic:
        // Eye position relative to target:
        // X = radius * sin(yaw) * cos(pitch)
        // Y = radius * sin(pitch)
        // Z = radius * cos(yaw) * cos(pitch)
        // But our getViewMatrix uses:
        // cx = cy * cp * z
        // cy_pos = sp * z
        // cz = sy * cp * z
        
        // Right vector is cross(Y-axis, Fwd). 
        // Simple approximation for panning:
        // Move target along the screen plane.
        const panSpeed = this.radius * 0.0015;
        
        // Right Vector (approx based on yaw)
        const rx = Math.cos(this.camRot.y);
        const rz = -Math.sin(this.camRot.y);
        
        // Up Vector (approx based on pitch and yaw)
        // But actually, we can just grab them from the View Matrix if we wanted, 
        // but calculating locally is faster/easier.
        
        // Let's use the view matrix rows (since it's orthonormal)
        // ViewMatrix = [ R, U, F, T ]
        // We want to move Target in -R * dx + U * dy direction (screen space mapping)
        
        // Let's compute the basis vectors used in getViewMatrix to be consistent
        const z = this.radius;
        const cx = cy * cp * z;
        const cy_pos = sp * z;
        const cz = sy * cp * z;
        const eye = [cx, cy_pos, cz];
        const up = [0, 1, 0];
        const fwdVec = [-eye[0], -eye[1], -eye[2]]; // looking at 0,0,0 relative
        const len = Math.sqrt(fwdVec[0]**2 + fwdVec[1]**2 + fwdVec[2]**2);
        const f = [fwdVec[0]/len, fwdVec[1]/len, fwdVec[2]/len];
        
        // Right
        const r = [
            up[1]*f[2] - up[2]*f[1],
            up[2]*f[0] - up[0]*f[2],
            up[0]*f[1] - up[1]*f[0]
        ];
        const rLen = Math.sqrt(r[0]**2 + r[1]**2 + r[2]**2);
        const right = [r[0]/rLen, r[1]/rLen, r[2]/rLen];
        
        // Real Up
        const u = [
            f[1]*right[2] - f[2]*right[1],
            f[2]*right[0] - f[0]*right[2],
            f[0]*right[1] - f[1]*right[0]
        ];
        
        this.target.x -= (right[0] * dx - u[0] * dy) * panSpeed;
        this.target.y -= (right[1] * dx - u[1] * dy) * panSpeed;
        this.target.z -= (right[2] * dx - u[2] * dy) * panSpeed;
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomScale = 0.1;
      this.radius += e.deltaY * 0.01 * (this.radius * zoomScale);
      this.radius = Math.max(0.1, this.radius);
    });
    
    // Disable context menu for right-click panning
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    });
  }

  // FR-RENDER-340: Resize Handling
  public resize() {
    const displayWidth = this.canvas.clientWidth;
    const displayHeight = this.canvas.clientHeight;

    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // FR-RENDER-300: Camera Setup (Matrices)
  private getProjectionMatrix(): Float32Array {
    const fieldOfView = 45 * Math.PI / 180;
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    const zNear = 0.1;
    const zFar = 1000.0;
    
    const f = 1.0 / Math.tan(fieldOfView / 2);
    const rangeInv = 1 / (zNear - zFar);
 
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (zNear + zFar) * rangeInv, -1,
      0, 0, zNear * zFar * rangeInv * 2, 0
    ]);
  }

  private getViewMatrix(): Float32Array {
    // Basic orbit rotation logic
    const cy = Math.cos(this.camRot.y);
    const sy = Math.sin(this.camRot.y);
    const cp = Math.cos(this.camRot.x);
    const sp = Math.sin(this.camRot.x);

    // Camera position relative to target
    const z = this.radius;
    const cx = cy * cp * z;
    const cy_pos = sp * z;
    const cz = sy * cp * z;

    const eye = [this.target.x + cx, this.target.y + cy_pos, this.target.z + cz];
    const center = [this.target.x, this.target.y, this.target.z];
    const up = [0, 1, 0];

    // LookAt Matrix Construction
    const z0 = eye[0] - center[0];
    const z1 = eye[1] - center[1];
    const z2 = eye[2] - center[2];
    let len = Math.sqrt(z0*z0 + z1*z1 + z2*z2);
    if (len === 0) len = 1;
    const fwd = [z0/len, z1/len, z2/len];

    const x0 = up[1]*fwd[2] - up[2]*fwd[1];
    const x1 = up[2]*fwd[0] - up[0]*fwd[2];
    const x2 = up[0]*fwd[1] - up[1]*fwd[0];
    len = Math.sqrt(x0*x0 + x1*x1 + x2*x2);
    if (len === 0) len = 1;
    const right = [x0/len, x1/len, x2/len];

    const y0 = fwd[1]*right[2] - fwd[2]*right[1];
    const y1 = fwd[2]*right[0] - fwd[0]*right[2];
    const y2 = fwd[0]*right[1] - fwd[1]*right[0];
    const newUp = [y0, y1, y2];

    return new Float32Array([
      right[0], newUp[0], fwd[0], 0,
      right[1], newUp[1], fwd[1], 0,
      right[2], newUp[2], fwd[2], 0,
      -(right[0]*eye[0] + right[1]*eye[1] + right[2]*eye[2]),
      -(newUp[0]*eye[0] + newUp[1]*eye[1] + newUp[2]*eye[2]),
      -(fwd[0]*eye[0] + fwd[1]*eye[1] + fwd[2]*eye[2]),
      1
    ]);
  }

  // FR-RENDER-330: Animation Loop
  private startLoop() {
    const loop = () => {
      this.resize();
      
      this.gl.clearColor(0.05, 0.05, 0.05, 1.0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

      if (this.program && this.vao) {
        this.gl.useProgram(this.program);
        
        const uProj = this.gl.getUniformLocation(this.program, 'u_projection');
        const uView = this.gl.getUniformLocation(this.program, 'u_view');
        const uViewportHeight = this.gl.getUniformLocation(this.program, 'u_viewport_height');

        this.gl.uniformMatrix4fv(uProj, false, this.getProjectionMatrix());
        this.gl.uniformMatrix4fv(uView, false, this.getViewMatrix());
        this.gl.uniform1f(uViewportHeight, this.canvas.height);

        this.gl.bindVertexArray(this.vao);
        this.gl.drawArrays(this.gl.POINTS, 0, this.vertexCount);
      }

      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }

  public cleanup() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    // Remove listeners to prevent memory leaks if needed, though they are on canvas/window
  }
}