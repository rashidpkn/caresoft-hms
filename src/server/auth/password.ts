import argon2 from "argon2";
import { badRequest } from "../errors";

const MIN_LENGTH = 10;

export function validatePasswordPolicy(password: string): void {
  if (password.length < MIN_LENGTH) {
    throw badRequest(`Password must be at least ${MIN_LENGTH} characters`);
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw badRequest("Password must include upper, lower, and numeric characters");
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordPolicy(password);
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
