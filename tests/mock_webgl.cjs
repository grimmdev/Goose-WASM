/**
 * Shared Headless WebGL2 Mock for Goose-WASM Test Suite
 */

function createMockWebGL(width, height) {
  const canvas = {
    width,
    height,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const gl = {
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    TRIANGLES: 0x0004,
    FLOAT: 0x1406,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    DYNAMIC_DRAW: 0x88e8,
    STATIC_DRAW: 0x88e4,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    DEPTH_TEST: 0x0b71,
    CULL_FACE: 0x0b44,
    BACK: 0x0405,
    LEQUAL: 0x0203,
    drawingBufferWidth: width,
    drawingBufferHeight: height,
    canvas,
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    bufferSubData: () => {},
    deleteBuffer: () => {},
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: (prog, pname) => (pname === 0x8b86 ? 0 : true),
    getProgramInfoLog: () => '',
    getActiveUniform: () => null,
    useProgram: () => {},
    getUniformLocation: () => 1,
    uniform1f: () => {},
    uniform2f: () => {},
    enable: () => {},
    disable: () => {},
    depthFunc: () => {},
    cullFace: () => {},
    viewport: () => {},
    clearColor: () => {},
    clear: () => {},
    drawArrays: () => {},
    drawArraysInstanced: () => {},
    drawElements: () => {},
    drawElementsInstanced: () => {},
    createVertexArray: () => ({}),
    bindVertexArray: () => {},
    createSampler: () => ({}),
    samplerParameteri: () => {},
    deleteSampler: () => {},
    bindSampler: () => {},
    createTexture: () => ({}),
    bindTexture: () => {},
    texImage2D: () => {},
    texParameteri: () => {},
    texSubImage2D: () => {},
    activeTexture: () => {},
    generateMipmap: () => {},
    deleteTexture: () => {},
    scissor: () => {},
    blendEquationSeparate: () => {},
    blendFuncSeparate: () => {},
    bindFramebuffer: () => {},
    createFramebuffer: () => ({}),
    deleteFramebuffer: () => {},
    framebufferTexture2D: () => {},
    checkFramebufferStatus: () => 0x8cd5,
    drawBuffers: () => {},
    readBuffer: () => {},
    readPixels: (x, y, w, h, format, type, dstData, dstOffset) => {
      const offset = dstOffset || 0;
      const count = w * h * 4;
      for (let i = 0; i < count; i++) {
        dstData[offset + i] = (i % 4 === 3 ? 255 : (i % 2 === 0 ? 200 : 50));
      }
    },
    deleteProgram: () => {},
    deleteShader: () => {},
    flush: () => {},
    finish: () => {},
    getExtension: () => null,
    getSupportedExtensions: () => [],
    getParameter: (pname) => (pname === 0x8b4c ? 32 : 0),
  };

  canvas.getContext = () => gl;

  global.__activeCanvas = canvas;

  if (typeof global.document === 'undefined') {
    global.document = {
      querySelector: (sel) => (sel === '#canvas' || sel === 'canvas' ? global.__activeCanvas : null),
      getElementById: (id) => (id === 'canvas' ? global.__activeCanvas : null),
    };
  } else {
    global.document.querySelector = (sel) => (sel === '#canvas' || sel === 'canvas' ? global.__activeCanvas : null);
    global.document.getElementById = (id) => (id === 'canvas' ? global.__activeCanvas : null);
  }

  if (typeof global.WebGLRenderingContext === 'undefined') {
    global.WebGLRenderingContext = function() {};
    global.WebGL2RenderingContext = function() {};
  }

  return { canvas, gl };
}

module.exports = { createMockWebGL };

