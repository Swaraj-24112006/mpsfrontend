/**
 * FG Header API service.
 * Maps to backend endpoints: GET/POST /api/bom/fg-headers/, PATCH/DELETE /api/bom/fg-headers/{fg_code}/
 */
import api, { PaginatedResponse } from './api';

export interface FGHeaderDTO {
  id: number;
  fg_code: string;
  fg_description: string;
  mini_factory: string;
  line: string;
  customer_segment: string;
  unit_price_inr: number;
  active_bom_version: string;
  uom: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FGHeaderCreatePayload {
  fg_code: string;
  fg_description: string;
  mini_factory?: string;
  line?: string;
  customer_segment?: string;
  unit_price_inr?: number;
  active_bom_version?: string;
  uom?: string;
  is_active?: boolean;
}

export interface FGHeaderUpdatePayload {
  fg_description?: string;
  mini_factory?: string;
  line?: string;
  customer_segment?: string;
  unit_price_inr?: number;
  active_bom_version?: string;
  uom?: string;
  is_active?: boolean;
}

export interface FGHeaderUpdateResponse extends FGHeaderDTO {
  warning?: string;
}

export interface FGHeaderFilters {
  is_active?: string;
  mini_factory?: string;
  line?: string;
  search?: string;
  paginate?: string;
  page?: string;
}

export const fgHeaderService = {
  list(filters?: FGHeaderFilters): Promise<PaginatedResponse<FGHeaderDTO>> {
    return api.get<PaginatedResponse<FGHeaderDTO>>('bom/fg-headers/', filters as Record<string, string>);
  },

  listAll(): Promise<FGHeaderDTO[]> {
    return api.get<FGHeaderDTO[]>('bom/fg-headers/', { paginate: 'false' });
  },

  get(fgCode: string): Promise<FGHeaderDTO> {
    return api.get<FGHeaderDTO>(`bom/fg-headers/${fgCode}/`);
  },

  create(payload: FGHeaderCreatePayload): Promise<FGHeaderDTO> {
    return api.post<FGHeaderDTO>('bom/fg-headers/', payload);
  },

  update(fgCode: string, payload: FGHeaderUpdatePayload): Promise<FGHeaderUpdateResponse> {
    return api.patch<FGHeaderUpdateResponse>(`bom/fg-headers/${fgCode}/`, payload);
  },

  delete(fgCode: string): Promise<{ message: string }> {
    return api.del<{ message: string }>(`bom/fg-headers/${fgCode}/`);
  },
};

export default fgHeaderService;
