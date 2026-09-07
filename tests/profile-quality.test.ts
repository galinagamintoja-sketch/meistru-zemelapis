import { describe, expect, it } from "vitest";
import { profileQualityWarnings } from "../lib/profile-quality";
import type { Specialist } from "../lib/types";

const base = { id: "one", name: "Jonas", town: "Vilnius", description: "Tvarkingai atlieku įvairius statybos darbus klientams visoje Vilniaus apskrityje.", photoUrls: ["/work.webp"] } as Specialist;

describe("profile content quality", () => {
  it("flags missing photos, address-shaped locality, repeated copy and duplicate names", () => {
    const profile = { ...base, photoUrls: [], town: "bažnyčios g.23", description: "Atlieku dažymo darbus. Atlieku dažymo darbus." };
    const duplicate = { ...base, id: "two" };
    expect(profileQualityWarnings(profile, [profile, duplicate])).toEqual(expect.arrayContaining([
      "Trūksta darbų nuotraukų", "Aprašyme kartojasi tas pats sakinys", "Vieša vietovė panaši į adresą", "Yra kitas profilis tokiu pačiu vardu"
    ]));
  });
});
