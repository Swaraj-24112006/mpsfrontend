/**
 * RM/PM Component Master API service.
 * Maps to backend: GET/POST /api/components/, PATCH/DELETE /api/components/{component_code}/
 */
import api, { PaginatedResponse } from './api';

export interface ComponentDTO {
  id: number;
  component_code: string;
  component_description: string;
  category: 'RM' | 'PM';
  uom: string;
  default_storage_location: string;
  safety_stock: number;
  is_critical: boolean;
  is_common_part: boolean;
  shared_in_fgs_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComponentCreatePayload {
  component_code: string;
  component_description: string;
  category?: 'RM' | 'PM';
  uom?: string;
  default_storage_location?: string;
  safety_stock?: number;
  is_critical?: boolean;
  is_active?: boolean;
}

export interface ComponentUpdatePayload {
  component_description?: string;
  category?: 'RM' | 'PM';
  uom?: string;
  default_storage_location?: string;
  safety_stock?: number;
  is_critical?: boolean;
  is_active?: boolean;
}

export interface ComponentFilters {
  category?: string;
  is_common_part?: string;
  is_active?: string;
  search?: string;
  paginate?: string;
  page?: string;
}

export const componentService = {
  list(filters?: ComponentFilters): Promise<PaginatedResponse<ComponentDTO>> {
    return api.get<PaginatedResponse<ComponentDTO>>('components/', filters as Record<string, string>);
  },

  listAll(): Promise<ComponentDTO[]> {
    return api.get<ComponentDTO[]>('components/', { paginate: 'false' });
  },

  get(componentCode: string): Promise<ComponentDTO> {
    return api.get<ComponentDTO>(`components/${componentCode}/`);
  },

  create(payload: ComponentCreatePayload): Promise<ComponentDTO> {
    return api.post<ComponentDTO>('components/', payload);
  },

  update(componentCode: string, payload: ComponentUpdatePayload): Promise<ComponentDTO> {
    return api.patch<ComponentDTO>(`components/${componentCode}/`, payload);
  },

  delete(componentCode: string): Promise<{ message: string }> {
    return api.del<{ message: string }>(`components/${componentCode}/`);
  },
};

export default componentService;
