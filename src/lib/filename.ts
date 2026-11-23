const ILLEGAL = /[\\/:*?"<>|]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_LENGTH = 80;

/**
 * Turns a recording title into a safe file name (without extension):
 * strips characters that are illegal on Windows, macOS or Linux and control
 * characters, collapses whitespace, trims, and caps the length at 80 characters.
 */
export function sanitizeFilename(title: string): string {
  let name = title.replace(ILLEGAL, '').replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  // Count code points, not UTF-16 units, so an emoji or accented letter is never cut in half.
  const chars = Array.from(name);
  if (chars.length > MAX_LENGTH) name = chars.slice(0, MAX_LENGTH).join('').trim();
  // Leading dots hide files on macOS/Linux; trailing dots and spaces are invalid on Windows.
  name = name.replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (RESERVED.test(name)) name = `${name} recording`;
  return name || 'recording';
}
