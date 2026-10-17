import assert from "node:assert/strict";
import { profileBreadcrumbJsonLd, profileHeading, profilePath, SITE_URL } from "../lib/seo";
import { profileQualityWarnings } from "../lib/profile-quality";
import type { Specialist } from "../lib/types";

async function main() {
  const base = process.env.LOCALPRO_VERIFY_BASE_URL;
  if (!base || !/^https?:\/\//.test(base)) throw Error("Set LOCALPRO_VERIFY_BASE_URL to the intended read-only verification target");
  const response = await fetch(`${base}/api/specialists`);
  assert.equal(response.status, 200);
  const { specialists } = await response.json() as { specialists: Specialist[] };
  assert(specialists.length > 0, "No public profiles to verify");
  const parents = new Set<string>();
  let withParents = 0;
  let labelledPhotos = 0;
  let workPhotos = 0;
  for (const p of specialists) {
    const page: Response = await fetch(`${base}${profilePath(p)}?return=%2F%3Flocality%3Delsewhere%23results`);
    assert.equal(page.status, 200, `Public profile did not render: ${profilePath(p)}`);
    const html: string = await page.text();
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1, "Duplicate/missing profile JSON-LD scripts");
    const data = JSON.parse(scripts[0][1]);
    assert.equal((JSON.stringify(data).match(/"@type":"BreadcrumbList"/g) ?? []).length, 1);
    const breadcrumb = data["@type"] === "BreadcrumbList" ? data : data.breadcrumb;
    const expectedBreadcrumb = profileBreadcrumbJsonLd(p);
    assert(expectedBreadcrumb, "Unexpected ineligible public profile");
    assert.deepEqual(breadcrumb, expectedBreadcrumb);
    if (data["@type"] === "ProfilePage") {
      assert.equal(data.url, `${SITE_URL}${profilePath(p)}`);
      assert.equal(data.name, profileHeading(p));
      assert.equal(data.mainEntity.description, p.description);
      assert.equal(data.mainEntity.jobTitle, undefined);
      const offers = data.mainEntity.makesOffer ?? [];
      for (const offer of offers) assert.equal(offer.itemOffered.category, p.serviceCategoryNames?.[offer.itemOffered.name]);
    }
    assert(html.includes(`<link rel="canonical" href="${SITE_URL}${profilePath(p)}"`), "Profile canonical changed");
    if (breadcrumb.itemListElement.length === 3) {
      withParents++;
      parents.add(breadcrumb.itemListElement[1].item);
    }
    workPhotos += p.photoUrls?.length ?? 0;
    labelledPhotos += p.photoUrls?.filter((url) => Boolean(p.photoLabels?.[url])).length ?? 0;
  }
  for (const parent of parents) {
    // Verify both the preview route and its real canonical production target.
    assert.equal((await fetch(`${base}${new URL(parent).pathname}`)).status, 200, `Preview parent unavailable: ${parent}`);
    assert.equal((await fetch(parent)).status, 200, `Canonical parent unavailable: ${parent}`);
  }
  console.log(JSON.stringify({ target: base, publicProfilesChecked: specialists.length, profilesWithParent: withParents,
    shorterBreadcrumbs: specialists.length - withParents, uniqueAccessibleParents: parents.size, workPhotos,
    labelledPhotos, profilesWithAdvisoryWarnings: specialists.filter((p) => profileQualityWarnings(p, specialists).length).length,
    productionMutations: 0 }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
