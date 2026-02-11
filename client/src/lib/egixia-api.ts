/**
 * Egixia API Service
 * Comunicación con la API de Egixia para verificación y sincronización de OC
 * 
 * Endpoints:
 * - POST /apimanager/access/gettoken → Login
 * - GET  /apimanager/purchase_order_v1/list → Verificar existencia de OC
 * - POST /apimanager/purchase_order_v1/synchronize_purchase_order → Sincronizar OC
 * - POST /ApiManager/suppliers_v3/supplier_exists → Verificar existencia de proveedores
 */

export interface LoginRequest {
  UserName: string;
  Password: string;
  ClientId: string;
  ClientSecret: string;
}

export interface LoginResponse {
  AccessToken: string;
  Message: string;
}

export interface OCListResponse {
  SDTOrdenesCompra: Array<{
    buyer_external_code: string;
    buyer_name: string;
    provider_external_code: string;
    provider_name: string;
    purchase_order_number: string;
  }>;
  message: string;
}

export interface SyncRequest {
  buyer_external_code: string;
  purchase_order_number: string;
  send_emails: boolean;
}

export interface SyncResponse {
  SDTSeguimineto: {
    EjecucionInicio: string;
    EjecucionFin: string;
    TiempoEjecucionSegundos: string;
    TotalOCs: string;
    Creadas: string;
    Actualizadas: string;
    SinProveedor: string;
    ConErrorData: string;
    ProveedorNoExiste: string;
    CompradorNoExiste: string;
    EjecucionWsInicio: string;
    EjecucionWsFin: string;
    TiempoEjecucionWsSegundos: string;
    AnuladasNoRegistradas: string;
  };
  message: string;
}

export interface ProviderCheckRequest {
  Provider: Array<{
    provider_external_code_1: string;
    provider_external_code_2: string;
    ProveedorCodigoExterno3: string;
  }>;
}

export interface ProviderCheckResponse {
  outlist_provider: Array<{
    provider_id: string;
    provider_external_code_1: string;
    provider_external_code_2: string;
    provider_external_code_3: string;
    provider_exists: boolean;
  }>;
  Message: string;
}

class EgixiaAPI {
  private baseUrl: string = "";
  private token: string = "";

  configure(baseUrl: string, token: string) {
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(options.headers as Record<string, string> || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API Error ${response.status}: ${text || response.statusText}`);
    }

    return response.json();
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    return this.request<LoginResponse>("/apimanager/access/gettoken", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  }

  async checkOC(buyer_external_code: string, purchase_order_number: string): Promise<OCListResponse> {
    const params = new URLSearchParams({
      buyer_external_code,
      purchase_order_number,
    });
    return this.request<OCListResponse>(`/apimanager/purchase_order_v1/list?${params}`);
  }

  async syncOC(data: SyncRequest): Promise<SyncResponse> {
    return this.request<SyncResponse>("/apimanager/purchase_order_v1/synchronize_purchase_order", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async checkProviders(providers: ProviderCheckRequest): Promise<ProviderCheckResponse> {
    return this.request<ProviderCheckResponse>("/ApiManager/suppliers_v3/supplier_exists", {
      method: "POST",
      body: JSON.stringify(providers),
    });
  }
}

export const egixiaApi = new EgixiaAPI();
