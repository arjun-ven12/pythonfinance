export default function DeploymentPanel({ deployment }) {
  if (!deployment) {
    return null;
  }

  return (
    <div className="strategy-deployment-card">
      <div>
        <p className="eyebrow">Deployment Score</p>
        <h3>{deployment.score}/100</h3>
        <strong
          className={`deployment-verdict ${deployment.verdict
            .toLowerCase()
            .replaceAll(" ", "-")}`}
        >
          {deployment.verdict}
        </strong>
      </div>
      <ul>
        {deployment.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}
