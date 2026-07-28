const ApplySection = ({ title, children }) => (
  <section className="apply-section">
    <h2>{title}</h2>
    <div className="apply-grid">{children}</div>
  </section>
)

export default ApplySection
