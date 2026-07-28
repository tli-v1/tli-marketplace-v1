const MultiSelectDropdown = ({ label, options, value, onChange, placeholder = 'Select options' }) => {
  const selectedLabels = options
    .filter((option) => value.includes(option.value))
    .map((option) => option.label)

  return (
    <div className="multi-select-field full">
      <span>{label}</span>
      <details className="multi-select">
        <summary>
          <span>{selectedLabels.length ? `${selectedLabels.length} selected` : placeholder}</span>
          <strong aria-hidden="true">v</strong>
        </summary>
        <div className="multi-select-menu">
          {options.map((option) => (
            <label key={option.value}>
              <input type="checkbox" checked={value.includes(option.value)} onChange={() => onChange(option.value)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </details>
      {selectedLabels.length > 0 && (
        <div className="selected-tags" aria-label={`Selected ${label}`}>
          {selectedLabels.map((selected) => (
            <span key={selected}>{selected}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default MultiSelectDropdown
