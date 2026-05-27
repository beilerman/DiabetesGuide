import changelogText from '../../CHANGELOG.md?raw'

export default function Changelog() {
  const entries = parseChangelog(changelogText)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Release Notes</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-950">Changelog</h1>
        <p className="mt-3 text-stone-600">
          Public changes are rendered directly from the project CHANGELOG.md file.
        </p>
      </div>

      <div className="space-y-4">
        {entries.map(entry => (
          <ChangelogLine key={`${entry.kind}-${entry.text}`} entry={entry} />
        ))}
      </div>
    </div>
  )
}

interface ChangelogEntry {
  kind: 'section' | 'subsection' | 'bullet' | 'text'
  text: string
}

function parseChangelog(markdown: string): ChangelogEntry[] {
  return markdown
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && line !== '# Changelog')
    .map(line => {
      if (line.startsWith('## ')) return { kind: 'section', text: line.slice(3) } satisfies ChangelogEntry
      if (line.startsWith('### ')) return { kind: 'subsection', text: line.slice(4) } satisfies ChangelogEntry
      if (line.startsWith('- ')) return { kind: 'bullet', text: line.slice(2) } satisfies ChangelogEntry
      return { kind: 'text', text: line } satisfies ChangelogEntry
    })
}

function ChangelogLine({ entry }: { entry: ChangelogEntry }) {
  switch (entry.kind) {
    case 'section':
      return <h2 className="pt-2 text-xl font-bold text-stone-950">{entry.text}</h2>
    case 'subsection':
      return <h3 className="text-base font-bold uppercase tracking-wide text-stone-600">{entry.text}</h3>
    case 'bullet':
      return (
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-sm">
          <span aria-hidden="true" className="mr-2 text-teal-700">•</span>
          {entry.text}
        </div>
      )
    case 'text':
    default:
      return <p className="text-sm text-stone-600">{entry.text}</p>
  }
}
