"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Database,
  Folder,
  ImageOff,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Search,
  Settings,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatBytes, formatDate } from "@/lib/utils";

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

type CatalogSummary = {
  scanned: number;
  cataloged: number;
  skippedExisting: number;
  duplicates: number;
  previewErrors: number;
  aiErrors: number;
  aiProvider: "openai" | "manual";
};

type ImportJob = {
  id: string;
  status: "queued" | "running" | "retrying" | "completed" | "failed";
  source: "files" | "pinterest";
  sourceUrl: string | null;
  workingDir: string | null;
  imported: string[];
  rejected: string[];
  total: number;
  processed: number;
  attempts: number;
  messages: string[];
  summary: CatalogSummary | null;
  error: string | null;
  nextAttemptAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type ImportResponse = {
  imported: string[];
  rejected: string[];
  job?: ImportJob;
  message?: string;
};

type ImportJobsResponse = {
  jobs: ImportJob[];
  worker?: {
    concurrency: number;
  };
  message?: string;
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

const MAX_SEARCH_CACHE_ENTRIES = 40;
const SIDEBAR_STORAGE_KEY = "creator-content-library-sidebar";
const IMPORT_JOB_POLL_INTERVAL_MS = 1500;
const TAG_VISIBLE_LIMIT = 40;

function isImportJobActive(status: ImportJob["status"]) {
  return status === "queued" || status === "running" || status === "retrying";
}

function wasImportJobActive(status: ImportJob["status"] | undefined) {
  return status ? isImportJobActive(status) : false;
}

function getImportProgress(job: ImportJob) {
  if (job.status === "completed") {
    return 100;
  }

  if (job.total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((job.processed / job.total) * 100)));
}

function formatPinterestBoardLabel(value: string | null) {
  if (!value) {
    return "Pinterest board";
  }

  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length > 0 ? segments.slice(-2).join("/") : url.hostname;
  } catch {
    return "Pinterest board";
  }
}

function getImportJobTitle(job: ImportJob) {
  if (job.source === "pinterest") {
    return `Pinterest: ${formatPinterestBoardLabel(job.sourceUrl)}`;
  }

  if (job.imported.length === 1) {
    return job.imported[0]?.split("/").pop() ?? "Image import";
  }

  return `${job.imported.length} uploaded file${job.imported.length === 1 ? "" : "s"}`;
}

function getImportJobStatusTitle(job: ImportJob) {
  if (job.status === "completed") {
    return "Complete";
  }
  if (job.status === "failed") {
    return "Failed";
  }
  if (job.status === "retrying") {
    return "Waiting to retry";
  }
  if (job.status === "queued") {
    return "Queued";
  }
  return job.source === "pinterest" && job.total === 0 ? "Downloading" : "Cataloging";
}

function getImportProgressText(job: ImportJob) {
  if (job.status === "retrying" && job.nextAttemptAt) {
    return `Retrying at ${formatDate(job.nextAttemptAt)}`;
  }

  if (job.status === "queued") {
    return "Waiting";
  }

  if (job.source === "pinterest" && isImportJobActive(job.status) && job.total === 0) {
    return "Downloading";
  }

  if (job.total > 0) {
    return `${job.processed}/${job.total}`;
  }

  if (job.summary) {
    return `${job.summary.cataloged} cataloged`;
  }

  return "Preparing";
}

function hasDraggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function prettySlug(slug: string) {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function parsePinterestBoardUrls(value: string) {
  return uniqueStrings(
    value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function normalizeEditableLabel(value: string, fallback = "") {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");

  return normalized || fallback;
}

function rememberSearchResponse(cache: Map<string, LibraryResponse>, key: string, value: LibraryResponse) {
  cache.set(key, value);
  if (cache.size <= MAX_SEARCH_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = cache.keys().next().value;
  if (oldestKey) {
    cache.delete(oldestKey);
  }
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
    <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
      <ImageOff className="size-5" />
    </div>
  );
}

function PinterestLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.406.042-3.442.218-.936 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.768 1.518 1.688 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.223.083.344-.091.379-.293 1.194-.333 1.361-.052.22-.174.266-.402.16-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.966 7.398 6.931 0 4.137-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.042-1.002 2.349-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"
      />
    </svg>
  );
}

function ImportJobProgressCard({
  job,
  onDismiss,
}: {
  job: ImportJob;
  onDismiss: (job: ImportJob) => void;
}) {
  const progress = getImportProgress(job);
  const indeterminate = isImportJobActive(job.status) && job.total === 0;
  const canDismiss = job.status === "completed" || job.status === "failed";

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card p-3">
      <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium">{getImportJobTitle(job)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge
            variant={job.status === "failed" ? "destructive" : job.status === "running" ? "default" : "secondary"}
          >
            {isImportJobActive(job.status) && job.status !== "retrying" ? (
              <Loader2 className="animate-spin" />
            ) : null}
            {getImportJobStatusTitle(job)}
          </Badge>
          {canDismiss ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6"
              onClick={() => onDismiss(job)}
              aria-label="Dismiss import job"
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        <span className="truncate">{getImportProgressText(job)}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={getImportJobTitle(job)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : progress}
      >
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-all",
            indeterminate && "import-progress-indeterminate",
          )}
          style={{ width: indeterminate ? undefined : `${progress}%` }}
        />
      </div>
      {job.error ? (
        <p className="mt-2 break-words text-xs text-destructive">{job.error}</p>
      ) : null}
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
  const visibleTags = uniqueStrings(image.tags).slice(0, 4);

  return (
    <article className="group overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-[9/16] bg-muted">
        <button
          type="button"
          className="peer block size-full cursor-pointer text-left"
          onClick={() => onOpen(image)}
        >
          {broken ? (
            <BrokenPreview />
          ) : (
            <img
              src={`/api/images/${image.id}/preview`}
              alt={image.caption ?? image.original_filename}
              className="size-full object-cover"
              loading="lazy"
              onError={() => setBroken(true)}
            />
          )}
          <span className="sr-only">
            {image.caption || image.original_filename}
          </span>
        </button>
        <div className="pointer-events-none absolute rounded-t-3xl inset-x-0 bottom-0 flex translate-y-3 flex-col gap-3 border-t border-white/15 p-3 opacity-0 shadow-[0_-20px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl transition duration-200 supports-[backdrop-filter]:bg-secondary/20 group-hover:translate-y-0 group-hover:opacity-100 peer-focus-visible:translate-y-0 peer-focus-visible:opacity-100">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-white/90 text-sm font-medium tracking-tighter leading-4">
              {image.caption || image.original_filename}
            </h3>
            <p className="mt-1 text-xs text-white/90">{prettySlug(image.category)}</p>
          </div>
          {visibleTags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {visibleTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="max-w-full truncate">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="default"
                size="sm"
                className="pointer-events-auto h-8 w-full justify-center text-primary bg-background/90 shadow-sm hover:bg-background"
              >
                <a href={`/api/images/${image.id}/download`}>
                  <ArrowDownToLine />
                  Download
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download original</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </article>
  );
}

function ImageCardSkeleton() {
  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <Skeleton className="aspect-[9/16] w-full rounded-none" />
    </article>
  );
}

function ImageGridSkeleton() {
  return (
    <div className="grid asset-grid gap-4" aria-label="Loading image results" aria-live="polite">
      {Array.from({ length: 12 }, (_, index) => (
        <ImageCardSkeleton key={index} />
      ))}
    </div>
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
          : "Import images here or sync a Pinterest board to build the searchable library."}
      </p>
    </div>
  );
}

