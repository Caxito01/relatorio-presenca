import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  reactCompiler: true,
  /**
   * Gera um site estático para poder hospedar no GitHub Pages
   */
  output: "export",
  /**
   * Ajusta a aplicação para rodar em https://caxito01.github.io/relatorio-presenca
   */
  basePath: isProd ? "/relatorio-presenca" : undefined,
  assetPrefix: isProd ? "/relatorio-presenca/" : undefined,
};

export default nextConfig;
