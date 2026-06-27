import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ssh2 (used by node-ssh) ships native bindings that can't be bundled.
  // Keep it external so it's required from node_modules at runtime.
  serverExternalPackages: ["ssh2", "node-ssh"],
};

export default nextConfig;
