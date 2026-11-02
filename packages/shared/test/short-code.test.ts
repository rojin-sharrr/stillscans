import { describe, expect, it } from "vitest";
import { checkRequestSchema, updateCodeSchema } from "../src/schemas";
import {
  generateShortCode,
  isReservedShortCode,
  isValidShortCode,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
} from "../src/short-code";

describe("short codes", () => {
  it("generates valid codes of the requested length", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateShortCode();
      expect(code).toHaveLength(SHORT_CODE_LENGTH);
      expect(isValidShortCode(code)).toBe(true);
    }
  });

  it("never uses characters that are easy to misread in print", () => {
    expect(SHORT_CODE_ALPHABET).not.toMatch(/[01ilo]/);
  });

  it("rejects malformed codes", () => {
    for (const bad of ["", "abc", "ABCD", "ab/cd", "abcl", "x".repeat(13), "../etc"]) {
      expect(isValidShortCode(bad)).toBe(false);
    }
  });

  it("accepts the documented example and the smoke-test code", () => {
    expect(isValidShortCode("x7k2")).toBe(true);
    expect(isValidShortCode("test")).toBe(true);
    expect(isReservedShortCode("test")).toBe(true);
  });
});

describe("request schemas", () => {
  it("requires exactly one check input", () => {
    expect(checkRequestSchema.safeParse({ url: "a.com" }).success).toBe(true);
    expect(checkRequestSchema.safeParse({ decodedText: "WIFI:S:x;;" }).success).toBe(true);
    expect(checkRequestSchema.safeParse({}).success).toBe(false);
    expect(checkRequestSchema.safeParse({ url: "a.com", decodedText: "b" }).success).toBe(false);
  });

  it("rejects an empty update", () => {
    expect(updateCodeSchema.safeParse({}).success).toBe(false);
  });
});
