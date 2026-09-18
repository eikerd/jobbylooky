const streetAddress = /\b\d{1,6}\s+(?:[A-Za-z0-9.'’-]+\s+){1,7}(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|parkway|pkwy|lane|ln|way|highway|hwy|court|ct|circle|cir|terrace|ter)\b/i;

export function mapLocations(location: string, body = '') {
  const candidates: { text: string; source: string }[] = [];
  if (location && !/\{|https?:|@/i.test(location)) {
    const embedded = location.match(/\(([^)]*)\)/);
    const text = embedded && streetAddress.test(embedded[1])
      ? `${embedded[1]}, ${location.slice(0, embedded.index).trim()}`
      : location;
    candidates.push({ text, source: 'Job location' });
  }
  const lines = body.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/\[https?:\/\/[^\]]*\]/g, '').trim();
    const match = streetAddress.exec(line);
    if (!match || /^https?:/i.test(line)) continue;
    let text = line.slice(match.index);
    const next = lines[index + 1]?.trim() || '';
    if (/^[A-Za-z .'-]+,?\s+(?:[A-Z]{2})\s+\d{5}(?:-\d{4})?$/.test(next)) text += `, ${next}`;
    candidates.push({ text, source: 'Address in email' });
  }
  const seen = new Set<string>();
  return candidates.flatMap(({ text, source }) => {
    const query = text.replace(/\([^)]*\)|\[[^\]]*\]/g, '')
      .replace(/\s*[:–]\s*\d+\s*days?.*$/i, '')
      .replace(/\s+/g, ' ').trim();
    const match = streetAddress.exec(query);
    if (!match || /https?:|@|[<>{}]/i.test(query)) return [];
    const identity = match[0].toLowerCase().replace(/[.,]/g, '');
    if (seen.has(identity)) return [];
    seen.add(identity);
    const embed = (type: string) => `https://maps.google.com/maps?${new URLSearchParams({ q: query, t: type, z: '17', output: 'embed' })}`;
    return [{ query, source, link: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, embed: embed('k'), streetMap: embed('m') }];
  }).slice(0, 5);
}
