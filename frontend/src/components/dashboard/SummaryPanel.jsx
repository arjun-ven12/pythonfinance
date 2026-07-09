import DataCard from "../common/DataCard";

export default function SummaryPanel({ detail, label, tone, value }) {
  return <DataCard detail={detail} label={label} tone={tone} value={value} />;
}
