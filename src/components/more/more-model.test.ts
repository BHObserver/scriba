import { describe, expect, test } from "bun:test";
import { makeI18n } from "@/lib/i18n/format";
import { openingSub } from "./more-model";

describe("morning cash", () => {
  test("says where today's morning cash came from", () => {
    const bn = makeI18n("bn");
    const en = makeI18n("en");
    expect(openingSub({ poisha: 150000, source: "usual", date: null }, "2026-11-01", bn)).toBe("রোজ যত টাকা দিয়ে দিন শুরু করেন");
    expect(openingSub({ poisha: 432000, source: "counted", date: "2026-10-31" }, "2026-11-01", bn)).toBe("কাল দিন বন্ধের সময় গোনা টাকা");
    expect(openingSub({ poisha: 432000, source: "counted", date: "2026-10-29" }, "2026-11-01", en)).toBe("Counted when you closed 29 Oct");
    expect(openingSub({ poisha: 432000, source: "closed", date: "2026-11-01" }, "2026-11-01", en)).toBe("What today started with");
  });
});
