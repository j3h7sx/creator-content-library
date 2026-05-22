import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";
import { createAiProvider } from "@/lib/ai/provider";
import { loadConfig } from "@/lib/config/load";
import {
  deleteImageById,
  getImageById,
  updateImageMetadata,
  type ImageRecord,
} from "@/lib/db/images";
import { getDb } from "@/lib/db/schema";
import { resolveContentPath, slugify } from "@/lib/images/files";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdatePayload = {
  category?: unknown;
  tags?: unknown;
};

function stripPrivateSearchFields<T extends { embedding?: unknown }>(image: T): Omit<T, "embedding"> {
  const { embedding: _embedding, ...publicImage } = image;
  return publicImage;
}

function normalizeLabel(value: string, fallback = "uncategorized") {
  return slugify(value, fallback).replace(/-/g, "_");
}

function normalizeTags(value: unknown): string[] {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return [
    ...new Set(
      rawTags
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeLabel(item, "tag"))
        .filter(Boolean),
    ),
  ].slice(0, 32);
}

function buildSearchableText(image: ImageRecord, category: string, tags: string[]) {
  return [
    image.caption,
    image.description,
    category,
    tags.join(" "),
    image.visual_style,
    image.vibe,
    image.people.join(" "),
    image.objects.join(" "),
    image.setting,
    image.action,
    image.original_filename,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function PATCH(request: Request, context: RouteContext) {
  const params = await context.params;
  const [db, config] = await Promise.all([getDb(), loadConfig()]);
  const image = getImageById(db, params.id);

  if (!image) {
    return NextResponse.json({ message: "Image not found." }, { status: 404 });
  }

  const payload = (await request.json().catch(() => ({}))) as UpdatePayload;
  const category =
    typeof payload.category === "string"
      ? normalizeLabel(payload.category)
      : normalizeLabel(image.category);
  const tags = normalizeTags(payload.tags ?? image.tags);
  const searchableText = buildSearchableText(image, category, tags);
  const provider = createAiProvider(config);
  const embedding = provider.enabled
    ? await provider.embedText(searchableText).catch(() => null)
    : null;
  const updated = updateImageMetadata(db, image.id, {
    category,
    tags,
    searchableText,
    embedding: embedding?.embedding ?? null,
    embeddingModel: embedding?.model ?? null,
    inputTokens: embedding?.usage.inputTokens ?? null,
    totalTokens: embedding?.usage.totalTokens ?? null,
  });

  if (!updated) {
    return NextResponse.json({ message: "Image not found." }, { status: 404 });
  }

  return NextResponse.json({
    image: stripPrivateSearchFields(updated),
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const params = await context.params;
  const db = await getDb();
  const image = getImageById(db, params.id);

  if (!image) {
    return NextResponse.json({ message: "Image not found." }, { status: 404 });
  }

  const paths = new Set(
    [image.current_path, image.preview_path].filter((item): item is string => Boolean(item)),
  );
  for (const relativePath of paths) {
    await rm(resolveContentPath(relativePath), { force: true }).catch(() => undefined);
  }

  deleteImageById(db, image.id);

  return NextResponse.json({
    deleted: true,
    id: image.id,
  });
}
