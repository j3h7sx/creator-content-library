import type { TaxonomyCategory } from "@/lib/config/defaults";
import { slugify } from "@/lib/images/files";

export function normalizeCategorySlug(value: string, taxonomy: TaxonomyCategory[]): string {
  const slug = slugify(value, "uncategorized").replace(/-/g, "_");
  const exact = taxonomy.find((category) => category.slug === slug);
  if (exact) {
    return exact.slug;
  }

  const lower = value.toLowerCase();
  const fuzzy = taxonomy.find(
    (category) =>
      lower.includes(category.slug) ||
      lower.includes(category.label.toLowerCase()) ||
      category.slug.includes(lower.replace(/\s+/g, "_")),
  );

  return fuzzy?.slug ?? "uncategorized";
}

export function categoryLabel(slug: string, taxonomy: TaxonomyCategory[]): string {
  return taxonomy.find((category) => category.slug === slug)?.label ?? slug.replace(/_/g, " ");
}
