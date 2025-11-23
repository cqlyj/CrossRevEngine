import { serve } from "bun";
import { spawn } from "bun";
import path from "path";
import type { Subprocess } from "bun";

const BASE_DIR = import.meta.dir;
const MOCK_API_DIR = path.join(
  BASE_DIR,
  "chainlink-cre/ghost-liquidity/mock-api"
);
const CRE_DIR = path.join(BASE_DIR, "chainlink-cre/ghost-liquidity");

let mockServerProcess: Subprocess | null = null;

console.log("🚀 CrossRevEngine Demo Server starting...");
console.log(`📂 Project Root: ${BASE_DIR}`);

serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    // 1. Serve index.html
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file(path.join(BASE_DIR, "index.html")));
    }

    // 2. Start Mock Server
    if (url.pathname === "/start-mock") {
      if (mockServerProcess) {
        return new Response(JSON.stringify({ status: "already_running" }));
      }

      console.log("Starting Mock API Server...");
      try {
        mockServerProcess = spawn(["bun", "run", "server.ts"], {
          cwd: MOCK_API_DIR,
          stdout: "inherit",
          stderr: "inherit",
        });

        return new Response(
          JSON.stringify({ status: "started", pid: mockServerProcess.pid })
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ status: "error", message: String(error) }),
          { status: 500 }
        );
      }
    }

    // 3. Run Full Deployment Sequence
    if (url.pathname === "/run-deployment") {
      console.log("Starting Full Deployment Sequence...");

      const stream = new ReadableStream({
        async start(controller) {
          const send = (msg: string) =>
            controller.enqueue(new TextEncoder().encode(msg + "\n"));

          // Helper to run a command and stream output
          const runCommand = async (
            cmd: string,
            args: string[],
            cwd: string,
            label: string
          ) => {
            send(`\n━━━ ${label} ━━━\n`);
            const proc = spawn([cmd, ...args], {
              cwd,
              stdout: "pipe",
              stderr: "pipe",
            });

            const reader = proc.stdout.getReader();
            const decoder = new TextDecoder();

            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              const text = decoder.decode(value);
              controller.enqueue(value);
            }

            const exitCode = await proc.exited;
            if (exitCode !== 0) {
              send(`\n❌ ${label} FAILED (exit code ${exitCode})\n`);
              const errReader = proc.stderr.getReader();
              const { value } = await errReader.read();
              if (value) controller.enqueue(value);
              throw new Error(`${label} failed`);
            } else {
              send(`\n✅ ${label} COMPLETE\n`);
            }
          };

          try {
            // Step 1: CRE Simulation
            await runCommand(
              "bunx",
              [
                "cre",
                "workflow",
                "simulate",
                "ghost-liquidity",
                "--target",
                "staging-settings",
              ],
              CRE_DIR,
              "CHAINLINK CRE SIMULATION"
            );

            // Step 2: Ship Strategy
            const OAQUA_DIR = path.join(BASE_DIR, "oaquaApp");
            await runCommand(
              "make",
              ["send-swap"],
              OAQUA_DIR,
              "SHIPPING GHOST STRATEGY"
            );

            send("\n🎉 DEPLOYMENT_COMPLETE\n");
            controller.close();
          } catch (error) {
            send(`\n💥 CRITICAL ERROR: ${error}\n`);
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/plain" },
      });
    }

    // 4. Run Swap
    if (url.pathname === "/run-swap") {
      const OAQUA_DIR = path.join(BASE_DIR, "oaquaApp");
      console.log("Executing Swap...");

      const proc = spawn(["make", "swap"], {
        cwd: OAQUA_DIR,
        stdout: "pipe",
        stderr: "pipe",
      });

      return new Response(proc.stdout, {
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log("✅ Demo Server running at http://localhost:3000");
