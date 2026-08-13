import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface AssetIndex {
  resolve(filename: string | null | undefined): string | null;
}

export function buildAssetIndex(root: string, directories: string[]): AssetIndex {
  const byLowercaseName = new Map<string, string>();

  for (const directory of directories) {
    const absoluteDirectory = join(root, directory);
    for (const entry of walk(absoluteDirectory)) {
      byLowercaseName.set(entry.name.toLowerCase(), relative(root, entry.path));
    }
  }

  return {
    resolve(filename) {
      if (!filename) return null;
      return byLowercaseName.get(filename.toLowerCase()) ?? null;
    }
  };
}

function walk(directory: string): Array<{ name: string; path: string }> {
  const entries: Array<{ name: string; path: string }> = [];
  for (const name of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, name.name);
    if (name.isDirectory()) entries.push(...walk(path));
    if (name.isFile() && statSync(path).isFile()) entries.push({ name: name.name, path });
  }
  return entries;
}
