// An icon is a built-in/legend name or a namespace and one asset name. Keep each
// qualified code together when a field contains several icons. aws, azure and gcp
// are the cloud icon sets (vendor-icons.json).
const NAMESPACES = new Set(['ph', 'aws', 'azure', 'gcp']);
export const normalizeIconCode = (code) => code.trim().replace(/\s+/g, ' ');
export function parseIconCodes(spec) {
  const words = spec.trim().split(/\s+/).filter(Boolean);
  const codes = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    codes.push(NAMESPACES.has(word) && words[i + 1] && !NAMESPACES.has(words[i + 1]) ? `${word} ${words[++i]}` : word);
  }
  return codes;
}
