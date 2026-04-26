import { readFileSync } from "node:fs";
import path from "node:path";

const cache = new Map();

export function icon(name) {
  if (cache.has(name)) return cache.get(name);

  try {
    const file = path.resolve(process.cwd(), "node_modules", "lucide-static", "icons", `${name}.svg`);
    const svg = readFileSync(file, "utf8")
      .replace(/<!--[\s\S]*?-->\s*/, "")
      .replace("<svg", '<svg aria-hidden="true" focusable="false"')
      .replace(/class="([^"]*)"/, 'class="icon $1"');

    cache.set(name, svg);
    return svg;
  } catch {
    return "";
  }
}
