import { getImageById } from "@/lib/db/images";
import { getDb } from "@/lib/db/schema";
import { imageFileResponse, notFoundImageResponse } from "@/lib/images/serve";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const db = await getDb();
  const image = getImageById(db, params.id);

  if (!image) {
    return notFoundImageResponse();
  }

  try {
    return await imageFileResponse({ image, kind: "preview" });
  } catch {
    return notFoundImageResponse();
  }
}
