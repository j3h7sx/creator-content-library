# Creator Content Library

A local-first visual asset library for creators, marketers, and app builders who collect large batches of inspiration images for social media carousels, Figma/Canva boards, TikTok and Instagram concepts, app marketing, UGC references, moodboards, and workshops.

It scans folders of images, detects exact duplicates, creates browser-friendly previews, optionally uses OpenAI for captions/tags/embeddings, and gives you a searchable Next.js web app for finding the right visual quickly.

## Who It Is For

- Creators building carousel posts by hand in Figma or Canva.
- Mobile app builders collecting App Store, TikTok, Instagram, and UGC inspiration.
- Marketers organizing product, lifestyle, wellness, food, travel, screenshot, and background references.
- Workshop participants who need a simple local workflow without a cloud backend.

## What It Does

- Imports images from `library/00_inbox` or the web UI.
- Supports `jpg`, `jpeg`, `png`, `webp`, and best-effort `heic`.
- Preserves originals in `library/originals`.
- Generates WebP previews in `library/previews`.
- Computes SHA-256 hashes to skip already-cataloged files and detect exact duplicates.
- Optionally uses OpenAI vision models for captions, descriptions, tags, categories, style/vibe, people/objects/setting/action, searchable text, and embeddings.
- Falls back to manual/basic filename metadata when no OpenAI API key is configured.
- Provides keyword and semantic search, category and tag filters, responsive image grid, lightbox, and attachment downloads.

## Quickstart

```bash
bun install
cp .env.example .env
bun run dev
```

Open `http://localhost:3000`.

Drop images into:

```bash
library/00_inbox
```

Then catalog them:

```bash
bun run catalog
```

To move cataloged files into semantic category folders:

```bash
bun run catalog -- --move
```

## OpenAI Setup

OpenAI is optional. Without a key, the tool still imports images, generates previews, deduplicates files, and supports basic filename/tag search.

To enable AI cataloging and semantic search:

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_CATALOG_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Models are configurable because model availability and pricing can change. The app stores model names and token usage when the API response includes usage data. Cost estimates are left empty in v1 unless you add pricing logic in your own fork.

Semantic search sends the text query to the embeddings API the first time a normalized query is searched. Query embeddings are cached locally in SQLite by query and embedding model, so repeating the same search does not call OpenAI again.

## Commands

```bash
bun run dev
bun run catalog
bun run catalog -- --move
bun run search "salad with avocado and egg"
bun run rebuild
bun run dedupe
bun run dedupe -- --move
bun run pinterest:setup
bun run pinterest:board "https://www.pinterest.com/user/board/" --out ./library/00_inbox
bun run typecheck
bun run lint
bun run build
bun test
```

Useful catalog options:

```bash
bun run catalog -- --scan ./some-folder
bun run catalog -- --scan ./library --limit 50
bun run catalog -- --manual
bun run rebuild -- --force
```

## Web Import Workflow

1. Open the web app.
2. Click **Import**.
3. Select images from your computer, drag them onto the window, or paste a Pinterest board URL.
4. The app queues durable background import jobs.
5. Progress appears in the import dialog with the current job step and processed file count.
6. Completed jobs refresh the library automatically.

If `OPENAI_API_KEY` is configured, background cataloging uses the configured OpenAI models automatically. Without a key, jobs still run with manual filename-based metadata.

Import jobs are stored in SQLite, so queued or retrying jobs resume when the app/server starts again. The worker processes up to two jobs at once by default. To tune that locally:

```bash
CONTENT_LIBRARY_IMPORT_CONCURRENCY=3 bun run dev
```

The value is capped at 6 to avoid overwhelming local image processing or API rate limits.

## Pinterest Workflow

This repo does **not** include an official Pinterest API integration and does not bypass platform restrictions.

It does include a bundled copy of the same third-party downloader used by the local `pinboard` fish function. Install its Python dependencies once:

```bash
bun run pinterest:setup
```

Then download a board into the import inbox:

```bash
bun run pinterest:board "https://www.pinterest.com/user/board/" --out ./library/00_inbox
bun run catalog -- --move
```

The bundled downloader writes nested folders under `library/00_inbox`, and `catalog` scans them recursively.

