/**
 * Vendor-Buyer Master API service.
 * Maps to backend: GET/POST /api/vendor-buyers/, PATCH/DELETE /api/vendor-buyers/{id}/
 */
import api, { PaginatedResponse } from './api';

export interface VendorBuyerDTO {
  id: number;
  vendor_code: string;
  vendor_name: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  category: 'RM' | 'PM';
  lead_time_days: number;
  city: string;
  gst_no: string;
  is_active: boolean;
  supplied_components: string[];  // list of component_code strings
  created_at: string;
  updated_at: string;
}

export interface VendorBuyerCreatePayload {
  vendor_code: string;
  vendor_name: string;
  buyer_name: string;
  buyer_email?: string;
  buyer_phone?: string;
  category?: 'RM' | 'PM';
  lead_time_days: number;
  city?: string;
  gst_no?: string;
  is_active?: boolean;
  supplied_components: string[];
}

export interface VendorBuyerUpdatePayload {
  vendor_name?: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  category?: 'RM' | 'PM';
  lead_time_days?: number;
  city?: string;
  gst_no?: string;
  is_active?: boolean;
  supplied_components?: string[];
}

export interface VendorBuyerFilters {
  buyer_name?: string;
  category?: string;
  vendor_code?: string;
  is_active?: string;
  search?: string;
  paginate?: string;
  page?: string;
}

export const vendorBuyerService = {
  list(filters?: VendorBuyerFilters): Promise<PaginatedResponse<VendorBuyerDTO>> {
    return api.get<PaginatedResponse<VendorBuyerDTO>>('vendor-buyers/', filters as Record<string, string>);
  },

  listAll(): Promise<VendorBuyerDTO[]> {
    return api.get<VendorBuyerDTO[]>('vendor-buyers/', { paginate: 'false' });
  },

  get(id: number): Promise<VendorBuyerDTO> {
    return api.get<VendorBuyerDTO>(`vendor-buyers/${id}/`);
  },

  create(payload: VendorBuyerCreatePayload): Promise<VendorBuyerDTO> {
    return api.post<VendorBuyerDTO>('vendor-buyers/', payload);
  },

  update(id: number, payload: VendorBuyerUpdatePayload): Promise<VendorBuyerDTO> {
    return api.patch<VendorBuyerDTO>(`vendor-buyers/${id}/`, payload);
  },

  delete(id: number): Promise<{ message: string }> {
    return api.del<{ message: string }>(`vendor-buyers/${id}/`);
  },

  uploadCSV(file: File): Promise<VendorBuyerUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload<VendorBuyerUploadResponse>('vendor-buyers/upload-csv/', formData);
  },
};

export interface VendorBuyerUploadResponse {
  batch_id: number;
  total_rows: number;
  imported_rows: number;
  error_rows: number;
  errors: string[];
  message: string;
}

export default vendorBuyerService;
