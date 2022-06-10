import * as path from "https://deno.land/std@0.141.0/path/mod.ts";

export {
  path
};

export async function readFile(filepath: string): Promise<string> {
  const decoder = new TextDecoder("utf8");

  return await decoder.decode(await Deno.readFile(filepath));
}

export function readFileSync(filepath: string): string {
  const decoder = new TextDecoder("utf8");

  return decoder.decode(Deno.readFileSync(filepath));
}

export async function writeFile(filepath: string, data: string = ""): Promise<void> {
  const encoder = new TextEncoder();

  await Deno.writeFile(filepath, await encoder.encode(data), { create: true });
}

export async function mkdir(filepath: string, options?: Deno.MkdirOptions) {
  await Deno.mkdir(filepath, options);
}

export async function exists(filepath: string) {
  try {
    await Deno.stat(filepath)

    return true;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound || err instanceof Error) {
      return false;
    } else {
      throw err;
    }
  }
}