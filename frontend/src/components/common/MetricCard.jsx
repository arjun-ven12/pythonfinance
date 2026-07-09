import DataCard from "./DataCard";

export default function MetricCard({ detail, label, tone, value }) {
  return <DataCard detail={detail} label={label} tone={tone} value={value} />;
}
