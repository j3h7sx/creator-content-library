"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownToLine,
  Database,
  Folder,
  ImageOff,
  Loader2,
  Search,
  Settings,
  Sparkles,
  Tags,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, formatDate } from "@/lib/utils";

type ImageItem = {
  id: string;
  original_filename: string;
  current_path: string;
  preview_path: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  caption: string | null;
  description: string | null;
  tags: string[];
  category: string;
  visual_style: string | null;
  vibe: string | null;
  people: string[];
  objects: string[];
  setting: string | null;
  action: string | null;
  ai_model: string | null;
  embedding_model: string | null;
  total_tokens: number | null;
  created_at: string;
  processed_at: string | null;
  relevance: number;
};

type Facet = {
  slug: string;
  count: number;
};

type LibraryResponse = {
  images: ImageItem[];
  facets: {
    categories: Facet[];
    tags: Facet[];
  };
  stats: {
    total: number;
    cataloged: number;
    withEmbeddings: number;
    duplicates: number;
    latestProcessedAt: string | null;
  };
  ai: {
    provider: "openai" | "manual";
    semanticSearch: boolean;
    catalogModel: string;
    embeddingModel: string;
  };
};

const initialResponse: LibraryResponse = {
  images: [],
  facets: {
    categories: [],
    tags: [],
  },
  stats: {
    total: 0,
    cataloged: 0,
    withEmbeddings: 0,
    duplicates: 0,
    latestProcessedAt: null,
  },
  ai: {
    provider: "manual",
    semanticSearch: false,
    catalogModel: "",
    embeddingModel: "",
  },
};

