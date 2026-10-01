import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RESUME_FILE = /\.(?:pdf|docx?)$/i;

/** The newest resume an agent has dropped in the folder, or null when there is none. */
export function latestResume(directory) {
  let names;
  try {
    names = readdirSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return names
    .filter((name) => RESUME_FILE.test(name) && !name.startsWith('.'))
    .map((name) => {
      const stats = statSync(join(directory, name));
      return { name, path: join(directory, name), modifiedAt: stats.mtime.toISOString(), file: stats.isFile() };
    })
    .filter((row) => row.file)
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.name.localeCompare(b.name))
    .map(({ file, ...row }) => row)[0] ?? null;
}
