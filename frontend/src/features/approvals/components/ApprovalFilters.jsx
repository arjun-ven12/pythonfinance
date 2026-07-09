export default function ApprovalFilters({
  approvalCounts,
  approvalFilter,
  onFilterChange,
  statuses,
}) {
  return (
    <div className="approval-filter-bar">
      {statuses.map((status) => (
        <button
          className={approvalFilter === status ? "active" : ""}
          key={status}
          onClick={() => onFilterChange(status)}
          type="button"
        >
          {status}
          <b>{approvalCounts[status] || 0}</b>
        </button>
      ))}
    </div>
  );
}
