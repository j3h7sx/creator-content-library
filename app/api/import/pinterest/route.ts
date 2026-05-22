import { NextResponse } from "next/server";
import { startPinterestImportJob } from "@/lib/import/jobs";
import { isPinterestUrl } from "@/lib/pinterest/downloader";

export const runtime = "nodejs";

type PinterestImportPayload = {
  url?: unknown;
  urls?: unknown;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as PinterestImportPayload;
  const boardUrls =
    Array.isArray(payload.urls)
      ? payload.urls.filter((url): url is string => typeof url === "string").map((url) => url.trim())
      : typeof payload.url === "string"
        ? [payload.url.trim()]
        : [];
  const uniqueBoardUrls = [...new Set(boardUrls.filter(Boolean))];

  if (uniqueBoardUrls.length === 0 || uniqueBoardUrls.some((boardUrl) => !isPinterestUrl(boardUrl))) {
    return NextResponse.json(
      { message: "Paste valid Pinterest board URLs." },
      { status: 400 },
    );
  }

  const jobs = await Promise.all(
    uniqueBoardUrls.map((boardUrl) => startPinterestImportJob({ boardUrl })),
  );

  return NextResponse.json(
    {
      job: jobs[0],
      jobs,
      message:
        jobs.length === 1
          ? "Queued Pinterest board for download and cataloging."
          : `Queued ${jobs.length} Pinterest boards for download and cataloging.`,
    },
    { status: 202 },
  );
}
