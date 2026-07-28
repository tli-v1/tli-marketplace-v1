const CheckboxGroup = ({ label, options, value, onChange }) => (
  <fieldset className="checkbox-group full">
    <legend>{label}</legend>
    <div className="choice-grid">
      {options.map((option) => (
        <label key={option.value}>
          <input type="checkbox" checked={value.includes(option.value)} onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  </fieldset>
)

export default CheckboxGroup
