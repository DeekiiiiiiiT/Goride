import type { ReactNode } from 'react';

/** Lightweight markdown → React for the GCT Knowledge base (headings, tables, lists, callouts). */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[0].startsWith('**')) {
      nodes.push(<strong key={key++}>{m[0].slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <a
          key={key++}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          {m[2]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function parseTable(lines: string[]): ReactNode {
  const rows = lines
    .filter((l) => l.trim().startsWith('|'))
    .map((l) =>
      l
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim()),
    );
  if (rows.length < 2) return null;
  const header = rows[0];
  const body = rows.slice(2); // skip separator
  return (
    <div className="my-4 overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {header.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium">
                {inline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-t">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 align-top text-muted-foreground">
                  {inline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type TocItem = { id: string; title: string; level: 2 | 3 };

export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  for (const line of markdown.split('\n')) {
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h2) {
      const title = h2[1].replace(/^⚠️\s*/, '').replace(/^🚨\s*/, '').trim();
      if (/^table of contents$/i.test(title)) continue;
      items.push({ id: slugify(title), title, level: 2 });
    } else if (h3) {
      const title = h3[1].trim();
      items.push({ id: slugify(title), title, level: 3 });
    }
  }
  return items;
}

export function GctKnowledgeMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let skipToc = false;

  while (i < lines.length) {
    const line = lines[i];

    if (/^##\s+Table of contents\s*$/i.test(line)) {
      skipToc = true;
      i += 1;
      continue;
    }
    if (skipToc) {
      if (/^---\s*$/.test(line) || /^##\s+/.test(line)) {
        skipToc = false;
        if (/^---\s*$/.test(line)) {
          i += 1;
          continue;
        }
      } else {
        i += 1;
        continue;
      }
    }

    if (/^```/.test(line)) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      out.push(
        <pre
          key={`code-${i}`}
          className="my-4 overflow-x-auto rounded-md bg-muted p-4 font-mono text-xs leading-relaxed"
        >
          {code.join('\n')}
        </pre>,
      );
      i += 1;
      continue;
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i += 1;
      }
      out.push(<div key={`tbl-${i}`}>{parseTable(tableLines)}</div>);
      continue;
    }

    if (/^#\s+/.test(line)) {
      // Page title rendered by shell — skip H1
      i += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      const title = line.replace(/^##\s+/, '').trim();
      const id = slugify(title.replace(/^⚠️\s*/, '').replace(/^🚨\s*/, ''));
      out.push(
        <h2
          key={id}
          id={id}
          className="mt-10 scroll-mt-24 border-b pb-2 text-xl font-semibold tracking-tight first:mt-0"
        >
          {inline(title)}
        </h2>,
      );
      i += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      const title = line.replace(/^###\s+/, '').trim();
      const id = slugify(title);
      out.push(
        <h3 key={id} id={id} className="mt-6 scroll-mt-24 text-base font-semibold">
          {inline(title)}
        </h3>,
      );
      i += 1;
      continue;
    }

    if (/^---\s*$/.test(line)) {
      out.push(<hr key={`hr-${i}`} className="my-8 border-border" />);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      const text = quote.join(' ');
      const urgent = /🚨|⚠️/.test(text);
      out.push(
        <blockquote
          key={`bq-${i}`}
          className={`my-4 rounded-md border-l-4 px-4 py-3 text-sm leading-relaxed ${
            urgent
              ? 'border-amber-500 bg-amber-500/10 text-foreground'
              : 'border-muted-foreground/40 bg-muted/40 text-muted-foreground'
          }`}
        >
          {inline(text)}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i += 1;
      }
      out.push(
        <ul key={`ul-${i}`} className="my-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {items.map((item, idx) => (
            <li key={idx}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      out.push(
        <ol
          key={`ol-${i}`}
          className="my-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground"
        >
          {items.map((item, idx) => (
            <li key={idx}>{inline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Paragraph: gather until blank
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|[>\-*]\s|\d+\.\s|```|\|)/.test(lines[i]) && lines[i] !== '---') {
      if (/^---\s*$/.test(lines[i])) break;
      para.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={`p-${i}`} className="my-3 text-sm leading-relaxed text-muted-foreground">
        {inline(para.join(' '))}
      </p>,
    );
  }

  return <div className="max-w-3xl">{out}</div>;
}
