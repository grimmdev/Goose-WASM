/**
 * Goose to WebGL Fragment Shader Compiler
 *
 * Compiles user Goose source code into a high-performance WebGL fragment shader
 * so that any edits to shapes (sd_sphere, sd_torus, sd_box), scene composition (map_scene),
 * colors, lighting, and animations immediately render live in the Viewport at up to 120 FPS.
 */

export interface ShaderCompilationResult {
  success: boolean;
  vertexShader?: string;
  fragmentShader: string;
  sourceType?: "separate_file" | "embedded" | "raymarching" | "raw" | "template";
  error?: string;
}

/**
 * Normalizes GLSL 450 (cute_spirv dialect used by Goose) to WebGL 1.0/2.0 compatible GLSL ES.
 */
function normalizeGLSL(src: string, isVertex: boolean): string {
  let s = src.trim();

  // Strip layout from uniform blocks (e.g. layout(set = 1, binding = 0) uniform Transform { ... };)
  s = s.replace(/(?:layout\s*\([^)]*\)\s*)?uniform\s+[a-zA-Z0-9_]+\s*\{([^}]*)\};/g, (_m, body) => {
    return body
      .split(";")
      .map((line: string) => {
        const trimmed = line.trim();
        return trimmed.length > 0 ? `uniform ${trimmed};` : "";
      })
      .filter(Boolean)
      .join("\n");
  });

  if (isVertex) {
    // Vertex shader inputs: layout(location = N) in -> attribute
    s = s.replace(/(?:layout\s*\([^)]*\)\s*)?\bin\s+/g, "attribute ");
    // Vertex shader outputs: layout(location = N) out -> varying
    s = s.replace(/(?:layout\s*\([^)]*\)\s*)?\bout\s+/g, "varying ");
  } else {
    // Fragment shader inputs: layout(location = N) in -> varying
    s = s.replace(/(?:layout\s*\([^)]*\)\s*)?\bin\s+/g, "varying ");
    // Fragment shader outputs: layout(location = 0) out vec4 result; -> #define result gl_FragColor
    s = s.replace(/(?:layout\s*\([^)]*\)\s*)?\bout\s+vec4\s+([a-zA-Z0-9_]+)\s*;/g, (_m, name) => `#define ${name} gl_FragColor`);
  }

  // Preserve #version as first line if present
  const versionMatch = s.match(/^\s*(#version[^\n]*\n?)/);
  if (versionMatch) {
    const versionLine = versionMatch[1];
    s = s.slice(versionMatch[0].length);
    if (!s.includes("precision")) {
      s = `${versionLine}precision highp float;\n${s}`;
    } else {
      s = `${versionLine}${s}`;
    }
  } else if (!s.includes("precision")) {
    s = "precision highp float;\n" + s;
  }
  return s;
}

interface ParsedFn {
  name: string;
  params: string;
  returnType: string;
  body: string;
}

/**
 * Extracts all functions from Goose source code using balanced brace parsing
 */
function extractAllFunctions(source: string): ParsedFn[] {
  const fns: ParsedFn[] = [];
  const regex = /fn\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?:->\s*([^{]+))?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const name = match[1];
    const params = match[2];
    const returnType = (match[3] || "").trim();
    const braceOpen = match.index + match[0].length - 1;

    let depth = 1;
    let i = braceOpen + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }

    if (depth === 0) {
      const body = source.slice(braceOpen + 1, i - 1);
      fns.push({ name, params, returnType, body });
      regex.lastIndex = i;
    }
  }

  return fns;
}

/**
 * Translates a Goose expression or code block into valid GLSL code
 */
