export function errorSummary(error: unknown) {
  let message = error instanceof Error ? error.message : "Request failed";
  for (const [name, value] of Object.entries(process.env)) {
    if (
      value &&
      /KEY|SECRET|TOKEN|MNEMONIC|PASSWORD/.test(name) &&
      value.length >= 8
    )
      message = message.split(value).join("[redacted]");
  }
  return message.slice(0, 1000);
}
