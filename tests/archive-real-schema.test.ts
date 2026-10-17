import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createGoogleReportingClient } from "../lib/google-reporting";

// Captured STRUCTURE ONLY from the real Viewer-authorized API's empty response.
// No owner credential, access token or production user data is recorded here.
const actualEmptyVisualization = {
  dimensionHeaders: [{ name: "funnelStepName" }],
  metricHeaders: [{ name: "activeUsers", type: "TYPE_INTEGER" }, { name: "activeUsers", type: "TYPE_INTEGER" }],
  metadata: {}
};
it("accepts Google's real empty visualization with repeated identical metric headers", async () => {
  const email = readFileSync("lib/google-reporting.ts", "utf8").match(/^const EMAIL = "([^"]+)";/m)![1];
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const env = {
    GOOGLE_REPORTING_GA4_PROPERTY_ID: "559398175",
    GOOGLE_REPORTING_GSC_SITE_URL: "sc-domain:localpro.lt",
    GOOGLE_REPORTING_CREDENTIALS_JSON: JSON.stringify({ type: "service_account", project_id: "localpro-501816", client_email: email, private_key: privateKey.export({ format: "pem", type: "pkcs8" }) })
  };
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = String(input);
    const body = url.includes("/token") ? { access_token: "fixture-only-token", token_type: "Bearer", expires_in: 3600 }
      : url.includes(":runFunnelReport") ? { funnelVisualization: actualEmptyVisualization }
      : { rows: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  const snapshot = await createGoogleReportingClient({ env, fetch: fetcher }).getSnapshot();
  expect(snapshot.archiveFunnel.status).toBe("success");
  expect(snapshot.status).toBe("success");
  if (snapshot.archiveFunnel.status === "success") {
    expect(snapshot.archiveFunnel.empty).toBe(true);
    expect(snapshot.archiveFunnel.data.rows.map(row => row.activeUsers)).toEqual([0, 0, 0, 0]);
    expect(snapshot.archiveFunnel.data.archiveToClickRate).toBeNull();
    expect(snapshot.archiveFunnel.data.archiveToCompletedRate).toBeNull();
  }
});
