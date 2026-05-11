const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function normalizeHexColor(color: string): string {
  if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
    throw new Error(`Invalid color ${formatColorForError(color)}; expected #RRGGBB`);
  }
  return color.toLowerCase();
}

function formatColorForError(color: unknown): string {
  if (typeof color !== 'string') return String(color);
  return JSON.stringify(color);
}
