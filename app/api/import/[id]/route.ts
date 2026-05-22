import { NextResponse } from "next/server";
import { dismissImportJob, getImportJob } from "@/lib/import/jobs";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getImportJob(id);

  if (!job) {
    return NextResponse.json({ message: "Import job not found." }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await dismissImportJob(id);

  if (!job) {
    return NextResponse.json({ message: "Import job not found." }, { status: 404 });
  }

  if (job.status !== "completed" && job.status !== "failed") {
    return NextResponse.json(
      { message: "Only completed or failed import jobs can be dismissed." },
      { status: 409 },
    );
  }

  return NextResponse.json({ job });
}