function prettySlug(slug: string) {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function BrokenPreview() {
  return (
    <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-muted-foreground">
      <ImageOff className="size-5" />
    </div>
  );
}

function ImageCard({
  image,
  onOpen,
}: {
  image: ImageItem;
  onOpen: (image: ImageItem) => void;
}) {
  const [broken, setBroken] = React.useState(false);

  return (
    <article className="group overflow-hidden rounded-lg border bg-card shadow-sm transition hover:shadow-md">
      <button
        type="button"
        className="block w-full bg-muted text-left"
        onClick={() => onOpen(image)}
      >
        {broken ? (
          <BrokenPreview />
        ) : (
          <img
            src={`/api/images/${image.id}/preview`}
            alt={image.caption ?? image.original_filename}
            className="aspect-[4/3] w-full object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        )}
      </button>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-medium leading-5">
              {image.caption || image.original_filename}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{prettySlug(image.category)}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="shrink-0 opacity-0 group-hover:opacity-100">
                <a href={`/api/images/${image.id}/download`}>
                  <ArrowDownToLine />
                  <span className="sr-only">Download</span>
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download original</TooltipContent>
          </Tooltip>
        </div>
        {image.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {image.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="max-w-full truncate">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-dashed bg-card p-8 text-center">
      <div className="mb-4 rounded-full border bg-background p-3 text-muted-foreground">
        {hasFilters ? <Search /> : <Database />}
      </div>
      <h2 className="text-lg font-semibold">{hasFilters ? "No matching images" : "No images cataloged yet"}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {hasFilters
          ? "Clear the query or filters to broaden the result set."
          : "Drop files into library/00_inbox or import images here, then run bun run catalog."}
      </p>
    </div>
  );
}

export function LibraryBrowser() {
  const [data, setData] = React.useState<LibraryResponse>(initialResponse);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [sort, setSort] = React.useState("relevance");
  const [selected, setSelected] = React.useState<ImageItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 300);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const hasFilters = Boolean(debouncedQuery || category || tag);

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      sort,
      limit: "160",
    });
    if (debouncedQuery) params.set("query", debouncedQuery);
    if (category) params.set("category", category);
    if (tag) params.set("tag", tag);

    setLoading(true);
    fetch(`/api/images?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Could not load image library.");
        }
        return response.json() as Promise<LibraryResponse>;
      })
      .then((nextData) => {
        setData(nextData);
        setError(null);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Could not load image library.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debouncedQuery, category, tag, sort]);

  async function importFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));
    setUploading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Import failed.");
      }
      setMessage(payload.message ?? "Images imported.");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function clearFilters() {
    setQuery("");
    setCategory("");
    setTag("");
    setSort("relevance");
  }

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-background">
        <div className="flex min-h-screen">
          <aside className="hidden w-72 shrink-0 border-r bg-card/80 lg:flex lg:flex-col">
            <div className="flex h-16 items-center justify-between border-b px-5">
              <div>
                <p className="text-sm font-semibold">Content Library</p>
                <p className="text-xs text-muted-foreground">Local visual assets</p>
              </div>
              <Button asChild variant="ghost" size="icon">
                <Link href="/settings">
                  <Settings />
                  <span className="sr-only">Settings</span>
                </Link>
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-5 grid grid-cols-2 gap-2">
                <div className="rounded-md border bg-background p-3">
                  <p className="text-xl font-semibold">{data.stats.cataloged}</p>
                  <p className="text-xs text-muted-foreground">cataloged</p>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <p className="text-xl font-semibold">{data.stats.withEmbeddings}</p>
                  <p className="text-xs text-muted-foreground">semantic</p>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <section>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                    <Folder className="size-3.5" />
                    Categories
                  </div>
                  <div className="flex flex-col gap-1">
                    {data.facets.categories.map((facet) => (
                      <button
                        key={facet.slug}
                        type="button"
                        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${
                          category === facet.slug
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => setCategory(category === facet.slug ? "" : facet.slug)}
                      >
                        <span className="truncate">{prettySlug(facet.slug)}</span>
                        <span className="text-xs text-muted-foreground">{facet.count}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                    <Tags className="size-3.5" />
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.facets.tags.slice(0, 36).map((facet) => (
                      <button key={facet.slug} type="button" onClick={() => setTag(tag === facet.slug ? "" : facet.slug)}>
                        <Badge variant={tag === facet.slug ? "default" : "secondary"}>
                          {facet.slug} {facet.count}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
              <div className="flex min-h-16 flex-col gap-3 px-4 py-3 md:px-6">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <h1 className="text-xl font-semibold tracking-normal">Image library</h1>
                    <p className="text-sm text-muted-foreground">
                      Search, filter, preview, and download carousel inspiration assets.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={data.ai.provider === "openai" ? "default" : "secondary"} className="gap-1.5">
                      <Sparkles />
                      {data.ai.provider === "openai" ? "OpenAI enabled" : "Manual mode"}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                      Import
                    </Button>
                    <input
                      ref={fileInputRef}
                      className="hidden"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      multiple
                      onChange={(event) => void importFiles(event.target.files)}
                    />
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="salad with avocado and egg, blurry picture outside, person holding coffee in bed"
                      className="pl-10"
                    />
                  </div>
                  <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="relevance">Relevance</SelectItem>
                        <SelectItem value="filename">Filename</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={clearFilters} disabled={!hasFilters && sort === "newest"}>
                    <X />
                    Clear
                  </Button>
                </div>

                {(message || error) && (
                  <div
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      error ? "border-destructive/30 text-destructive" : "bg-card text-muted-foreground"
                    }`}
                  >
                    <AlertCircle />
                    {error ?? message}
                  </div>
                )}
              </div>
            </header>

            <div className="flex-1 p-4 md:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <p>
                  {loading ? "Loading..." : `${data.images.length} visible image${data.images.length === 1 ? "" : "s"}`}
                  {data.ai.semanticSearch ? " using semantic ranking" : ""}
                </p>
                <p>Latest catalog run: {formatDate(data.stats.latestProcessedAt)}</p>
              </div>

              {data.images.length === 0 && !loading ? (
                <EmptyState hasFilters={hasFilters} />
              ) : (
                <div className="grid asset-grid gap-4">
                  {data.images.map((image) => (
                    <ImageCard key={image.id} image={image} onOpen={setSelected} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
          {selected ? (
            <DialogContent>
              <DialogHeader className="sr-only">
                <DialogTitle>{selected.caption ?? selected.original_filename}</DialogTitle>
                <DialogDescription>Image preview and metadata</DialogDescription>
              </DialogHeader>
              <div className="grid max-h-[92vh] grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-h-[320px] items-center justify-center bg-muted">
                  <img
                    src={`/api/images/${selected.id}/file`}
                    alt={selected.caption ?? selected.original_filename}
                    className="max-h-[92vh] w-full object-contain"
                  />
                </div>
                <aside className="flex max-h-[92vh] flex-col overflow-y-auto border-t bg-background p-5 md:border-l md:border-t-0">
                  <div className="pr-8">
                    <h2 className="text-lg font-semibold leading-6">
                      {selected.caption || selected.original_filename}
                    </h2>
                    {selected.description ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{selected.description}</p>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <Badge>{prettySlug(selected.category)}</Badge>
                    {selected.tags.map((item) => (
                      <Badge key={item} variant="secondary">
                        {item}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-5 flex gap-2">
                    <Button asChild>
                      <a href={`/api/images/${selected.id}/download`}>
                        <ArrowDownToLine />
                        Download
                      </a>
                    </Button>
                    <Button variant="outline" asChild>
                      <a href={`/api/images/${selected.id}/file`} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </Button>
                  </div>

                  <Separator className="my-5" />

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Dimensions</dt>
                      <dd>{selected.width && selected.height ? `${selected.width} x ${selected.height}` : "Unknown"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Size</dt>
                      <dd>{formatBytes(selected.size_bytes)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Style</dt>
                      <dd>{selected.visual_style || "Unknown"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Vibe</dt>
                      <dd>{selected.vibe || "Unknown"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Setting</dt>
                      <dd>{selected.setting || "Unknown"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Action</dt>
                      <dd>{selected.action || "Unknown"}</dd>
                    </div>
                  </dl>

                  <details className="mt-5 rounded-md border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">Advanced metadata</summary>
                    <dl className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">
                      <div>
                        <dt className="font-medium text-foreground">File</dt>
                        <dd className="break-all">{selected.original_filename}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground">Catalog model</dt>
                        <dd>{selected.ai_model ?? "Manual"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground">Embedding model</dt>
                        <dd>{selected.embedding_model ?? "None"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground">Tokens</dt>
                        <dd>{selected.total_tokens ?? "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground">Processed</dt>
                        <dd>{formatDate(selected.processed_at)}</dd>
                      </div>
                    </dl>
                  </details>
                </aside>
              </div>
            </DialogContent>
          ) : null}
        </Dialog>
      </main>
    </TooltipProvider>
  );
}
