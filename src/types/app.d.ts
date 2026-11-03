declare module "*app.js" {
  import type { RequestListener } from "node:http";
  const app: RequestListener;
  export default app;
}
