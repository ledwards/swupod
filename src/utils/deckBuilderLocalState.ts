export function buildDeckBuilderUiStorageState(state: Record<string, unknown>): Record<string, unknown> {
  const {
    deckCardIds,
    sideboardCardIds,
    activeLeader,
    activeBase,
    playShareId,
    viewMode,
    aspectFilters,
    inAspectFilter,
    outAspectFilter,
    poolSortOption,
    deckSortOption,
    poolCardDensity,
    deckCardDensity,
    leadersBasesExpanded,
    leadersExpanded,
    basesExpanded,
    deckExpanded,
    sideboardExpanded,
    deckAspectSectionsExpanded,
    sideboardAspectSectionsExpanded,
    deckCostSectionsExpanded,
    sideboardCostSectionsExpanded,
    deckGroupsExpanded,
    poolGroupsExpanded,
    showAspectPenalties,
    showDeckAspectPenalties,
    showPoolAspectPenalties,
    tableSort,
    arenaFilters,
    arenaSearchQuery,
    sessionId,
    poolName,
  } = state

  return {
    deckCardIds,
    sideboardCardIds,
    activeLeader,
    activeBase,
    playShareId,
    viewMode,
    aspectFilters,
    inAspectFilter,
    outAspectFilter,
    poolSortOption,
    deckSortOption,
    poolCardDensity,
    deckCardDensity,
    leadersBasesExpanded,
    leadersExpanded,
    basesExpanded,
    deckExpanded,
    sideboardExpanded,
    deckAspectSectionsExpanded,
    sideboardAspectSectionsExpanded,
    deckCostSectionsExpanded,
    sideboardCostSectionsExpanded,
    deckGroupsExpanded,
    poolGroupsExpanded,
    showAspectPenalties,
    showDeckAspectPenalties,
    showPoolAspectPenalties,
    tableSort,
    arenaFilters,
    arenaSearchQuery,
    sessionId,
    poolName,
  }
}

export function safeLocalStorageSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (error) {
    console.warn(`Failed to persist localStorage key "${key}":`, error)
    return false
  }
}
