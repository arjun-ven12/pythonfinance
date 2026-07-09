export default function ApprovalTimeline({ request }) {
  const status = request.status || "PENDING";
  const decidedLabel =
    status === "APPROVED"
      ? "approved"
      : status === "REJECTED"
        ? "rejected"
        : status === "SNOOZED"
          ? "snoozed"
          : status === "EXECUTED"
            ? "executed"
            : null;
  const timeline = [
    {
      label: "created",
      value: request.createdAt,
    },
  ];

  if (decidedLabel && request.decidedAt) {
    timeline.push({
      label: decidedLabel,
      value: request.decidedAt,
    });
  }

  if (status === "EXECUTED" && request.updatedAt && request.updatedAt !== request.decidedAt) {
    timeline.push({
      label: "updated",
      value: request.updatedAt,
    });
  }

  return (
    <div className="approval-timeline">
      {timeline.map((item) => (
        <div key={`${item.label}-${item.value || "none"}`}>
          <span>{item.label}</span>
          <strong>{item.value ? new Date(item.value).toLocaleString() : "-"}</strong>
        </div>
      ))}
    </div>
  );
}
