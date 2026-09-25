import { describe, expect, it } from "vitest";
import { login } from "@/server/services/auth-service";
import { hashPassword, validatePasswordPolicy } from "@/server/auth/password";

describe("security", () => {
  it("enforces password complexity", () => {
    expect(() => validatePasswordPolicy("short")).toThrow();
    expect(() => validatePasswordPolicy("alllowercase1")).toThrow();
    expect(() => validatePasswordPolicy("Hospital_Demo_1")).not.toThrow();
  });

  it("stores argon2 hashes rather than plaintext", async () => {
    const hash = await hashPassword("Hospital_Demo_1");
    expect(hash.startsWith("$argon2")).toBe(true);
    expect(hash.includes("Hospital_Demo_1")).toBe(false);
  });

  it("does not distinguish missing users from bad passwords", async () => {
    await expect(login({ username: "does-not-exist", password: "Hospital_Demo_1" }, { ip: "2.2.2.2", userAgent: "t" }))
      .rejects.toMatchObject({ message: "Invalid username or password" });
  });
});
