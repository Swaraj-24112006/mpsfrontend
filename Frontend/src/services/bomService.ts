/**
 * BOM Master API service.
 * Maps to backend: GET/POST /api/bom/, PATCH/DELETE /api/bom/{id}/
 * Plus: GET /api/bom/exploded/{fg_code}/, GET /api/bom/common-components/
 */
import api, { PaginatedResponse } from './api';

export interface BOMLineDTO {
  id: number;
  fg_code: string;
  fg_description: string;   // read-only, from BOMFGHeader
  component_code: string;
  component_description: string; // read-only, from RMPMComponentMaster
  category: 'RM' | 'PM';       // read-only, from RMPMComponentMaster
  component_role: string;
  qty: number;
  uom: string;
  bom_version: string;
  is_active: boolean;
  lead_time_days_override: number | null;
  created_at: string;
  updated_at: string;
}

export interface BOMLineCreatePayload {
  fg_code: string;          // Must exist in bom_fg_header
  component_code: string;   // Must exist in rm_pm_component_master
  qty: number;
  uom?: string;
  component_role?: string;
  bom_version?: string;
  is_active?: boolean;
  lead_time_days_override?: number | null;
}

export interface BOMLineUpdatePayload {
  fg_code?: string;
  component_code?: string;
  qty?: number;
  uom?: string;
  component_role?: string;
  bom_version?: string;
  is_active?: boolean;
  lead_time_days_override?: number | null;
}

export interface BOMFilters {
  fg_code?: string;
  component_code?: string;
  category?: string;
  is_active?: string;
  search?: string;
  paginate?: string;
  page?: string;
}

export interface ExplodedBOMComponent {
  component_code: string;
  component_description: string;
  category: 'RM' | 'PM';
  uom: string;
  qty: number;
  component_role: string;
  bom_version?: string;
  is_active?: boolean;
  is_common_part: boolean;
  shared_in_fgs_count: number;
  safety_stock?: number;
  is_critical?: boolean;
  current_stock: number;
  stock_covers_units: number;
  vendor_code: string | null;
  vendor_name: string | null;
  buyer_name: string | null;
  lead_time_days: number;
}

export interface ExplodedBOMResponse {
  fg_code: string;
  fg_description: string;
  active_bom_version: string;
  components_count: number;
  components: ExplodedBOMComponent[];
}

export interface CommonComponentDTO {
  component_code: string;
  component_description: string;
  category: 'RM' | 'PM';
  uom: string;
  safety_stock: number;
  is_critical: boolean;
  shared_in_fgs_count: number;
  consuming_fgs: {
    fg_code: string;
    fg_description: string;
    qty: number;
    uom: string;
    bom_version: string;
  }[];
}

// Aliases for convenience
export type ExplodedComponent = ExplodedBOMComponent;
export type CommonComponentItem = CommonComponentDTO;

export const bomService = {
  list(filters?: BOMFilters): Promise<PaginatedResponse<BOMLineDTO>> {
    return api.get<PaginatedResponse<BOMLineDTO>>('bom/', filters as Record<string, string>);
  },

  listAll(filters?: BOMFilters): Promise<BOMLineDTO[]> {
    return api.get<BOMLineDTO[]>('bom/', { ...filters, paginate: 'false' } as Record<string, string>);
  },

  get(id: number): Promise<BOMLineDTO> {
    return api.get<BOMLineDTO>(`bom/${id}/`);
  },

  create(payload: BOMLineCreatePayload): Promise<BOMLineDTO> {
    return api.post<BOMLineDTO>('bom/', payload);
  },

  update(id: number, payload: BOMLineUpdatePayload): Promise<BOMLineDTO> {
    return api.patch<BOMLineDTO>(`bom/${id}/`, payload);
  },

  delete(id: number): Promise<void> {
    return api.del<void>(`bom/${id}/`);
  },

  getExplodedBOM(fgCode: string, bomVersion?: string): Promise<ExplodedBOMResponse> {
    const params: Record<string, string> = {};
    if (bomVersion) params.bom_version = bomVersion;
    return api.get<ExplodedBOMResponse>(`bom/exploded/${fgCode}/`, params);
  },

  async getCommonComponents(): Promise<CommonComponentDTO[]> {
    const res = await api.get<CommonComponentDTO[] | { count: number; results: CommonComponentDTO[] }>('bom/common-components/');
    if (Array.isArray(res)) return res;
    return (res as { results: CommonComponentDTO[] }).results || [];
  },

  uploadCSV(file: File): Promise<BOMUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload<BOMUploadResponse>('bom/upload-csv/', formData);
  },
};

export interface BOMUploadResponse {
  batch_id: number;
  total_rows: number;
  imported_rows: number;
  error_rows: number;
  errors: string[];
  created_fgs_count: number;
  created_components_count: number;
  message: string;
}

export default bomService;
