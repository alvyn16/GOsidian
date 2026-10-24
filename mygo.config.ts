import { defineConfig } from "mygo-cli";

export default defineConfig({
  name: "gosidian",
  identifier: "com.gosidian.app",
  version: "1.0.0",
  icon: "resources/icon.png",
  devUrl: "http://localhost:5173",
  devCommand: "npm run dev:web",
  buildCommand: "npm run build:web",
  frontendDist: "dist",
  bindings: "src/mygo.ts",
  out: "build",
});
