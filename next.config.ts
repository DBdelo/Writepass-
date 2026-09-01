const nextConfig = {
  output: "export",
  assetPrefix: process.env.NODE_ENV === "production" ? "./" : undefined,
  agentRules: false,
};

export default nextConfig;
