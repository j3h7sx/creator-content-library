import Link from "next/link";
import { existsSync } from "node:fs";
import { ArrowLeft, CheckCircle2, Folder, KeyRound, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { loadConfig, resolveFromRoot } from "@/lib/config/load";
import { getImageStats } from "@/lib/db/images";
import { getDb } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SettingsPage() {
  const [config, db] = await Promise.all([loadConfig(), getDb()]);
  const stats = getImageStats(db);
  const apiKeyConfigured = Boolean(process.env.OPENAI_API_KEY);
  const paths = [
    ["Database", config.databasePath],
    ["Inbox", config.inboxDir],
    ["Originals", config.originalsDir],
    ["Previews", config.previewsDir],
    ["Duplicates", config.duplicatesDir],
  ] as const;

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button asChild variant="ghost" className="mb-3 -ml-3">
              <Link href="/">
                <ArrowLeft />
                Back to library
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-normal">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Local configuration and catalog status for this workspace.
            </p>
          </div>
          <Badge variant={apiKeyConfigured ? "default" : "secondary"} className="w-fit gap-2">
            <KeyRound />
            {apiKeyConfigured ? "OpenAI API key found" : "Manual mode"}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cataloged images</CardTitle>
              <CardDescription>Total non-duplicate records</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{stats.cataloged}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Embeddings</CardTitle>
              <CardDescription>Images available for semantic search</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{stats.withEmbeddings}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Duplicates</CardTitle>
              <CardDescription>Exact duplicate records found or moved</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{stats.duplicates}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings />
              AI configuration
            </CardTitle>
            <CardDescription>
              OpenAI is optional. Without an API key the tool still imports images and supports basic filename/tag search.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Catalog model</p>
              <p className="font-medium">{config.ai.catalogModel}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Embedding model</p>
              <p className="font-medium">{config.ai.embeddingModel}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Folder />
              Local paths
            </CardTitle>
            <CardDescription>All paths are relative to this project unless absolute.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {paths.map(([label, configuredPath]) => {
              const absolute = resolveFromRoot(configuredPath);
              return (
                <div key={label} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-[160px_1fr_auto]">
                  <p className="font-medium">{label}</p>
                  <p className="break-all text-muted-foreground">{configuredPath}</p>
                  <Badge variant={existsSync(absolute) ? "default" : "secondary"} className="w-fit gap-1">
                    <CheckCircle2 />
                    {existsSync(absolute) ? "exists" : "missing"}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taxonomy</CardTitle>
            <CardDescription>
              Customize these categories in content-library.config.json or content-library.config.ts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {config.taxonomy.map((category) => (
                <div key={category.slug} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{category.label}</p>
                    <Badge variant="secondary">{category.slug}</Badge>
                  </div>
                  <Separator className="my-2" />
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
