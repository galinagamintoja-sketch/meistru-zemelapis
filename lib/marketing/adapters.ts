import type { MarketingChannel } from "./types";

export type TransportMessage = {
  queueId: string;
  contactId: string;
  recipient: string;
  body: string;
  idempotencyKey: string;
};

export type TransportResult = {
  state: "accepted" | "sent" | "failed" | "unknown";
  externalMessageId?: string;
  error?: string;
};

export interface MarketingChannelAdapter {
  readonly channel: MarketingChannel;
  capabilities(): Promise<Record<string, boolean>>;
  send(message: TransportMessage): Promise<TransportResult>;
  cancel?(transportJobId: string): Promise<boolean>;
}

export class UnconfiguredAdapter implements MarketingChannelAdapter {
  constructor(readonly channel: MarketingChannel) {}
  async capabilities() { return { send: false, receive: false }; }
  async send(): Promise<TransportResult> {
    return { state: "failed", error: `${this.channel}_adapter_not_configured` };
  }
}