export function LibraryBrowser() {
  const [data, setData] = React.useState<LibraryResponse>(initialResponse);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [tagSearch, setTagSearch] = React.useState("");
  const [sort, setSort] = React.useState("relevance");
  const [selected, setSelected] = React.useState<ImageItem | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [savingMetadata, setSavingMetadata] = React.useState(false);
  const [deletingImage, setDeletingImage] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [metadataCategory, setMetadataCategory] = React.useState("");
  const [metadataTags, setMetadataTags] = React.useState<string[]>([]);
  const [tagDraft, setTagDraft] = React.useState("");
  const [importDialogOpen, setImportDialogOpen] = React.useState(false);
  const [draggingFiles, setDraggingFiles] = React.useState(false);
  const [importJobs, setImportJobs] = React.useState<ImportJob[]>([]);
  const [pinterestUrl, setPinterestUrl] = React.useState("");
  const [pinterestSubmitting, setPinterestSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 300);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const searchCacheRef = React.useRef(new Map<string, LibraryResponse>());
  const importStatusRef = React.useRef(new Map<string, ImportJob["status"]>());

  const hasFilters = Boolean(debouncedQuery || category || selectedTags.length > 0);
  const resultsPending = loading || query !== debouncedQuery;
  const activeImportJobCount = importJobs.filter((job) => isImportJobActive(job.status)).length;
  const activeImportJob = activeImportJobCount > 0;
  const visibleImportJobs = importJobs.slice(0, 8);
  const visibleTagFacets = React.useMemo(() => {
    const normalizedTagSearch = tagSearch.trim().toLowerCase();
    return [...data.facets.tags]
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .filter((facet) => !normalizedTagSearch || facet.slug.toLowerCase().includes(normalizedTagSearch))
      .slice(0, TAG_VISIBLE_LIMIT);
  }, [data.facets.tags, tagSearch]);

  React.useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed");
  }, []);

  React.useEffect(() => {
    setMetadataCategory(selected?.category ?? "");
    setMetadataTags(uniqueStrings(selected?.tags ?? []));
    setTagDraft("");
  }, [selected]);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "collapsed" : "expanded");
      return next;
    });
  }

  function toggleTagFilter(nextTag: string) {
    setSelectedTags((current) =>
      current.includes(nextTag)
        ? current.filter((tagItem) => tagItem !== nextTag)
        : [...current, nextTag].sort((a, b) => a.localeCompare(b)),
    );
  }

  const refreshLibrary = React.useCallback(() => {
    searchCacheRef.current.clear();
    setRefreshKey((current) => current + 1);
  }, []);

  const applyImportJobs = React.useCallback(
    (jobs: ImportJob[], options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        const completedJobs = jobs.filter(
          (job) => job.status === "completed" && wasImportJobActive(importStatusRef.current.get(job.id)),
        );
        const failedJob = jobs.find(
          (job) => job.status === "failed" && wasImportJobActive(importStatusRef.current.get(job.id)),
        );

        if (completedJobs.length > 0) {
          refreshLibrary();
          const cataloged = completedJobs.reduce(
            (total, job) => total + (job.summary?.cataloged ?? 0),
            0,
          );
          setMessage(
            completedJobs.length === 1
              ? `Cataloged ${cataloged} imported file(s).`
              : `Completed ${completedJobs.length} import jobs; cataloged ${cataloged} file(s).`,
          );
          toast.success(
            completedJobs.length === 1
              ? "Import complete"
              : `${completedJobs.length} imports complete`,
            {
              description: `Cataloged ${cataloged} file${cataloged === 1 ? "" : "s"}.`,
            },
          );
        }

        if (failedJob) {
          const failureMessage = failedJob.error ?? "Import processing failed.";
          setError(failureMessage);
          toast.error("Import failed", {
            description: failureMessage,
          });
        }
      }

      importStatusRef.current = new Map(jobs.map((job) => [job.id, job.status]));
      setImportJobs(jobs);
    },
    [refreshLibrary],
  );

  const rememberImportJob = React.useCallback((job: ImportJob) => {
    importStatusRef.current.set(job.id, job.status);
    setImportJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 12));
  }, []);

  const loadImportJobs = React.useCallback(
    async (options: { silent?: boolean } = {}) => {
      try {
        const response = await fetch("/api/import");
        const payload = (await response.json()) as ImportJobsResponse;
        if (!response.ok) {
          throw new Error(payload.message ?? "Could not load import activity.");
        }

        applyImportJobs(payload.jobs, options);
      } catch (loadError) {
        if (!options.silent) {
          const loadMessage = loadError instanceof Error ? loadError.message : "Could not load import activity.";
          setError(loadMessage);
          toast.error("Could not load import activity", {
            description: loadMessage,
          });
        }
      }
    },
    [applyImportJobs],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      sort,
      limit: "160",
    });
    if (debouncedQuery) params.set("query", debouncedQuery);
    if (category) params.set("category", category);
    for (const selectedTag of selectedTags) {
      params.append("tag", selectedTag);
    }

    const cacheKey = params.toString();
    const cachedResponse = searchCacheRef.current.get(cacheKey);
    if (cachedResponse) {
      setData(cachedResponse);
      setError(null);
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    fetch(`/api/images?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Could not load image library.");
        }
        return response.json() as Promise<LibraryResponse>;
      })
      .then((nextData) => {
        rememberSearchResponse(searchCacheRef.current, cacheKey, nextData);
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
  }, [debouncedQuery, category, selectedTags, sort, refreshKey]);

  React.useEffect(() => {
    void loadImportJobs({ silent: true });
  }, [loadImportJobs]);

  const importFiles = React.useCallback(async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));
    setUploading(true);
    setImportDialogOpen(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ImportResponse;
      if (!response.ok) {
        throw new Error(payload.message ?? "Import failed.");
      }

      if (payload.job) {
        rememberImportJob(payload.job);
      }

      setMessage(payload.message ?? "Images queued for cataloging.");
      toast.success("Images queued", {
        description: `${payload.imported.length} file${payload.imported.length === 1 ? "" : "s"} added to the import queue.`,
      });
    } catch (importError) {
      const importMessage = importError instanceof Error ? importError.message : "Import failed.";
      setError(importMessage);
      toast.error("Import failed", {
        description: importMessage,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [rememberImportJob]);

  const queuePinterestBoards = React.useCallback(async (boardUrls: string[]) => {
    if (boardUrls.length === 0) {
      setError("Paste at least one Pinterest board URL first.");
      return;
    }

    setPinterestUrl("");
    setPinterestSubmitting(true);
    setImportDialogOpen(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/import/pinterest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ urls: boardUrls }),
      });
      const payload = (await response.json()) as { job?: ImportJob; jobs?: ImportJob[]; message?: string };
      const queuedJobs = payload.jobs ?? (payload.job ? [payload.job] : []);
      if (!response.ok || queuedJobs.length === 0) {
        throw new Error(payload.message ?? "Pinterest import failed.");
      }

      queuedJobs.forEach(rememberImportJob);
      setMessage(payload.message ?? "Pinterest board queued for import.");
      toast.success("Pinterest import queued", {
        description:
          queuedJobs.length === 1
            ? "Board will download and catalog in the background."
            : `${queuedJobs.length} boards will download and catalog in the background.`,
      });
    } catch (importError) {
      const importMessage = importError instanceof Error ? importError.message : "Pinterest import failed.";
      setError(importMessage);
      toast.error("Pinterest import failed", {
        description: importMessage,
      });
    } finally {
      setPinterestSubmitting(false);
    }
  }, [rememberImportJob]);

  const submitPinterestUrl = React.useCallback(() => {
    const boardUrls = parsePinterestBoardUrls(pinterestUrl);
    if (boardUrls.length === 0) {
      return;
    }

    void queuePinterestBoards(boardUrls);
  }, [pinterestUrl, queuePinterestBoards]);

  async function dismissImportJob(job: ImportJob) {
    setImportJobs((current) => current.filter((item) => item.id !== job.id));

    try {
      const response = await fetch(`/api/import/${job.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Could not dismiss import.");
      }

      toast.success("Import dismissed");
    } catch (dismissError) {
      setImportJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 12));
      const dismissMessage = dismissError instanceof Error ? dismissError.message : "Could not dismiss import.";
      toast.error("Could not dismiss import", {
        description: dismissMessage,
      });
    }
  }

  React.useEffect(() => {
    if (!importDialogOpen && activeImportJobCount === 0) {
      return;
    }

    let cancelled = false;

    async function pollImportJobs() {
      if (!cancelled) {
        await loadImportJobs();
      }
    }

    void pollImportJobs();
    const interval = window.setInterval(() => void pollImportJobs(), IMPORT_JOB_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeImportJobCount, importDialogOpen, loadImportJobs]);

  const handleDropZoneDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.nativeEvent)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDraggingFiles(true);
  }, []);

  const handleDropZoneDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event.nativeEvent)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setDraggingFiles(false);
      void importFiles(event.dataTransfer.files);
    },
    [importFiles],
  );

  React.useEffect(() => {
    function handleDragEnter(event: DragEvent) {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      setDraggingFiles(true);
      setImportDialogOpen(true);
    }

    function handleDragOver(event: DragEvent) {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setDraggingFiles(true);
    }

    function handleDragLeave(event: DragEvent) {
      if (!hasDraggedFiles(event)) {
        return;
      }

      if (
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight
      ) {
        setDraggingFiles(false);
      }
    }

    function handleDrop(event: DragEvent) {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      setDraggingFiles(false);
      setImportDialogOpen(true);
      void importFiles(event.dataTransfer?.files ?? null);
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [importFiles]);

  const moveSelected = React.useCallback(
    (direction: -1 | 1) => {
      setSelected((current) => {
        if (!current || data.images.length < 2) {
          return current;
        }

        const currentIndex = data.images.findIndex((image) => image.id === current.id);
        if (currentIndex === -1) {
          return current;
        }

        const nextIndex = (currentIndex + direction + data.images.length) % data.images.length;
        return data.images[nextIndex];
      });
    },
    [data.images],
  );

  function addMetadataTag(value: string) {
    const nextTag = normalizeEditableLabel(value);
    if (!nextTag) {
      return;
    }

    setMetadataTags((current) => uniqueStrings([...current, nextTag]));
    setTagDraft("");
  }

  function removeMetadataTag(tagToRemove: string) {
    setMetadataTags((current) => current.filter((tagItem) => tagItem !== tagToRemove));
  }

  function applyUpdatedImage(nextImage: ImageItem) {
    setData((current) => ({
      ...current,
      images: current.images.map((image) => (image.id === nextImage.id ? nextImage : image)),
    }));
    setSelected(nextImage);
  }

  async function saveSelectedMetadata() {
    if (!selected) {
      return;
    }

    setSavingMetadata(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/images/${selected.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: normalizeEditableLabel(metadataCategory, "uncategorized"),
          tags: metadataTags,
        }),
      });
      const payload = (await response.json()) as { image?: ImageItem; message?: string };
      if (!response.ok || !payload.image) {
        throw new Error(payload.message ?? "Could not save image metadata.");
      }

      applyUpdatedImage(payload.image);
      refreshLibrary();
      setMessage("Metadata saved.");
      toast.success("Metadata saved");
    } catch (saveError) {
      const saveMessage = saveError instanceof Error ? saveError.message : "Could not save image metadata.";
      setError(saveMessage);
      toast.error("Could not save metadata", {
        description: saveMessage,
      });
    } finally {
      setSavingMetadata(false);
    }
  }

  async function deleteSelectedImage() {
    if (!selected) {
      return;
    }

    const confirmed = window.confirm("Delete this image from the library?");
    if (!confirmed) {
      return;
    }

    setDeletingImage(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/images/${selected.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Could not delete image.");
      }

      setData((current) => ({
        ...current,
        images: current.images.filter((image) => image.id !== selected.id),
      }));
      setSelected(null);
      refreshLibrary();
      setMessage("Image deleted.");
      toast.success("Image deleted");
    } catch (deleteError) {
      const deleteMessage = deleteError instanceof Error ? deleteError.message : "Could not delete image.";
      setError(deleteMessage);
      toast.error("Could not delete image", {
        description: deleteMessage,
      });
    } finally {
      setDeletingImage(false);
    }
  }

  React.useEffect(() => {
    if (!selected) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelected(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSelected(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveSelected, selected]);

  const selectedIndex = selected ? data.images.findIndex((image) => image.id === selected.id) : -1;
  const canNavigateSelected = selectedIndex >= 0 && data.images.length > 1;

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-background">
        <div className="flex min-h-screen">
          <aside
            className={cn(
              "sticky top-0 hidden h-screen shrink-0 border-r bg-card/80 transition-[width] duration-200 lg:flex lg:flex-col",
              sidebarCollapsed ? "w-14" : "w-72",
            )}
          >
            <div
              className={cn(
                "flex h-16 items-center border-b",
                sidebarCollapsed ? "justify-center px-2" : "justify-between px-5",
              )}
            >
              {sidebarCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Expand sidebar"
                      aria-expanded={!sidebarCollapsed}
                      onClick={toggleSidebar}
                    >
                      <PanelLeftOpen />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand sidebar</TooltipContent>
                </Tooltip>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-semibold">Content Library</p>
                    <p className="text-xs text-muted-foreground">Local visual assets</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Collapse sidebar"
                          aria-expanded={!sidebarCollapsed}
                          onClick={toggleSidebar}
                        >
                          <PanelLeftClose />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Collapse sidebar</TooltipContent>
                    </Tooltip>
                    <Button asChild variant="ghost" size="icon">
                      <Link href="/settings">
                        <Settings />
                        <span className="sr-only">Settings</span>
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </div>
            {sidebarCollapsed ? (
              <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto p-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Expand sidebar"
                      aria-expanded={!sidebarCollapsed}
                      onClick={toggleSidebar}
                    >
                      <Folder />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Show filters</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Expand sidebar"
                      aria-expanded={!sidebarCollapsed}
                      onClick={toggleSidebar}
                    >
                      <Tags />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Show tags</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="ghost" size="icon">
                      <Link href="/settings">
                        <Settings />
                        <span className="sr-only">Settings</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Settings</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
                    <p className="mb-2 text-xs text-muted-foreground">One primary bucket per image.</p>
                    <div className="flex flex-col gap-1">
                      {data.facets.categories.length > 0 ? (
                        data.facets.categories.map((facet) => (
                          <button
                            key={facet.slug}
                            type="button"
                            className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${category === facet.slug
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-muted"
                              }`}
                            onClick={() => setCategory(category === facet.slug ? "" : facet.slug)}
                          >
                            <span className="truncate">{prettySlug(facet.slug)}</span>
                            <span className="text-xs text-muted-foreground">{facet.count}</span>
                          </button>
                        ))
                      ) : (
                        <p className="rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground">
                          No categories yet.
                        </p>
                      )}
                    </div>
                  </section>

                  <section>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                      <Tags className="size-3.5" />
                      Tags
                    </div>
                    <p className="mb-2 text-xs text-muted-foreground">Multiple reusable labels per image.</p>
                    <div className="relative mb-3">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={tagSearch}
                        onChange={(event) => setTagSearch(event.target.value)}
                        placeholder="Search tags"
                        className="h-8 pl-8 pr-8 text-xs"
                      />
                      {tagSearch ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setTagSearch("")}
                        >
                          <X />
                          <span className="sr-only">Clear tag search</span>
                        </Button>
                      ) : null}
                    </div>
                    {selectedTags.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mb-3 h-7 px-2 text-xs"
                        onClick={() => setSelectedTags([])}
                      >
                        Deselect all
                      </Button>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {data.facets.tags.length > 0 ? (
                        visibleTagFacets.length > 0 ? (
                          visibleTagFacets.map((facet) => {
                            const isSelected = selectedTags.includes(facet.slug);
                            return (
                              <button
                                key={facet.slug}
                                type="button"
                                className="cursor-pointer"
                                onClick={() => toggleTagFilter(facet.slug)}
                              >
                                <Badge variant={isSelected ? "default" : "secondary"}>
                                  {facet.slug} {facet.count}
                                </Badge>
                              </button>
                            );
                          })
                        ) : (
                          <p className="rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground">
                            No matching tags.
                          </p>
                        )
                      ) : (
                        <p className="rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground">
                          No tags yet.
                        </p>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}
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
                    <ThemeToggle />
                    <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)} disabled={uploading}>
                      {uploading || activeImportJob ? <Loader2 className="animate-spin" /> : <Upload />}
                      {uploading
                        ? "Uploading"
                        : activeImportJob
                          ? `Processing ${activeImportJobCount}`
                          : "Import"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="salad with avocado and egg, blurry picture outside, person holding coffee in bed"
                      className="pl-10 pr-10"
                    />
                    {query ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 size-7 text-destructive/50 hover:text-destructive/60"
                        onClick={() => setQuery("")}
                      >
                        <X />
                        <span className="sr-only">Clear search</span>
                      </Button>
                    ) : null}
                  </div>
                  <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end" className="min-w-[var(--radix-select-trigger-width)]">
                      <SelectGroup>
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="relevance">Relevance</SelectItem>
                        <SelectItem value="filename">Filename</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {(message || error) && (
                  <div
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${error ? "border-destructive/30 text-destructive" : "bg-card text-muted-foreground"
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
                <p className="inline-flex items-center gap-2">
                  {resultsPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>
                        Updating results{data.ai.semanticSearch ? " with semantic ranking" : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      {data.images.length} visible image{data.images.length === 1 ? "" : "s"}
                      {data.ai.semanticSearch ? " using semantic ranking" : ""}
                    </>
                  )}
                </p>
                <p>Latest catalog run: {formatDate(data.stats.latestProcessedAt)}</p>
              </div>

              {resultsPending ? (
                <ImageGridSkeleton />
              ) : data.images.length === 0 ? (
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

        {draggingFiles ? (
          <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center border-2 border-dashed border-primary/70 bg-background/55 p-6 backdrop-blur-sm transition">
            <div className="flex min-h-40 w-[min(460px,calc(100vw-48px))] animate-pulse flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/70 bg-card/85 p-8 text-center shadow-lg">
              <Upload className="size-8 text-primary" />
              <div>
                <p className="text-base font-semibold">Drop images to import</p>
                <p className="mt-1 text-sm text-muted-foreground">They will keep cataloging in the background.</p>
              </div>
            </div>
          </div>
        ) : null}

        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="max-h-[90vh] w-[min(640px,calc(100vw-2rem))] max-w-[min(640px,calc(100vw-2rem))] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-[min(640px,calc(100vw-2rem))]">
            <DialogHeader className="min-w-0 pr-8">
              <DialogTitle>Import images</DialogTitle>
              <DialogDescription>
                Drop files or paste a Pinterest board URL.
              </DialogDescription>
            </DialogHeader>

            <div
              className={cn(
                "flex min-h-56 flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-muted/35 p-6 text-center transition",
                draggingFiles && "border-primary bg-primary/5 shadow-inner",
              )}
              onDragOver={handleDropZoneDragOver}
              onDrop={handleDropZoneDrop}
            >
              <div className="rounded-full border bg-background p-3 text-muted-foreground">
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
              </div>
              <div>
                <p className="text-sm font-medium">Drag image files anywhere on the window</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  JPG, PNG, WebP, HEIC.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                Choose files
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

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <form
              className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-lg border bg-card p-3"
              onSubmit={(event) => {
                event.preventDefault();
                submitPinterestUrl();
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">Import a Pinterest board</p>
              </div>
              <div className="relative min-w-0 overflow-hidden">
                <span className="pointer-events-none absolute left-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-xs">
                  <PinterestLogo className="size-3.5 text-[#E60023]" />
                </span>
                <Input
                  value={pinterestUrl}
                  onChange={(event) => setPinterestUrl(event.target.value)}
                  onPaste={(event) => {
                    const pastedText = event.clipboardData.getData("text");
                    const boardUrls = parsePinterestBoardUrls(pastedText);
                    if (boardUrls.length === 0) {
                      return;
                    }

                    event.preventDefault();
                    void queuePinterestBoards(boardUrls);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitPinterestUrl();
                    }
                  }}
                  placeholder="Paste a Pinterest board URL"
                  inputMode="url"
                  disabled={pinterestSubmitting}
                  className="pl-10 pr-10"
                />
                {pinterestSubmitting ? (
                  <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : null}
              </div>
            </form>

            {visibleImportJobs.length > 0 ? (
              <div className="flex min-w-0 flex-col gap-2 overflow-hidden">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Import activity</p>
                  </div>
                  {activeImportJob ? (
                    <Badge variant="secondary" className="shrink-0">
                      {activeImportJobCount} active
                    </Badge>
                  ) : null}
                </div>
                {visibleImportJobs.map((job) => (
                  <ImportJobProgressCard key={job.id} job={job} onDismiss={dismissImportJob} />
                ))}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
          {selected ? (
            <DialogContent className="w-[min(1120px,94vw)] max-w-[min(1120px,94vw)] gap-0 overflow-hidden p-0 sm:max-w-[min(1120px,94vw)]">
              <DialogHeader className="sr-only">
                <DialogTitle>{selected.caption ?? selected.original_filename}</DialogTitle>
                <DialogDescription>Image preview and metadata</DialogDescription>
              </DialogHeader>
              <div className="grid max-h-[92vh] grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_360px]">
                <div className="relative flex min-h-[320px] items-center justify-center bg-muted">
                  {canNavigateSelected ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute left-3 top-1/2 z-10 size-9 rounded-full bg-background/90 shadow-sm backdrop-blur hover:bg-background"
                      onClick={() => moveSelected(-1)}
                    >
                      <ChevronLeft />
                      <span className="sr-only">Previous image</span>
                    </Button>
                  ) : null}
                  <img
                    src={`/api/images/${selected.id}/preview`}
                    alt={selected.caption ?? selected.original_filename}
                    className="max-h-[92vh] w-full object-contain"
                  />
                  {canNavigateSelected ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute right-3 top-1/2 z-10 size-9 rounded-full bg-background/90 shadow-sm backdrop-blur hover:bg-background"
                      onClick={() => moveSelected(1)}
                    >
                      <ChevronRight />
                      <span className="sr-only">Next image</span>
                    </Button>
                  ) : null}
                </div>
                <aside className="flex max-h-[92vh] flex-col overflow-y-auto border-t bg-background p-5 md:border-l md:border-t-0">
                  <div className="pr-8">
                    {selectedIndex >= 0 ? (
                      <p className="mb-2 text-xs text-muted-foreground">
                        {selectedIndex + 1} of {data.images.length}
                      </p>
                    ) : null}
                    <h2 className="text-lg font-semibold leading-6">
                      {selected.caption || selected.original_filename}
                    </h2>
                    {selected.description ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{selected.description}</p>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <Badge>{prettySlug(selected.category)}</Badge>
                    {uniqueStrings(selected.tags).map((item) => (
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

                  <section className="flex flex-col gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Library labels</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Category is the broad bucket. Tags are reusable labels like endolog_app or phone_photo.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-muted-foreground" htmlFor="image-category">
                        Category - one per image
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="image-category"
                          value={metadataCategory}
                          onChange={(event) => setMetadataCategory(event.target.value)}
                          onBlur={() =>
                            setMetadataCategory((current) =>
                              normalizeEditableLabel(current, "uncategorized"),
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setMetadataCategory("endolog_app")}
                        >
                          Endolog
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-muted-foreground" htmlFor="image-tag">
                        Tags - many per image
                      </label>
                      {metadataTags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {metadataTags.map((tagItem) => (
                            <Badge key={tagItem} variant="secondary" className="gap-1">
                              {tagItem}
                              <button
                                type="button"
                                className="flex size-4 cursor-pointer items-center justify-center rounded-full"
                                onClick={() => removeMetadataTag(tagItem)}
                                aria-label={`Remove ${tagItem}`}
                              >
                                <X className="size-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <Input
                          id="image-tag"
                          value={tagDraft}
                          onChange={(event) => setTagDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addMetadataTag(tagDraft);
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => addMetadataTag(tagDraft)}
                        >
                          Add
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {["endolog_app", "phone_photo", "app_in_use"].map((tagItem) => (
                          <Button
                            key={tagItem}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addMetadataTag(tagItem)}
                          >
                            {tagItem}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => void saveSelectedMetadata()}
                        disabled={savingMetadata || deletingImage}
                      >
                        {savingMetadata ? <Loader2 className="animate-spin" /> : <Save />}
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => void deleteSelectedImage()}
                        disabled={savingMetadata || deletingImage}
                      >
                        {deletingImage ? <Loader2 className="animate-spin" /> : <Trash2 />}
                        Delete
                      </Button>
                    </div>
                  </section>

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
