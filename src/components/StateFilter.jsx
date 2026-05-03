import { useCallback, useMemo, useState } from 'react'

const StateFilter = ({
  stateCodes = [],
  fallbackStates = [],
  value = new Set(),
  onChange,
}) => {
  const [stateSearch, setStateSearch] = useState('')

  const stateCodeMap = useMemo(
    () => new Map(stateCodes.map((item) => [item.code.toUpperCase(), item.name])),
    [stateCodes],
  )
  const stateOptions = stateCodes.length
    ? stateCodes
    : fallbackStates.map((name) => ({ code: name, name }))

  const findClosestState = useCallback(
    (val) => {
      const query = val.trim().toLowerCase()
      if (!query) return null
      const direct = stateOptions.find(
        (opt) => opt.code.toLowerCase() === query || opt.name.toLowerCase() === query,
      )
      if (direct) return direct

      const startsCode = stateOptions.find((opt) => opt.code.toLowerCase().startsWith(query))
      if (startsCode) return startsCode

      const startsName = stateOptions.find((opt) => opt.name.toLowerCase().startsWith(query))
      if (startsName) return startsName

      const includesName = stateOptions.find((opt) => opt.name.toLowerCase().includes(query))
      if (includesName) return includesName

      return null
    },
    [stateOptions],
  )

  const addStateFilter = useCallback(
    (val) => {
      const match = findClosestState(val)
      if (!match) return
      const normalizedCode = match.code.toUpperCase()
      const next = new Set(value)
      next.add(normalizedCode)
      onChange?.(next)
      setStateSearch(normalizedCode)
    },
    [findClosestState, onChange, value],
  )

  const removeStateFilter = (code) => {
    const next = new Set(value)
    next.delete(code)
    onChange?.(next)
  }

  return (
    <div className="stack">
      <div className="state-typeahead">
        <input
          type="text"
          list="state-codes"
          placeholder="Type code or state name"
          value={stateSearch}
          onChange={(e) => setStateSearch(e.target.value)}
          onBlur={() => {
            const match = findClosestState(stateSearch)
            if (match) setStateSearch(match.code)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addStateFilter(stateSearch)
            }
          }}
        />
        <button type="button" onClick={() => addStateFilter(stateSearch)}>
          Add
        </button>
        <datalist id="state-codes">
          {stateOptions.map((state) => (
            <option key={state.code} value={state.code} />
          ))}
        </datalist>
      </div>
      {value.size > 0 && (
        <div className="filter-chips">
          {Array.from(value).map((code) => (
            <span key={code} className="chip">
              {code} · {stateCodeMap.get(code) || code}
              <button type="button" onClick={() => removeStateFilter(code)} aria-label={`Remove ${code}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <small className="filter-hint">We’ll snap to the closest code from active state codes.</small>
    </div>
  )
}

export default StateFilter
