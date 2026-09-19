export type MarketingChannel = "telegram" | "email" | "sms";
export type ContactStatus =
  | "new"
  | "contacted"
  | "replied"
  | "interested"
  | "registered"
  | "not_interested"
  | "do_not_contact"
  | "invalid_contact";
export type ImportOutcome =
  | "new"
  | "existing_contact"
  | "update_existing"
  | "needs_review"
  | "conflict"
  | "invalid";

export type ImportMapping = Partial<
  Record<
    | "name"
    | "company"
    | "trade"
    | "area"
    | "phone"
    | "email"
    | "sourceUrl"
    | "groupUrl"
    | "postUrl"
    | "sourceDate",
    string
  >
>;

export type ImportInputRow = Record<string, unknown>;

export type ExistingIdentity = {
  contactId: string;
  type: "phone" | "email";
  normalizedValue: string;
};

export type ImportErrorReportRow = {
  row: number;
  result: string;
  name: string;
  phone: string;
  email: string;
  reason: string;
};

export type ImportPreviewRow = {
  rowNumber: number;
  outcome: ImportOutcome;
  contactId?: string;
  reasons: string[];
  values: {
    name: string;
    company: string;
    trade: string;
    area: string;
    phoneRaw: string;
    phoneNormalized: string | null;
    emailRaw: string;
    emailNormalized: string | null;
    sourceUrl: string;
    groupUrl: string;
    postUrl: string;
    sourceDate: string | null;
  };
};
