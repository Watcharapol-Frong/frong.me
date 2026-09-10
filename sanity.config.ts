import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./sanity/schemaTypes";

export default defineConfig({
  name: "frong-me",
  title: "frong.me",
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID || "",
  dataset: import.meta.env.PUBLIC_SANITY_DATASET || "production",
  // The legacy AI panel called the Worker directly from the browser. Keep it
  // disabled until Phase 4 provides an authenticated server-side proxy.
  plugins: [structureTool()],
  schema: {
    types: schemaTypes,
  },
});
