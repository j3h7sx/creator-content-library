export type TaxonomyCategory = {
  slug: string;
  label: string;
  description: string;
};

export type PinterestDownloaderConfig = {
  command?: string;
  args?: string[];
};

export type AiConfig = {
  enabled: boolean;
  catalogModel: string;
  embeddingModel: string;
};

export type ContentLibraryConfig = {
  dataDir: string;
  databasePath: string;
  libraryRoot: string;
  inboxDir: string;
  originalsDir: string;
  previewsDir: string;
  duplicatesDir: string;
  previewMaxSize: number;
  imageExtensions: string[];
  taxonomy: TaxonomyCategory[];
  ai: AiConfig;
  pinterestDownloader?: PinterestDownloaderConfig;
};

export const DEFAULT_TAXONOMY: TaxonomyCategory[] = [
  {
    slug: "people",
    label: "People",
    description: "People, portraits, gestures, emotions, groups, UGC-style human moments.",
  },
  {
    slug: "lifestyle",
    label: "Lifestyle",
    description: "Everyday life, routines, home moments, social scenes, candid creator imagery.",
  },
  {
    slug: "food_drink",
    label: "Food & Drink",
    description: "Meals, drinks, groceries, coffee, restaurants, cooking, wellness food scenes.",
  },
  {
    slug: "home_interiors",
    label: "Home & Interiors",
    description: "Rooms, furniture, decor, bathrooms, kitchens, beds, cozy interior details.",
  },
  {
    slug: "work_study",
    label: "Work & Study",
    description: "Desks, laptops, notebooks, planning, office, study, productivity scenes.",
  },
  {
    slug: "wellness_health",
    label: "Wellness & Health",
    description: "Self-care, fitness, body, medicine, symptoms, recovery, appointments.",
  },
  {
    slug: "travel_outdoors",
    label: "Travel & Outdoors",
    description: "Cities, nature, beaches, trails, transportation, outdoor lifestyle.",
  },
  {
    slug: "fashion_beauty",
    label: "Fashion & Beauty",
    description: "Outfits, skincare, hair, makeup, mirrors, styling, beauty products.",
  },
  {
    slug: "app_screenshots",
    label: "App Screenshots",
    description: "Mobile or web screenshots, product UI, app flows, interface references.",
  },
  {
    slug: "products_props",
    label: "Products & Props",
    description: "Objects, packaging, devices, books, bottles, props for visual storytelling.",
  },
  {
    slug: "backgrounds_textures",
    label: "Backgrounds & Textures",
    description: "Abstract, blurred, texture, landscape, neutral background, filler visuals.",
  },
  {
    slug: "memes_text",
    label: "Memes & Text",
    description: "Text-heavy images, memes, quote graphics, captions, screenshots with text.",
  },
  {
    slug: "uncategorized",
    label: "Uncategorized",
    description: "Unclear or not yet categorized assets.",
  },
];

export const DEFAULT_CONFIG: ContentLibraryConfig = {
  dataDir: "data",
  databasePath: "data/content-library.sqlite",
  libraryRoot: "library",
  inboxDir: "library/00_inbox",
  originalsDir: "library/originals",
  previewsDir: "library/previews",
  duplicatesDir: "library/duplicates",
  previewMaxSize: 1200,
  imageExtensions: [".jpg", ".jpeg", ".png", ".webp", ".heic"],
  taxonomy: DEFAULT_TAXONOMY,
  ai: {
    enabled: true,
    catalogModel: process.env.OPENAI_CATALOG_MODEL ?? "gpt-4.1-mini",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  },
};
