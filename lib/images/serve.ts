import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { ImageRecord } from "@/lib/db/images";
import { extensionToMime, resolveContentPath } from "./files";

function contentDispositionAttachment(filename: string): string {
  const safe = filename.replace(/["\\\r\n]/g, "_");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function imageFileResponse(input: {
  image: ImageRecord;
  kind: "preview" | "file" | "download";
}): Promise<Response> {
  const relativePath =
    input.kind === "preview" ? input.image.preview_path ?? input.image.current_path : input.image.current_path;
  const absolutePath = resolveContentPath(relativePath);
  const fileStats = await stat(absolutePath);
  const bytes = await readFile(absolutePath);
  const mime = input.kind === "preview" ? extensionToMime(absolutePath) : input.image.mime_type ?? extensionToMime(absolutePath);

  const headers = new Headers({
    "Content-Type": mime,
    "Content-Length": fileStats.size.toString(),
    "Cache-Control": "private, max-age=3600",
  });

  if (input.kind === "download") {
    headers.set(
      "Content-Disposition",
      contentDispositionAttachment(path.basename(input.image.current_path)),
    );
  } else {
    headers.set("Content-Disposition", "inline");
  }

  return new NextResponse(bytes, {
    status: 200,
    headers,
  });
}

export function notFoundImageResponse(): Response {
  return NextResponse.json({ error: "Image not found" }, { status: 404 });
}
