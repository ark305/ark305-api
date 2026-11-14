export const SERVICE_CATEGORIES = ['transport', 'water', 'dining', 'nightlife', 'home', 'content', 'other'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export type ProviderService = {
  id: string;
  providerId: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  category: ServiceCategory;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ServiceFields = Pick<ProviderService, 'name' | 'description' | 'priceCents' | 'currency' | 'durationMinutes' | 'category' | 'active'>;
export type Page = { limit: number; offset: number };
export type ServiceSearch = Page & { text?: string; category?: ServiceCategory; providerId?: string };

export abstract class ProviderServicesPort {
  abstract create(token: string, providerId: string, fields: ServiceFields): Promise<ProviderService>;
  /** Updates only a row owned by `providerId`; null when there is none. */
  abstract update(token: string, providerId: string, id: string, fields: Partial<ServiceFields>): Promise<ProviderService | null>;
  abstract findById(token: string, id: string): Promise<ProviderService | null>;
  /** Active services of current providers only. */
  abstract search(token: string, search: ServiceSearch): Promise<ProviderService[]>;
  abstract listOwn(token: string, providerId: string, page: Page): Promise<ProviderService[]>;
}
