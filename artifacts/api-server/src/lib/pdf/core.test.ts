import { describe, expect, it } from "vitest";
import { richSpans, stripEmphasis } from "./core";

describe("richSpans", () => {
  it("parses **bold** into styled spans", () => {
    expect(richSpans("a **b** c")).toEqual([
      { text: "a ", bold: false, italic: false },
      { text: "b", bold: true, italic: false },
      { text: " c", bold: false, italic: false },
    ]);
  });

  it("parses *italic* without leaking literal asterisks", () => {
    expect(richSpans("*Met vriendelijke groeten,*")).toEqual([
      { text: "Met vriendelijke groeten,", bold: false, italic: true },
    ]);
  });

  it("parses ***bold italic***", () => {
    expect(richSpans("***x***")).toEqual([{ text: "x", bold: true, italic: true }]);
  });

  it("leaves an unpaired asterisk literal", () => {
    expect(richSpans("2 * 3 = 6")).toEqual([
      { text: "2 * 3 = 6", bold: false, italic: false },
    ]);
  });

  it("returns a single plain span for plain text", () => {
    expect(richSpans("hello")).toEqual([{ text: "hello", bold: false, italic: false }]);
  });
});

describe("stripEmphasis", () => {
  it("removes emphasis markers, keeping the text", () => {
    expect(stripEmphasis("*a* **b** ***c***")).toBe("a b c");
  });
});
