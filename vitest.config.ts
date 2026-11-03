import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "jsdom",
        include: ["src/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.test.ts", "src/test/**", "src/types.ts", "src/types/**", "src/index.ts"],
        },
    },
});
