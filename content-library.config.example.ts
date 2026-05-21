import type { ContentLibraryConfig } from "./lib/config/defaults";

const config: Partial<ContentLibraryConfig> = {
  libraryRoot: "library",
  inboxDir: "library/00_inbox",
  originalsDir: "library/originals",
  previewsDir: "library/previews",
  duplicatesDir: "library/duplicates",
  ai: {
    enabled: true,
    catalogModel: "gpt-4.1-mini",
    embeddingModel: "text-embedding-3-small",
  },
  taxonomy: [
    {
      slug: "people",
      label: "People",
      description: "People, portraits, gestures, emotions, groups, UGC-style human moments.",
    },
    {
      slug: "lifestyle",
      label: "Lifestyle",
      description: "Everyday routines, candid lifestyle scenes, creator inspiration.",
    },
    {
      slug: "food_drink",
      label: "Food & Drink",
      description: "Meals, snacks, drinks, groceries, restaurants, cooking.",
    },
    {
      slug: "home_interiors",
      label: "Home & Interiors",
      description: "Rooms, decor, beds, bathrooms, kitchens, cozy interiors.",
    },
    {
      slug: "work_study",
      label: "Work & Study",
      description: "Desks, laptops, notebooks, office, study, planning.",
    },
    {
      slug: "wellness_health",
      label: "Wellness & Health",
      description: "Health, medicine, symptoms, self-care, recovery, fitness.",
    },
    {
      slug: "travel_outdoors",
      label: "Travel & Outdoors",
      description: "Cities, beaches, nature, trails, travel, outdoor lifestyle.",
    },
    {
      slug: "fashion_beauty",
      label: "Fashion & Beauty",
      description: "Outfits, skincare, makeup, hair, mirror selfies, styling.",
    },
    {
      slug: "app_screenshots",
      label: "App Screenshots",
      description: "Mobile/web screenshots, app flows, UI references.",
    },
    {
      slug: "products_props",
      label: "Products & Props",
      description: "Objects, packaging, devices, books, bottles, props.",
    },
    {
      slug: "backgrounds_textures",
      label: "Backgrounds & Textures",
      description: "Abstract, blurry, landscape, textures, filler backgrounds.",
    },
    {
      slug: "memes_text",
      label: "Memes & Text",
      description: "Text-heavy images, memes, quotes, screenshots with text.",
    },
    {
      slug: "uncategorized",
      label: "Uncategorized",
      description: "Unclear or not yet categorized assets.",
    },
  ],
  pinterestDownloader: {
    command: "python3",
    args: ["/absolute/path/to/downloader.py", "{url}", "--out", "{out}"],
  },
};

export default config;
