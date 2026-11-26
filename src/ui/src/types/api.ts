export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  [key: string]: unknown;
}

export interface PaginatedResponse<T = unknown> {
  total: number;
  offset?: number;
  limit?: number;
  items?: T[];
  fonts?: T[];
  families?: T[];
  [key: string]: unknown;
}

export interface CollectionsResponse {
  collections: Record<string, string[]>;
  [key: string]: unknown;
}

export interface BatchActivationPayload {
  family?: string;
  ids?: (string | number)[];
  [key: string]: unknown;
}
