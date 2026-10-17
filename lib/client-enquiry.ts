import { trackConfirmedConversion } from "./analytics";

/** Client-only form submission boundary; analytics never receives the form payload. */
export async function submitEnquiry(payload: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<{ requestId: string }> {
  const response = await fetcher("/api/job-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Užklausos išsaugoti nepavyko.");
  if (data.ok !== true || typeof data.requestId !== "string" || !data.requestId) throw new Error("Užklausos išsaugoti nepavyko.");
  trackConfirmedConversion("enquiry", response, data);
  return { requestId: data.requestId };
}
