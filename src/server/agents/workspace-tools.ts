import fs from "node:fs";
import path from "node:path";
import { listRepoFiles } from "../context";

/**
 * File tools ForgeAI gives to models that do not ship their own (NVIDIA Nemotron, Google
 * Gemini, any OpenAI-compatible endpoint). Every call is first checked by the tool policy
 * (see policy.ts) and then confined again here using realpath, so symlinks inside the
 * repository cannot be used to reach files outside the workspace.
 */

export type ToolName = "list_files" | "read_file" | "search" | "edit_file" | "write_file";

/** Maps our tool names onto the policy's tool vocabulary. */
export const POLICY_NAME: Record<ToolName, string> = {
  list_files: "Glob",
  read_file: "Read",
  search: "Grep",
  edit_file: "Edit",
  write_file: "Write",
};

const READ_DEFS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List repository files (git-tracked and untracked, ignoring build output). Optionally filter by a glob such as 'src/**/*.ts'.",
      parameters: {
        type: "object",
        properties: { glob: { type: "string", description: "Glob relative to the repository root, e.g. 'src/**/*.js'" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file. Returns numbered lines. Use offset/limit (1-based lines) for large files.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, offset: { type: "integer", minimum: 1 }, limit: { type: "integer", minimum: 1, maximum: 2000 } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Search file contents with a JavaScript regular expression. Returns matching lines as path:line: text.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regular expression" },
          glob: { type: "string", description: "Optional glob to restrict files" },
          ignore_case: { type: "boolean" },
        },
        required: ["pattern"],
      },
    },
  },
] as const;

const WRITE_DEFS = [
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace an exact string in a file. old_string must appear exactly once unless replace_all is true. Include enough surrounding context to make it unique.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create a new file or overwrite an existing one with the full content.",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    },
  },
] as const;

export function toolDefinitions(write: boolean) {
  return write ? [...READ_DEFS, ...WRITE_DEFS] : [...READ_DEFS];
}

/** Converts tool arguments into the shape the policy evaluates. */
export function policyInput(name: ToolName, args: Record<string, unknown>, workspace: string): Record<string, unknown> {
  const p = typeof args.path === "string" ? path.resolve(workspace, args.path) : undefined;
  switch (name) {
    case "read_file":
    case "edit_file":
    case "write_file":
      return { file_path: p ?? "" };
    case "list_files":
      return { pattern: String(args.glob ?? "**/*") };
    case "search":
      return { path: workspace, pattern: String(args.glob ?? "**/*") };
  }
}

export class ToolError extends Error {}

const MAX_OUT = 24_000;
const cap = (s: string) => (s.length > MAX_OUT ? s.slice(0, MAX_OUT) + `\n…[truncated ${s.length - MAX_OUT} chars]` : s);

/** Resolves a user-supplied path and refuses anything whose real location escapes the workspace. */
function confine(workspace: string, rel: unknown, { mustExist }: { mustExist: boolean }): string {
  if (typeof rel !== "string" || !rel.trim()) throw new ToolError("path is required");
  const root = fs.realpathSync(workspace);
  const abs = path.resolve(root, rel);
  let real: string;
  if (fs.existsSync(abs)) real = fs.realpathSync(abs);
  else {
    if (mustExist) throw new ToolError(`File not found: ${rel}`);
    // new file: its closest existing ancestor must be inside the workspace
    let dir = path.dirname(abs);
    while (!fs.existsSync(dir)) dir = path.dirname(dir);
    real = path.join(fs.realpathSync(dir), path.relative(dir, abs));
  }
  if (real !== root && !real.startsWith(root + path.sep)) throw new ToolError(`Path resolves outside the workspace: ${rel}`);
  return real;
}

export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
        i += glob[i + 2] === "/" ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end > i) {
        re += `(?:${glob.slice(i + 1, end).split(",").map((s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&")).join("|")})`;
        i = end;
      } else re += "\\{";
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export async function runTool(name: ToolName, args: Record<string, unknown>, workspace: string): Promise<string> {
  switch (name) {
    case "list_files": {
      const files = await listRepoFiles(workspace);
      const re = args.glob ? globToRegExp(String(args.glob)) : null;
      const hits = re ? files.filter((f) => re.test(f)) : files;
      return hits.length ? cap(hits.slice(0, 800).join("\n") + (hits.length > 800 ? `\n…and ${hits.length - 800} more` : "")) : "No files matched.";
    }
    case "read_file": {
      const file = confine(workspace, args.path, { mustExist: true });
      if (fs.statSync(file).isDirectory()) throw new ToolError(`${args.path} is a directory; use list_files`);
      const lines = fs.readFileSync(file, "utf8").split("\n");
      const start = Math.max(1, Number(args.offset ?? 1));
      const count = Math.min(2000, Number(args.limit ?? 2000));
      const slice = lines.slice(start - 1, start - 1 + count);
      const body = slice.map((l, i) => `${String(start + i).padStart(5)}  ${l}`).join("\n");
      const more = start - 1 + count < lines.length ? `\n…[${lines.length - (start - 1 + count)} more lines; use offset]` : "";
      return cap(body + more);
    }
    case "search": {
      let re: RegExp;
      try {
        re = new RegExp(String(args.pattern ?? ""), args.ignore_case ? "i" : "");
      } catch (e) {
        throw new ToolError(`Invalid regular expression: ${(e as Error).message}`);
      }
      const glob = args.glob ? globToRegExp(String(args.glob)) : null;
      const out: string[] = [];
      for (const f of await listRepoFiles(workspace)) {
        if (glob && !glob.test(f)) continue;
        const full = path.join(workspace, f);
        let text: string;
        try {
          if (fs.statSync(full).size > 400_000) continue;
          text = fs.readFileSync(full, "utf8");
        } catch {
          continue;
        }
        if (text.includes("\u0000")) continue;
        const lines = text.split("\n");
        for (let i = 0; i < lines.length && out.length < 200; i++) if (re.test(lines[i])) out.push(`${f}:${i + 1}: ${lines[i].slice(0, 300)}`);
        if (out.length >= 200) break;
      }
      return out.length ? cap(out.join("\n")) : "No matches.";
    }
    case "edit_file": {
      const file = confine(workspace, args.path, { mustExist: true });
      const oldS = String(args.old_string ?? "");
      const newS = String(args.new_string ?? "");
      if (!oldS) throw new ToolError("old_string must not be empty (use write_file to create files)");
      const text = fs.readFileSync(file, "utf8");
      const count = text.split(oldS).length - 1;
      if (count === 0) throw new ToolError("old_string was not found in the file. Re-read the file and copy the text exactly, including whitespace.");
      if (count > 1 && !args.replace_all) throw new ToolError(`old_string appears ${count} times; add more context or set replace_all`);
      fs.writeFileSync(file, args.replace_all ? text.split(oldS).join(newS) : text.replace(oldS, () => newS));
      return `Edited ${args.path} (${args.replace_all ? count : 1} replacement${count > 1 && args.replace_all ? "s" : ""}).`;
    }
    case "write_file": {
      const file = confine(workspace, args.path, { mustExist: false });
      const content = String(args.content ?? "");
      if (content.length > 1_000_000) throw new ToolError("Content too large");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const existed = fs.existsSync(file);
      fs.writeFileSync(file, content);
      return `${existed ? "Overwrote" : "Created"} ${args.path} (${content.split("\n").length} lines).`;
    }
  }
}