You can also use the web app import dialog. Paste a board URL into the Pinterest field and the app queues it immediately, clears the input, and shows progress below. Repeat for more boards while earlier jobs keep running.

If you want to override the bundled downloader with another downloader you are allowed to use, configure it:

```bash
PINTEREST_DOWNLOADER_COMMAND=python3
PINTEREST_DOWNLOADER_ARGS=/absolute/path/to/downloader.py {url} --out {out}
```

Then run:

```bash
bun run pinterest:board "https://www.pinterest.com/user/board/" --out ./library/00_inbox
```

You can also configure the command in `content-library.config.json`:

```json
{
  "pinterestDownloader": {
    "command": "python3",
    "args": ["/absolute/path/to/downloader.py", "{url}", "--out", "{out}"]
  }
}
```

You are responsible for copyright, permissions, personal data, and Pinterest or third-party platform terms. For many teams, manual import is the more reliable default.

## Taxonomy

Default categories:

- `people`
- `lifestyle`
- `food_drink`
- `home_interiors`
- `work_study`
- `wellness_health`
- `travel_outdoors`
- `fashion_beauty`
- `app_screenshots`
- `products_props`
- `backgrounds_textures`
- `memes_text`
- `uncategorized`

Copy either example config and customize it:

```bash
cp content-library.config.example.json content-library.config.json
```

The TypeScript example is useful for Bun CLI workflows:

```bash
cp content-library.config.example.ts content-library.config.ts
```

For the Next.js app runtime, JSON config is the most portable option.

## Folder Structure

```text
app/                         Next.js App Router pages and API routes
components/                  App components
components/ui/               shadcn-style UI primitives
lib/ai/                      OpenAI/manual AI adapters
lib/catalog/                 Cataloging, taxonomy, dedupe
lib/config/                  Shared config loader and defaults
lib/db/                      SQLite schema and queries
lib/images/                  File, preview, and serving helpers
lib/search/                  Keyword/semantic ranking
scripts/                     Bun CLI commands
data/                        Local SQLite database, ignored by Git
library/00_inbox/            Drop/import new images here
library/originals/           Preserved original images
library/previews/            Generated browser previews
library/duplicates/          Exact duplicates moved here
```

## Database

SQLite database path:

```text
data/content-library.sqlite
```

Stored fields include:

- `id`
- `sha256`
- `original_path`
- `current_path`
- `preview_path`
- `width` / `height`
- `mime_type`
- `caption`
- `description`
- `tags`
- `category`
- `embedding`
- `created_at`
- `updated_at`
- `processed_at`
- model and token usage fields

## HEIC Notes

HEIC support depends on the installed `sharp`/libvips build and platform codecs. On macOS it often works, but if preview generation fails, convert HEIC files to JPEG/WebP first or install a libvips build with HEIF support.

## Privacy Notes

- Images and metadata stay on your machine by default.
- If `OPENAI_API_KEY` is configured, images sent for cataloging are sent to OpenAI for processing.
- Query embeddings are generated through OpenAI only when semantic search is available, you search with a non-empty query, and that normalized query is not already cached locally.
- Do not catalog sensitive images unless you understand where your configured AI provider sends data.

## Troubleshooting

**The app is empty**

Run:

```bash
bun run catalog
```

If your images are outside `library/00_inbox`, scan that folder:

```bash
bun run catalog -- --scan ./path/to/images
```

**Downloads open instead of downloading**

Use the app's download button or `/api/images/:id/download`. That endpoint sets `Content-Disposition: attachment`.

**Images are duplicated**

Run:

```bash
bun run dedupe
bun run dedupe -- --move
```

**OpenAI is not being used**

Check `.env`, restart `bun run dev`, and visit `/settings`.

**Pinterest command fails**

The wrapper only calls your configured downloader. Confirm your downloader works by itself first, then check `{url}` and `{out}` placeholders.

## Contributing

Contributions are welcome. Keep the project local-first, avoid cloud assumptions, and favor clear workshop-friendly workflows over complex infrastructure.

Before opening a PR:

```bash
bun run typecheck
bun run lint
bun run build
bun test
```

## License

MIT is recommended for this project. See `LICENSE`.
