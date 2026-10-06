import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ExactCardanoFacilitatorConfig,
  CardanoSettlementClaim,
} from "@x402/cardano/exact/facilitator";
type Store = NonNullable<ExactCardanoFacilitatorConfig["settlementStore"]>;
type RecordState = {
  txHash: string;
  ownerToken: string;
  processId: string;
  state: "in-flight" | "submitted" | "rejected";
};
const processId = randomUUID();
// Single-process durable guard. A crash during submission is uncertain; a new
// process observes the old transaction instead of authorizing another broadcast.
export class FileSettlementStore implements Store {
  constructor(
    private readonly root = join(process.cwd(), ".agentos", "settlement"),
  ) {
    mkdirSync(root, { recursive: true });
  }
  private file(hash: string) {
    if (!/^[0-9a-f]{64}$/.test(hash))
      throw new Error("Invalid settlement hash");
    return join(this.root, hash + ".json");
  }
  private read(hash: string): RecordState | undefined {
    const file = this.file(hash);
    return existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as RecordState)
      : undefined;
  }
  private write(record: RecordState) {
    const file = this.file(record.txHash);
    writeFileSync(file + ".tmp", JSON.stringify(record), { mode: 0o600 });
    renameSync(file + ".tmp", file);
  }
  async claimSettlement(claim: CardanoSettlementClaim) {
    if (claim.termsDigest)
      throw new Error("Escrow settlement is not implemented");
    const record = this.read(claim.txHash);
    if (record) {
      if (record.state === "in-flight")
        return record.processId === processId
          ? ("in-flight" as const)
          : ("submitted" as const);
      return record.state;
    }
    this.write({ ...claim, processId, state: "in-flight" });
    return "fresh" as const;
  }
  async markSubmitted(txHash: string, ownerToken: string) {
    const record = this.read(txHash);
    if (record?.ownerToken === ownerToken) {
      record.state = "submitted";
      this.write(record);
    }
  }
  async markRejected(txHash: string, ownerToken: string) {
    const record = this.read(txHash);
    if (record?.ownerToken === ownerToken) {
      record.state = "rejected";
      this.write(record);
    }
  }
  async releaseClaim(txHash: string, ownerToken: string) {
    const record = this.read(txHash);
    if (
      record?.ownerToken === ownerToken &&
      record.state === "in-flight" &&
      record.processId === processId
    )
      unlinkSync(this.file(txHash));
  }
}
