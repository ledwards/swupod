export default function EntryFilterCheckbox({ label, checked, onChange, disabled = false }: {
  label: string
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="entry-complete-filter">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange?.(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
