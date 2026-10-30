export type CatalogService = {
  id: string;
  category: 'transport' | 'water' | 'dining' | 'nightlife' | 'home' | 'content';
  name: { es: string; en: string };
  description: { es: string; en: string };
  pricing: { type: 'quote' };
  source: 'demo';
  bookable: false;
};

export abstract class CatalogPort {
  abstract list(): Promise<CatalogService[]>;
  abstract findById(id: string): Promise<CatalogService | undefined>;
}
