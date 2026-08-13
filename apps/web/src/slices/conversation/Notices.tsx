import type { Notice } from "@nexo/contracts/api";
import { Alert } from "../../components/ui/alert";

export function Notices({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="space-y-2">
      {notices.map((notice, index) => (
        <Alert key={`${notice.code}-${index}`}>{notice.message}</Alert>
      ))}
    </div>
  );
}
