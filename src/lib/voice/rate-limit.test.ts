import { expect, test } from "bun:test";
import { createWindowLimiter } from "./rate-limit";

test("allows up to the hourly limit, then says when to retry", () => {
  let t = 0;
  const limiter = createWindowLimiter({ perHour: 2, perDay: 10 }, () => t);
  expect(limiter.take("a")).toEqual({ ok: true });
  t = 60_000;
  expect(limiter.take("a")).toEqual({ ok: true });
  expect(limiter.take("a")).toEqual({ ok: false, retryAfterSeconds: 3540 });
  expect(limiter.take("b")).toEqual({ ok: true });
  t = 3_600_000;
  expect(limiter.take("a")).toEqual({ ok: true });
});

test("the daily limit holds across hours", () => {
  let t = 0;
  const limiter = createWindowLimiter({ perHour: 5, perDay: 3 }, () => t);
  for (let i = 0; i < 3; i++) {
    expect(limiter.take("a").ok).toBe(true);
    t += 3_600_000;
  }
  expect(limiter.take("a")).toEqual({ ok: false, retryAfterSeconds: 86_400 - 3 * 3600 });
  t = 86_400_000;
  expect(limiter.take("a").ok).toBe(true);
});
