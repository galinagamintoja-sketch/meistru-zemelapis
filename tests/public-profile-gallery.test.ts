import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const gallery = fs.readFileSync(path.join(process.cwd(), "components/PublicProfileGallery.tsx"), "utf8");
const profile = fs.readFileSync(path.join(process.cwd(), "app/meistrai/[slug]/page.tsx"), "utf8");
const reportForm = fs.readFileSync(path.join(process.cwd(), "components/profile-report-form.tsx"), "utf8");
const adminReports = fs.readFileSync(path.join(process.cwd(), "components/admin-profile-reports.tsx"), "utf8");

describe("public tradesperson profile gallery", () => {
  it("shows a compact hero image beneath the tradesperson name", () => {
    expect(profile).toContain("<PublicProfileGallery");
    expect(gallery).toContain('className="public-profile-hero-photo"');
  });

  it("keeps the compact hero placeholder when a profile has no image", () => {
    expect(gallery).toContain("disabled={!photoUrls.length}");
    expect(gallery).not.toContain("if (!photoUrls.length) return null");
  });

  it("opens every gallery image in an accessible viewer", () => {
    expect(gallery).toContain('role="dialog"');
    expect(gallery).toContain('aria-modal="true"');
    expect(gallery).toContain("setActiveIndex(index)");
    expect(gallery).toContain('event.key === "Escape"');
  });

  it("uses the shared logo and returns to live homepage search results", () => {
    expect(profile).toContain("<LocalProPreviewBrand />");
    expect(profile).toContain('href="/#results"');
  });

  it("lets visitors report a profile and exposes reports to administrators", () => {
    expect(profile).toContain("<ProfileReportForm");
    expect(reportForm).toContain("Pranešti apie profilį");
    expect(reportForm).toContain('fetch("/api/profile-reports"');
    expect(adminReports).toContain('fetch("/api/admin/profile-reports"');
    expect(adminReports).toContain("Pranešimai apie profilius");
    expect(adminReports).toContain("Atidaryti profilį");
  });
});
