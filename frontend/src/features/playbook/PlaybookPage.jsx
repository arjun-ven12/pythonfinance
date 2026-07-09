import PlaybookTab from "../../components/playbook/PlaybookTab";
import { API_BASE_URL } from "../../services/apiClient";

export default function PlaybookPage({
  data,
  error,
  exportError,
  isGeneratingAi,
  onExport,
  onGenerateAi,
  onRefresh,
}) {
  return (
    <PlaybookTab
      apiBaseUrl={API_BASE_URL}
      data={data}
      error={error}
      exportError={exportError}
      isGeneratingAi={isGeneratingAi}
      onExport={onExport}
      onGenerateAi={onGenerateAi}
      onRefresh={onRefresh}
    />
  );
}
