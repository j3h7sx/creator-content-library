import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "@/lib/config/defaults";
import { semanticFileName, slugify, walkImageFiles } from "@/lib/images/files";

describe("image filename helpers", () => {
  test("slugify keeps filenames readable and stable", () => {
    expect(slugify("Woman mirror selfie, green sweatsuit + mug!")).toBe(
      "woman-mirror-selfie-green-sweatsuit-mug",
    );
  });

  test("semanticFileName appends a hash prefix", () => {
    expect(
      semanticFileName({
        caption: "Woman mirror selfie green sweatsuit mug",
        originalPath: "IMG_1234.JPG",
        sha256: "a1b2c3d4e5f60000",
      }),
    ).toBe("woman-mirror-selfie-green-sweatsuit-mug__a1b2c3d4e5.jpg");
  });

  test("walkImageFiles accepts individual file scan roots", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "content-library-images-"));
    const imagePath = path.join(dir, "upload.jpg");

    try {
      await writeFile(imagePath, new Uint8Array([1, 2, 3]));
      const files = await walkImageFiles([imagePath], DEFAULT_CONFIG);

      expect(files).toHaveLength(1);
      expect(files[0]?.absolutePath).toBe(imagePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
