export interface NetworkStatus {
  online: boolean;
  latencyMs: number;
}

export interface ProcessResourceInfo {
  name: string;
  pid: number;
  ramMb: number;
  cpuPercent: number;
  status?: string;
}

export interface RamData {
  processRamMb?: number;
  ramMb?: number;
  systemUsedMb?: number;
  systemTotalMb?: number;
  systemCachedMb?: number;
  systemPercent?: number;
  cpuPercent?: number;
  cpuCores?: number;
  cpuModel?: string;
  gpuName?: string;
  gpuPercent?: number;
  vramUsedMb?: number;
  vramTotalMb?: number;
  gdiHandlesCount?: number;
  fontCacheMb?: number;
  topProcesses?: ProcessResourceInfo[];
  [key: string]: unknown;
}

export interface SystemHealthCheck {
  name: string;
  status: "ok" | "warning" | "error" | string;
  message?: string;
}

export interface SystemHealth {
  status: string;
  registryIssues?: number;
  memoryStatus?: string;
  fontServiceStatus?: string;
  checks?: SystemHealthCheck[];
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WindowsFont {
  name: string;
  path?: string;
  file?: string;
  format?: string;
  [key: string]: unknown;
}

export interface AdobeStatus {
  photoshopRunning?: boolean;
  illustratorRunning?: boolean;
  indesignRunning?: boolean;
  bridgeInstalled?: boolean;
  [key: string]: unknown;
}
