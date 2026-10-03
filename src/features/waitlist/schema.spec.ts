import assert from "node:assert/strict";
import { waitlistEmailSchema } from "./schema";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

run("an email is trimmed and lowercased, so case variants are one sign-up", () => {
  assert.equal(waitlistEmailSchema.parse("  Foo.Bar@Example.COM "), "foo.bar@example.com");
});

run("malformed, empty and non-string input is refused", () => {
  for (const value of ["", "   ", "not-an-email", "user@", "@example.com", null, 42, { email: "a@b.in" }]) {
    assert.equal(waitlistEmailSchema.safeParse(value).success, false, JSON.stringify(value));
  }
});

run("an address longer than 254 characters is refused", () => {
  const long = `${"a".repeat(250)}@example.com`;
  assert.equal(waitlistEmailSchema.safeParse(long).success, false);
});
