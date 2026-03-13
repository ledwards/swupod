export function handleMultiSelectSetClick(
  selectedSets: string[],
  setCode: string,
  maxSelections: number
): string[] {
  const index = selectedSets.indexOf(setCode)
  if (index === -1) {
    if (selectedSets.length < maxSelections) {
      return [...selectedSets, setCode]
    }
    return selectedSets
  }

  return [...selectedSets.slice(0, index), ...selectedSets.slice(index + 1)]
}
