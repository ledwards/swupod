import Button from '../Button'
export type UnfinishedItem = {
  id: string
  label: string
  action: string
  href: string
  imageUrl: string | null
  artKind: 'leader' | 'set'
}
export default function UnfinishedRow({
  item,
  onContinue,
}: {
  item: UnfinishedItem
  onContinue: () => void
}) {
  const separator = item.label.lastIndexOf(' · ')
  const title = separator < 0 ? item.label : item.label.slice(0, separator)
  const status = separator < 0 ? '' : item.label.slice(separator + 3)
  return (
    <div className={`entry-resume-row entry-unfinished-row entry-unfinished-${item.artKind}`}>
      {item.imageUrl && (
        <div
          className="entry-unfinished-art"
          aria-hidden="true"
          style={{ backgroundImage: `url("${item.imageUrl}")` }}
        />
      )}
      <div className="entry-unfinished-copy">
        <strong>{title}</strong>
        {status && <span>{status}</span>}
      </div>
      <Button onClick={onContinue}>{item.action}</Button>
    </div>
  )
}
