// Railway infrastructure for MyScreener (applied with `railway config apply`).
// Two services built from the same Dockerfile:
//  - web:     the Next.js app (always on; live prices need a long-running server)
//  - refresh: daily data refresh (universe, quotes, enrichment, dedupe, rescore, alerts) as a cron job
// Variables (Supabase keys, APP_PASSWORD, ...) are managed outside this file (`railway variables`),
// so secrets never live in the repo.
import { defineRailway, github, project, service } from "railway/iac";

export const partial = "myscreener";

const source = github("prakharv-ops/myscreener", { branch: "main" });
const build = { builder: "DOCKERFILE", dockerfilePath: "Dockerfile", buildEnvironment: "V3" } as const;

export default defineRailway(() => {
  const web = service("web", {
    source,
    build,
    deploy: {
      healthcheckPath: "/api/health",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
    replicas: { iad: 1 }, // US East: next to the Supabase database
  });

  const refresh = service("refresh", {
    source,
    build,
    deploy: {
      startCommand: "npm run refresh",
      cronSchedule: "30 21 * * *", // 21:30 UTC = 03:00 IST; the Mac backup job runs at 06:30 IST
      restartPolicyType: "NEVER", // a cron run must exit, not be restarted
    },
    replicas: { iad: 1 },
  });

  return project("myscreener", {
    variables: { managed: false },
    resources: [web, refresh],
  });
});
