export default function ApprovalQueueSummary({
  approvalFilter,
  visibleCount,
}) {
  return (
    <div className="alerts-panel-header">
      <div>
        <p className="eyebrow">Approval Queue</p>
        <h2>{visibleCount} {approvalFilter.toLowerCase()}</h2>
      </div>
      <span>Human-in-the-loop paper execution gate</span>
    </div>
  );
}
