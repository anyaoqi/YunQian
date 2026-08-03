import { useEffect, useMemo, useState } from 'react';

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

const FALLBACK_SERVICES = [
  (domain: string) => `https://a.favicon.im/${domain}`,
  (domain: string) => `https://${domain}/favicon.ico`,
];

export function Favicon({ faviconUrl, url }: { faviconUrl: string | null; url: string }) {
  const domain = useMemo(() => hostOf(url), [url]);
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (faviconUrl && !faviconUrl.includes('google.com')) list.push(faviconUrl);
    for (const make of FALLBACK_SERVICES) {
      const candidate = make(domain);
      if (!list.includes(candidate)) list.push(candidate);
    }
    return list;
  }, [faviconUrl, domain]);
  const [index, setIndex] = useState(0);

  useEffect(() => { setIndex(0); }, [candidates]);

  if (index >= candidates.length) {
    return <span className="favicon-fallback">{domain.charAt(0).toUpperCase()}</span>;
  }
  return <img src={candidates[index]} alt="" onError={() => setIndex((current) => current + 1)} />;
}
