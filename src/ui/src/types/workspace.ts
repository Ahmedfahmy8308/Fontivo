import { ColorSwatch } from "./palette";

export interface TypographyFontObject {
  name?: string;
  fontId?: number;
  path?: string;
  family?: string;
  style?: string;
}

export interface WorkspaceCustomFont extends TypographyFontObject {
  id?: string;
  label: string;
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

export type WorkspaceTaskPriority = "high" | "medium" | "low";

export interface WorkspaceTask {
  id: string;
  text: string;
  status: "todo" | "in_progress" | "done";
  createdAt?: string | number;
  dueDate?: string;
  priority?: WorkspaceTaskPriority | string;
  category?: string;
  notes?: string;
  checklist?: string[];
}

export interface WorkspaceDesignFile {
  name: string;
  path: string;
  relativePath?: string;
  subfolder?: string;
  format:
    | "PSD"
    | "AI"
    | "INDD"
    | "PDF"
    | "SVG"
    | "PNG"
    | "JPG"
    | "WEBP"
    | string;
  size?: number;
  usedFonts: string[];
  missingFonts?: string[];
  allActive?: boolean;
  previewUrl?: string;
}

export interface WorkspaceFontFile {
  id?: string | number;
  name: string;
  family?: string;
  style?: string;
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
  client?: string;
  category: string;
  business?: string;
  campaignName?: string;
  deadline?: string;
  brandTagline?: string;
  targetAudience?: string;
  logoDataUrl?: string;
  logoPath?: string;
  description?: string;
  folderPath?: string;
  folders?: string[];
  pinnedAssets?: string[];
  typography: WorkspaceTypography;
  customFonts?: WorkspaceCustomFont[];
  projectFonts?: TypographyFontObject[];
  palette: ColorSwatch[];
  notes?: string;
  tasks?: WorkspaceTask[];
  subfolders?: WorkspaceSubfolders;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string | number;
  [key: string]: unknown;
}
