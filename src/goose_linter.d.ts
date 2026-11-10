export interface GooseDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  line: number;
  col: number;
  endLine?: number;
  endCol?: number;
  text?: string;
}

export type DiagnosticItem = GooseDiagnostic;

export interface GooseFSStats {
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  uid: number;
  gid: number;
  rdev: number;
  size: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  timestamp?: number;
}

export interface GooseFS {
  writeFile(path: string, data: string | Uint8Array, opts?: { encoding?: string; flags?: string }): void;
  readFile(path: string, opts?: { encoding?: "utf8" | "binary"; flags?: string }): string | Uint8Array;
  unlink(path: string): void;
  mkdir(path: string, mode?: number): void;
  rmdir(path: string): void;
  stat(path: string, dontFollow?: boolean): GooseFSStats;
  analyzePath(path: string): { isRoot: boolean; exists: boolean; error: number; name: string; path: string; object: any };
  [key: string]: any;
}

export interface GooseModule {
  callMain(args: string[]): number;
  print: (text: string) => void;
  printErr: (text: string) => void;
  FS: GooseFS;
  [key: string]: any;
}

export interface GooseModuleOptions {
  noInitialRun?: boolean;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  locateFile?: (url: string, scriptDirectory: string) => string;
  [key: string]: any;
}

export default function createGooseLinter(options?: GooseModuleOptions): Promise<GooseModule>;
