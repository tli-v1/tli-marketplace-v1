const TextInput = ({ label, value, onChange, type = 'text', ...props }) => (
  <label className="form-field">
    <span>{label}</span>
    <input type={type} value={value} onChange={(event) => onChange(event.target.value)} {...props} />
  </label>
)

export default TextInput
