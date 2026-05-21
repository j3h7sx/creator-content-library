import { describe, expect, test } from "bun:test";
import { semanticFileName, slugify } from "@/lib/images/files";

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
});
