import { importEatonCatalog } from "./adapters/eaton/index.js";
import { importFixtureCatalog } from "./adapters/fixture/index.js";

interface Args {
  adapter: string;
  source: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const [adapter, ...rest] = argv;
  const sourceIndex = rest.indexOf("--source");
  const outIndex = rest.indexOf("--out");
  if (!adapter || sourceIndex < 0 || !rest[sourceIndex + 1]) {
    throw new Error("Usage: nexo-import <eaton|fixture> --source <dir> --out <postgres-url>");
  }
  const source = rest[sourceIndex + 1];
  const out = outIndex >= 0 ? rest[outIndex + 1] : process.env.CATALOG_DATABASE_URL;
  if (!source || !out) throw new Error("Usage: nexo-import <eaton|fixture> --source <dir> --out <postgres-url>");
  return { adapter, source, out };
}

const args = parseArgs(process.argv.slice(2));

const result = args.adapter === "eaton"
  ? await importEatonCatalog(args.source, args.out)
  : args.adapter === "fixture"
    ? await importFixtureCatalog(args.source, args.out)
    : undefined;

if (!result) {
  throw new Error(`Unknown adapter: ${args.adapter}`);
}

console.log(JSON.stringify(result, null, 2));
