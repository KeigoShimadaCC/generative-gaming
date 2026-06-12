import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
export type ArtifactFsAdapter = {
  readonly makeDir: (path: string) => void;
  readonly writeNewFile: (path: string, contents: string) => void;
  readonly writeFile: (path: string, contents: string) => void;
  readonly readFile: (path: string) => string;
  readonly fileExists: (path: string) => boolean;
  readonly rename: (from: string, to: string) => void;
  readonly listEntries: (path: string) => readonly string[];
  readonly isDirectory: (path: string) => boolean;
};

export const trimTrailingSlash = (value: string): string =>
  value.replace(/\/+$/g, "");

export const nodeArtifactFsAdapter: ArtifactFsAdapter = {
  makeDir: (path) => {
    mkdirSync(path, { recursive: true });
  },
  writeNewFile: (path, contents) => {
    writeFileSync(path, contents, { encoding: "utf8", flag: "wx" });
  },
  writeFile: (path, contents) => {
    writeFileSync(path, contents, { encoding: "utf8" });
  },
  readFile: (path) => readFileSync(path, { encoding: "utf8" }),
  fileExists: (path) => {
    try {
      statSync(path);
      return true;
    } catch {
      return false;
    }
  },
  rename: (from, to) => {
    renameSync(from, to);
  },
  listEntries: (path) => readdirSync(path),
  isDirectory: (path) => statSync(path).isDirectory(),
};

export class MemoryArtifactFs implements ArtifactFsAdapter {
  readonly dirs = new Set<string>();
  readonly files = new Map<string, string>();

  makeDir(path: string): void {
    this.dirs.add(path);
  }

  writeNewFile(path: string, contents: string): void {
    if (this.files.has(path)) {
      throw new Error(`file already exists: ${path}`);
    }
    this.files.set(path, contents);
  }

  writeFile(path: string, contents: string): void {
    this.files.set(path, contents);
  }

  readFile(path: string): string {
    const contents = this.files.get(path);
    if (contents === undefined) {
      throw new Error(`file does not exist: ${path}`);
    }
    return contents;
  }

  fileExists(path: string): boolean {
    return this.files.has(path);
  }

  rename(from: string, to: string): void {
    const contents = this.files.get(from);
    if (contents === undefined) {
      throw new Error(`file does not exist: ${from}`);
    }
    this.files.set(to, contents);
    this.files.delete(from);
  }

  listEntries(path: string): readonly string[] {
    const prefix = `${path}/`;
    const entries = new Set<string>();

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) {
        continue;
      }
      const remainder = filePath.slice(prefix.length);
      const [entry] = remainder.split("/");
      if (entry !== undefined && entry.length > 0) {
        entries.add(entry);
      }
    }

    for (const dirPath of this.dirs) {
      if (!dirPath.startsWith(prefix)) {
        continue;
      }
      const remainder = dirPath.slice(prefix.length);
      const [entry] = remainder.split("/");
      if (entry !== undefined && entry.length > 0) {
        entries.add(entry);
      }
    }

    return [...entries].sort();
  }

  isDirectory(path: string): boolean {
    if (this.dirs.has(path)) {
      return true;
    }

    const prefix = `${path}/`;
    return [...this.files.keys(), ...this.dirs].some((candidate) =>
      candidate.startsWith(prefix),
    );
  }
}
