export interface ApiError {
  code: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  message: string;
  timestamp: string;
  requestId: string;
}
