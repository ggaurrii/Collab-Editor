const BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript",
  py: "python", json: "json", md: "markdown", html: "html", css: "css", java: "java",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", go: "go", rs: "rust", sh: "shell", sql: "sql",
  yml: "yaml", yaml: "yaml", rb: "ruby", php: "php", kt: "kotlin", swift: "swift",
};

export function languageFor(filename: string): string {
  const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
  return BY_EXT[ext] ?? "plaintext";
}

/** File/folder name rules: 1-255 chars, no slashes or control chars, not . or .. */
export function validName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 255 &&
    name !== "." &&
    name !== ".." &&
    !/[\/\\\u0000-\u001f]/.test(name)
  );
}
