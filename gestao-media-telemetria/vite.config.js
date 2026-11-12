import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: [
        "index.html",
        "rankings.html",
        "historico.html",
        "comparativo.html",
        "login.html",
        "admin-users.html",
        "migrar-dados.html",
      ],
      external: [/^https:\/\//],
    },
  },
});
