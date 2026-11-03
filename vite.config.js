import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project sites live at /repository-name/ rather than /.
// When the GitHub Action runs, GitHub sets GITHUB_REPOSITORY automatically.
const repository = process.env.GITHUB_REPOSITORY || "";
const [owner, repo] = repository.split("/");
const isAccountSite = !!owner && repo?.toLowerCase() === `${owner.toLowerCase()}.github.io`;
const base = process.env.GITHUB_PAGES === "true" && repo && !isAccountSite
  ? `/${repo}/`
  : "/";

export default defineConfig({
  plugins: [react()],
  base,
  server: { host: true }
});
