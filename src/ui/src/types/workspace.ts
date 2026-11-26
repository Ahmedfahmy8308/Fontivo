import { ColorSwatch } from "./palette";

export interface TypographyFontObject {
  name?: string;
  fontId?: number;
  path?: string;
  family?: string;
  style?: string;
}

export type FontOrObject = string | TypographyFontObject;

export interface WorkspaceTypography {
  headingFont: FontOrObject;
  bodyFont: FontOrObject;
  accentFont?: FontOrObject;
  codeFont?: FontOrObject;
  previewHeading?: string;
  previewBody?: string;
  [key: string]: unknown;
}

export interface WorkspaceTask {
  id: string;
  text: string;
  status: "todo" | "in_progress" | "done";
  createdAt?: string;
}

export interface WorkspaceDesignFile {
  name: string;
  path: string;
  subfolder?: string;
  format: "PSD" | "AI" | "INDD" | "PDF" | "SVG" | string;
  usedFonts: string[];
  missingFonts?: string[];
  allActive?: boolean;
}

export interface WorkspaceFontFile {
  id?: string | number;
  name: string;
  family?: string;
  format?: string;
  path: string;
  isActive?: boolean;
}

export interface WorkspacePaletteFile {
  name: string;
  path: string;
  swatchesCount: number;
  updatedAt?: string;
}

export interface WorkspaceSubfolders {
  fonts: WorkspaceFontFile[];
  designs: WorkspaceDesignFile[];
  palettes: WorkspacePaletteFile[];
  guidelines: string[];
}

export interface Workspace {
  id: string;
  name: string;
  client: string;
  category: string;
  description: string;
  folderPath?: string;
  typography: WorkspaceTypography;
  palette: ColorSwatch[];
  notes?: string;
  tasks?: WorkspaceTask[];
  subfolders?: WorkspaceSubfolders;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}
