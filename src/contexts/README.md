# React Contexts

React Context providers for shared state management.

## DeckBuilderContext

Provides shared state for DeckBuilder and its sub-components.

### Usage

```jsx
import { useDeckBuilder } from '../contexts/DeckBuilderContext'

function MyComponent() {
  const {
    // Sort options
    deckSortOption,      // 'aspect' | 'cost' | 'type' | 'default'
    setDeckSortOption,
    poolSortOption,
    setPoolSortOption,

    // Selected cards
    leaderCard,          // Currently selected leader
    baseCard,            // Currently selected base

    // Aspect penalties
    showAspectPenalties, // Show/hide penalty indicators

    // Bulk operations
    moveCardsToDeck,     // (cardIds: string[]) => void
    moveCardsToPool,     // (cardIds: string[]) => void
  } = useDeckBuilder()
}
```

### Provider Setup

The context is set up in `DeckBuilder.jsx`:

```jsx
import DeckBuilderContext from '../contexts/DeckBuilderContext'

function DeckBuilder() {
  // ... state setup ...

  return (
    <DeckBuilderContext.Provider value={{
      deckSortOption,
      setDeckSortOption,
      poolSortOption,
      setPoolSortOption,
      leaderCard,
      baseCard,
      showAspectPenalties,
      moveCardsToDeck,
      moveCardsToPool,
    }}>
      {/* Sub-components can access context */}
      <PoolSection />
      <DeckSection />
    </DeckBuilderContext.Provider>
  )
}
```

### Components Using Context

| Component | Values Used |
|-----------|-------------|
| DeckSection | deckSortOption, setDeckSortOption, leaderCard, baseCard, showAspectPenalties, moveCardsToDeck, moveCardsToPool |
| PoolSection | poolSortOption, setPoolSortOption, leaderCard, baseCard, showAspectPenalties, moveCardsToDeck, moveCardsToPool |
| SectionHeader | deckSortOption/poolSortOption (via mode prop) |
| LeaderBaseSelector | leaderCard, baseCard |

## AuthContext

Provides authentication state from Discord OAuth.

### Usage

```jsx
import { useAuth } from '../contexts/AuthContext'

function MyComponent() {
  const {
    user,             // { id, username, avatar } | null
    isAuthenticated,  // boolean
    signIn,           // () => void - Redirects to Discord OAuth
    signOut,          // () => void
    isLoading,        // boolean
  } = useAuth()
}
```

### User Object

```typescript
interface User {
  id: string           // Discord user ID
  username: string     // Discord username
  avatar: string       // Avatar URL
}
```

## Creating New Contexts

1. Create file in `src/contexts/` with `Context` suffix
2. Export context and custom hook
3. Add to `src/contexts/index.js`
4. Add documentation to this README

### Template

```jsx
import { createContext, useContext, useState } from 'react'

const MyContext = createContext()

export function MyProvider({ children }) {
  const [state, setState] = useState(null)

  const value = {
    state,
    setState,
  }

  return (
    <MyContext.Provider value={value}>
      {children}
    </MyContext.Provider>
  )
}

export function useMyContext() {
  const context = useContext(MyContext)
  if (!context) {
    throw new Error('useMyContext must be used within MyProvider')
  }
  return context
}

export default MyContext
```
