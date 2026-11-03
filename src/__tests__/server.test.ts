// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type RequestListener, type Server } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

/**
 * Exercises the actual production server (app.js) against an isolated
 * fixture directory, independent of whether `dist/` has been built yet.
 * This is a regression check for the express/body-parser/qs/proxy-addr
 * dependency chain that Dependabot/Trivy updates most often touch.
 */
describe("production server (app.js)", () => {
    let server: Server;
    let baseUrl: string;
    let fixtureDir: string;

    beforeAll(async () => {
        fixtureDir = mkdtempSync(path.join(tmpdir(), "erditor-static-"));
        writeFileSync(path.join(fixtureDir, "index.html"), "<!doctype html><title>ER Editor</title>");

        process.env.STATIC_DIR = fixtureDir;
        const app = (await import("../../app.js")).default as RequestListener;

        server = createServer(app);
        await new Promise<void>((resolve) => server.listen(0, resolve));
        const { port } = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        delete process.env.STATIC_DIR;
        rmSync(fixtureDir, { recursive: true, force: true });
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("serves the static fixture file with a 200 and the right content", async () => {
        const res = await fetch(`${baseUrl}/index.html`);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain("<title>ER Editor</title>");
    });

    it("returns 404 for a path that does not exist in the static directory", async () => {
        const res = await fetch(`${baseUrl}/does-not-exist.html`);
        expect(res.status).toBe(404);
    });
});
