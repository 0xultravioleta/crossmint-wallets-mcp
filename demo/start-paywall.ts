import { startPaywallServer } from "./paywall-server.js";

startPaywallServer().catch((err) => {
  console.error("[paywall] fatal:", err);
  process.exit(1);
});
