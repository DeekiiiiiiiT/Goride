import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { BookMarked, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import knowledgeMarkdown from './gctKnowledgeBase.md?raw';
import { extractToc, GctKnowledgeMarkdown } from './GctKnowledgeMarkdown';

const KEY_FIGURES = [
  { label: 'Standard rate', value: '15%', note: 'Not the 16.5% in the printed Act' },
  { label: 'Registration threshold', value: 'J$15M', note: 'Rolling 12 months from 1 Apr 2025' },
  { label: 'Return cycle', value: 'Monthly', note: 'Nil returns still required' },
  { label: 'Record retention', value: '6 years', note: 'Matches assessment window' },
];

export function GctKnowledgeBasePage() {
  const [query, setQuery] = useState('');
  const articleRef = useRef<HTMLDivElement>(null);
  const toc = useMemo(() => extractToc(knowledgeMarkdown), []);
  const filteredToc = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return toc.filter((t) => t.level === 2);
    return toc.filter((t) => t.title.toLowerCase().includes(q));
  }, [toc, query]);

  const jumpTo = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const root = articleRef.current;
    const target = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (target && root) {
      const y =
        target.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop -
        12;
      root.scrollTo({ top: y, behavior: 'smooth' });
      window.history.replaceState(null, '', `#${id}`);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Stays put — only the article column scrolls */}
      <aside className="flex max-h-48 w-full shrink-0 flex-col border-b bg-background p-4 lg:max-h-none lg:h-full lg:w-64 lg:border-b-0 lg:border-r">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <BookMarked className="h-4 w-4" />
          Contents
        </div>
        <div className="relative mb-3 shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a section…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {filteredToc.map((item) => (
            <a
              key={`${item.level}-${item.id}`}
              href={`#${item.id}`}
              onClick={jumpTo(item.id)}
              className={`block rounded-md px-2 py-1.5 text-sm hover:bg-muted ${
                item.level === 3 ? 'pl-4 text-muted-foreground' : 'font-medium'
              }`}
            >
              {item.title}
            </a>
          ))}
          {filteredToc.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matching sections.</p>
          )}
        </nav>
      </aside>

      <div ref={articleRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">GCT knowledge base</h1>
            <Badge variant="secondary">Dominion-owned</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Jamaica GCT field guide for operators — registration, rates, credits, filing, and traps.
            Update the in-app guide file when TAJ figures change; this page does not depend on repo
            docs.
          </p>
        </div>

        <Alert>
          <AlertTitle>Not legal or tax advice</AlertTitle>
          <AlertDescription>
            Working reference only. Confirm rates, thresholds, and penalties with Tax Administration
            Jamaica and your accountant before relying on a number. The printed Act still shows
            outdated 16.5% / older thresholds.
          </AlertDescription>
        </Alert>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {KEY_FIGURES.map((f) => (
            <Card key={f.label}>
              <CardHeader className="pb-1">
                <CardDescription>{f.label}</CardDescription>
                <CardTitle className="text-2xl">{f.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{f.note}</CardContent>
            </Card>
          ))}
        </div>

        <GctKnowledgeMarkdown markdown={knowledgeMarkdown} />
      </div>
    </div>
  );
}