function translateGooseBody(body: string, isMapScene: boolean = false): string {
  let res = body;

  // Strip comments
  res = res.replace(/\/\/.*$/gm, "");

  // Resolve struct literals inside-out: float3 { ... }, float2 { ... }
  // We repeat until all nested instances are transformed to vec3 / vec2
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 15) {
    changed = false;
    iterations++;

    const newRes = res
      .replace(/float3\s*\{\s*([^{}]+?)\s*,\s*([^{}]+?)\s*,\s*([^{}]+?)\s*\}/g, "vec3($1, $2, $3)")
      .replace(/float2\s*\{\s*([^{}]+?)\s*,\s*([^{}]+?)\s*\}/g, "vec2($1, $2)")
      .replace(/float4\s*\{\s*([^{}]+?)\s*,\s*([^{}]+?)\s*,\s*([^{}]+?)\s*,\s*([^{}]+?)\s*\}/g, "vec4($1, $2, $3, $4)");

    if (newRes !== res) {
      res = newRes;
      changed = true;
    }
  }

  // Constants and types
  res = res.replace(/\bfloat3_0\b/g, "vec3(0.0)");
  res = res.replace(/\bfloat2_0\b/g, "vec2(0.0)");
  res = res.replace(/\b0\.0\s*-\s*/g, "-");
  res = res.replace(/\b0\s*-\s*/g, "-");
  res = res.replace(/\bas\s+(?:f32|i64|u8|f64|i32|usize)\b/g, "");

  // Return translation
  if (isMapScene) {
    if (/return\s*\[/.test(res)) {
      res = res.replace(/return\s*\[\s*([^,;]+)\s*,\s*([^;\]]+)\s*\]\s*;/g, "return vec2($1, float($2));");
    } else if (/return\s+[^,;]+\s*,\s*[^;]+;/.test(res)) {
      res = res.replace(/return\s+([^,;]+)\s*,\s*([^;]+);/g, "return vec2($1, float($2));");
    } else {
      res = res.replace(/return\s+([^;,]+);/g, (_m, val) => {
        const trimmed = val.trim();
        if (trimmed.startsWith("vec2")) return `return ${trimmed};`;
        return `return vec2(${trimmed}, 0.0);`;
      });
    }
  }

  // If condition parentheses: if cond { -> if (cond) {
  res = res.replace(/if\s+(?!\()([^{]+?)\s*\{/g, "if ($1) {");

  // Variable declarations: let / var
  res = res.replace(
    /(?:let|var)\s+([a-zA-Z0-9_]+)(?:\s*:\s*[a-zA-Z0-9_]+)?\s*=\s*([^;]+);/g,
    (_m, varName, rawExpr) => {
      const expr = rawExpr.trim();
      let glslType = "float";

      if (
        expr.startsWith("vec3") ||
        expr.startsWith("rotate_") ||
        expr.startsWith("reflect_") ||
        expr.startsWith("normalize") ||
        expr.startsWith("cross") ||
        expr.includes("p -") ||
        expr.includes("p +") ||
        varName === "hp" ||
        varName === "rd" ||
        varName === "cam_pos" ||
        varName === "light_dir"
      ) {
        glslType = "vec3";
      } else if (expr.startsWith("vec2") || varName === "uv" || varName === "q") {
        glslType = "vec2";
      } else if (
        varName === "mat" ||
        varName === "hit_mat" ||
        /^-?\d+$/.test(expr)
      ) {
        glslType = "int";
      } else if (expr.startsWith("vec4")) {
        glslType = "vec4";
      }

      return `${glslType} ${varName} = ${expr};`;
    }
  );

  return res;
}

export function compileGooseToShader(
  source: string,
  separateShaderSource?: string
): ShaderCompilationResult {
  try {
    // Separate Shader File provided (e.g. shader.frag or pipeline.glsl in project)
    if (separateShaderSource && separateShaderSource.trim().length > 0) {
      let frag = separateShaderSource.trim();
      if (!frag.includes("precision")) {
        frag = "precision highp float;\n" + frag;
      }
      return {
        success: true,
        fragmentShader: frag,
        sourceType: "separate_file",
      };
    }

    // Strip comments to prevent extracting commented-out shaders
    const cleanSource = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

    // Extract Vertex Shader if embedded in Goose source (embed_shader("vert", ...))
    let vertexShader: string | undefined = undefined;
    const vsMatch = cleanSource.match(/embed_shader\s*\(\s*["'](?:vert|vertex)["']\s*,\s*(?:[a-zA-Z0-9_]+\s*,\s*)?(?:"""([\s\S]*?)"""|"([^"]*)"|'([^']*)')\s*\)/);
    if (vsMatch) {
      const rawVs = (vsMatch[1] || vsMatch[2] || vsMatch[3] || "").trim();
      if (rawVs.length > 0) {
        vertexShader = normalizeGLSL(rawVs, true);
      }
    }

    // Embedded Fragment Shader in Goose source code (embed_shader("frag", ...))
    const embedMatch = cleanSource.match(/embed_shader\s*\(\s*["'](?:frag|fragment)["']\s*,\s*(?:[a-zA-Z0-9_]+\s*,\s*)?(?:"""([\s\S]*?)"""|"([^"]*)"|'([^']*)')\s*\)/);
    if (embedMatch) {
      const rawFs = (embedMatch[1] || embedMatch[2] || embedMatch[3] || "").trim();
      if (rawFs.length > 0) {
        const frag = normalizeGLSL(rawFs, false);
        return {
          success: true,
          vertexShader,
          fragmentShader: frag,
          sourceType: "embedded",
        };
      }
    }

    // Also support @shader:frag block comment in Goose files
    const commentShaderMatch = source.match(/\/\/\s*@shader:frag\s*([\s\S]*?)(?:\/\/\s*@end|\n\s*(?:let|var|fn|struct)\b|$)/);
    if (commentShaderMatch && commentShaderMatch[1].trim().length > 0) {
      let frag = commentShaderMatch[1].trim();
      if (!frag.includes("precision")) {
        frag = "precision highp float;\n" + frag;
      }
      return {
        success: true,
        fragmentShader: frag,
        sourceType: "embedded",
      };
    }

    // Also support multi-line shader string: let shader = """ ... """
    const stringShaderMatch = cleanSource.match(/(?:let|var)\s+[a-zA-Z0-9_]*shader[a-zA-Z0-9_]*\s*=\s*"""([\s\S]*?)"""/i);
    if (stringShaderMatch && stringShaderMatch[1].trim().length > 0) {
      const frag = normalizeGLSL(stringShaderMatch[1].trim(), false);
      return {
        success: true,
        vertexShader,
        fragmentShader: frag,
        sourceType: "embedded",
      };
    }

    // Raw GLSL Fragment Shader directly in active editor
    if (
      source.includes("void main()") ||
      source.includes("void mainImage(") ||
      source.startsWith("#version") ||
      source.startsWith("precision")
    ) {
      let frag = source.trim();
      if (!frag.includes("precision")) {
        frag = "precision highp float;\n" + frag;
      }
      return {
        success: true,
        fragmentShader: frag,
        sourceType: "raw",
      };
    }

    const fns = extractAllFunctions(source);
    const mapSceneFn = fns.find((f) => f.name === "map_scene");

    if (!mapSceneFn) {
      return {
        success: false,
        fragmentShader: "",
        error: "No shader found. Define embed_shader(\"frag\", \"\"\"...\"\"\"), provide a .frag file, or declare map_scene(p, time).",
      };
    }

    // Translate user's map_scene function
    const translatedMapScene = translateGooseBody(mapSceneFn.body, true);

    // Extract any user custom helper functions (e.g., custom SDFs)
    const customHelpers: string[] = [];
    for (const fn of fns) {
      if (
        fn.name === "map_scene" ||
        fn.name === "main" ||
        fn.name === "init_fb" ||
        fn.name === "get_fb" ||
        fn.name === "render_frame" ||
        fn.name === "calc_normal" ||
        fn.name === "sd_sphere" ||
        fn.name === "sd_torus" ||
        fn.name === "sd_box" ||
        fn.name === "reflect_vec" ||
        fn.name === "rotate_x" ||
        fn.name === "rotate_y" ||
        fn.name === "rotate_z"
      ) {
        continue;
      }

      let retType = "float";
      if (fn.returnType.includes("float3")) retType = "vec3";
      else if (fn.returnType.includes("float2")) retType = "vec2";
      else if (fn.returnType.includes("float4")) retType = "vec4";

      const params = fn.params
        .split(",")
        .filter((p) => p.trim().length > 0)
        .map((p) => {
          const parts = p.split(":").map((s) => s.trim());
          const name = parts[0];
          const type = parts[1] || "";
          let glslType = "float";
          if (type.includes("float3")) glslType = "vec3";
          else if (type.includes("float2")) glslType = "vec2";
          else if (type.includes("float4")) glslType = "vec4";
          return `${glslType} ${name}`;
        })
        .join(", ");

      const body = translateGooseBody(fn.body, false);
      customHelpers.push(`${retType} ${fn.name}(${params}) {\n${body}\n}`);
    }

    // Material & lighting extraction
    let materialShading = `
      if (hit_mat == 0) {
        float fx = floor((hp.x + 100.0) * 1.5);
        float fz = floor((hp.z + 100.0) * 1.5);
        bool is_check = mod(fx + fz, 2.0) == 0.0;
        col = is_check ? vec3(0.3 * diff + 0.1, 0.5 * diff + 0.15, 0.7 * diff + 0.2) : vec3(0.1 * diff + 0.05, 0.12 * diff + 0.05, 0.18 * diff + 0.08);
      } else if (hit_mat == 1) {
        col = vec3(0.95 * diff + 0.4 * spec + 0.2, 0.75 * diff + 0.4 * spec + 0.15, 0.25 * diff + 0.4 * spec + 0.05);
      } else {
        col = vec3(0.2 * diff + 0.6 * spec + 0.1, 0.85 * diff + 0.6 * spec + 0.2, 0.95 * diff + 0.6 * spec + 0.3);
      }
    `;

    // Detect user custom colors
    const mat1Match = source.match(/hit_mat\s*==\s*1\s*\{[\s\S]*?r\s*=\s*([^;]+);[\s\S]*?g\s*=\s*([^;]+);[\s\S]*?b\s*=\s*([^;]+);/);
    if (mat1Match) {
      const r = mat1Match[1].replace(/0\.0\s*-\s*/g, "-").replace(/\bas\s+f32\b/g, "");
      const g = mat1Match[2].replace(/0\.0\s*-\s*/g, "-").replace(/\bas\s+f32\b/g, "");
      const b = mat1Match[3].replace(/0\.0\s*-\s*/g, "-").replace(/\bas\s+f32\b/g, "");
      materialShading = `
        if (hit_mat == 0) {
          float fx = floor((hp.x + 100.0) * 1.5);
          float fz = floor((hp.z + 100.0) * 1.5);
          bool is_check = mod(fx + fz, 2.0) == 0.0;
          col = is_check ? vec3(0.3 * diff + 0.1, 0.5 * diff + 0.15, 0.7 * diff + 0.2) : vec3(0.1 * diff + 0.05, 0.12 * diff + 0.05, 0.18 * diff + 0.08);
        } else if (hit_mat == 1) {
          col = vec3(${r}, ${g}, ${b});
        } else {
          col = vec3(0.2 * diff + 0.6 * spec + 0.1, 0.85 * diff + 0.6 * spec + 0.2, 0.95 * diff + 0.6 * spec + 0.3);
        }
      `;
    }

    const fragmentShader = `precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_cam_rot;
uniform vec3 u_cam_pos;

// Standard Signed Distance Field (SDF) Primitives
float sd_sphere(vec3 p, float r) {
    return length(p) - r;
}

float sd_torus(vec3 p, float r1, float r2) {
    vec2 q = vec2(length(p.xz) - r1, p.y);
    return length(q) - r2;
}

float sd_box(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// 3D Rotations
vec3 rotate_x(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

vec3 rotate_y(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 rotate_z(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

${customHelpers.join("\n\n")}

// User Map Scene
vec2 map_scene(vec3 p, float time) {
${translatedMapScene}
}

vec3 calc_normal(vec3 p, float time) {
    float eps = 0.005;
    vec2 d = map_scene(p, time);
    vec2 dx = map_scene(p + vec3(eps, 0.0, 0.0), time);
    vec2 dy = map_scene(p + vec3(0.0, eps, 0.0), time);
    vec2 dz = map_scene(p + vec3(0.0, 0.0, eps), time);
    return normalize(vec3(dx.x - d.x, dy.x - d.x, dz.x - d.x));
}

void main() {
    vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
    uv.x *= u_resolution.x / u_resolution.y;
    
    vec3 light_dir = normalize(vec3(0.6, 1.2, -0.8));
    vec3 cam_pos = u_cam_pos;
    
    vec3 rd = normalize(vec3(uv * 0.7, 1.0));
    // Orbit camera controls
    float pitch = u_cam_rot.y;
    float yaw = u_cam_rot.x;
    float cp = cos(pitch), sp = sin(pitch);
    rd = vec3(rd.x, cp * rd.y - sp * rd.z, sp * rd.y + cp * rd.z);
    float cy = cos(yaw), sy = sin(yaw);
    rd = vec3(cy * rd.x + sy * rd.z, rd.y, -sy * rd.x + cy * rd.z);
    
    float t = 0.1;
    int hit_mat = -1;
    vec3 hp = vec3(0.0);
    
    for (int step = 0; step < 40; step++) {
        vec3 p = cam_pos + rd * t;
        vec2 res = map_scene(p, u_time);
        float d = res.x;
        int mat = int(res.y);
        if (d < 0.02) {
            hit_mat = mat;
            hp = p;
            break;
        }
        t += d;
        if (t > 15.0) break;
    }
    
    vec3 col = vec3(0.06, 0.08, 0.12);
    if (hit_mat >= 0) {
        vec3 n = calc_normal(hp, u_time);
        float diff = max(dot(n, light_dir), 0.0);
        vec3 ref = reflect(rd, n);
        float spec = pow(max(dot(ref, light_dir), 0.0), 12.0);
        
        ${materialShading}
        
        float fog = min(t / 12.0, 1.0);
        col = mix(col, vec3(0.06, 0.08, 0.12), fog);
    }
    
    gl_FragColor = vec4(col, 1.0);
}
`;

    return { success: true, fragmentShader };
  } catch (err: any) {
    return {
      success: false,
      fragmentShader: "",
      error: err.message || String(err),
    };
  }
}
