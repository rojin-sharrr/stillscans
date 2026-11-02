import preact from "@astrojs/preact";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://usestillscans.com",
  output: "static",
  trailingSlash: "ignore",
  integrations: [preact()],
});
