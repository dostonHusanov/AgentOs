# Your remaining integrations

Local dependencies, environment file, mission engine, dashboard, and setup scripts are prepared. Configuration is in `.env.local`; it is ignored by Git and restricted to your user. Do not paste secrets into chat.

Fill only these external values:

| Field                      | What you supply                                       |
| -------------------------- | ----------------------------------------------------- |
| `GEMINI_API_KEY`           | Gemini API key                                        |
| `BLOCKFROST_PROJECT_ID`    | Cardano **Preprod** project ID                        |
| `MANAGER_MNEMONIC`         | Dedicated test buyer wallet recovery phrase, quoted   |
| `RESEARCH_MNEMONIC`        | Separate test research wallet recovery phrase, quoted |
| `RESEARCH_BACKUP_MNEMONIC` | Separate test backup wallet recovery phrase, quoted   |
| `DATA_WALLET_ADDRESS`      | Preprod Data seller recipient                         |
| `REPORT_WALLET_ADDRESS`    | Preprod Report seller recipient                       |

Leave buyer address fields blank initially: `wallet:sync` derives and fills them. It rejects an existing address that differs from its configured recovery phrase. It never prints recovery phrases, signs transactions, or moves funds.

Gemini is selected in your local environment. After adding `GEMINI_API_KEY`, you can check AI without funding wallets:

```bash
npm run ai:check
```

This makes real Gemini structured-output and Google Search requests, but does not sign payments. Your selected model and search features must be available to your API project.

After filling the wallet values:

```bash
npm run wallet:sync
```

Fund the printed buyer addresses with Preprod test ADA and tUSDM. Each should have at least 5 tADA; give Manager 5 tUSDM and each Research buyer at least 0.2 tUSDM. Data and Report only receive funds.

Then:

```bash
npm run setup:live
```

This validates required fields and matching buyer addresses before setting live AI and Cardano mode. Restart the running server after that change:

```bash
npm run dev
```

In a second terminal:

```bash
npm run demo:check
npm run demo:live
```

`demo:live` performs real Preprod transfers and calls Gemini. It requires readiness, verifies completion and a nested hire, and writes confirmed receipts. Setup alone does not prove blockchain settlement.

The application now uses Gemini. Get your API key from https://aistudio.google.com/apikey and add it as `GEMINI_API_KEY`. OpenAI credentials are no longer required. `AI_MODE=gemini` enables live AI independently of Cardano payment mode; use simulated payments to check Gemini before funding wallets.

Native Masumi nodes, four Preprod registrations, direct payments, and completed escrow-backed nested deliveries are live verified. See [live evidence](LIVE_VERIFICATION.md). Seller release remains subject to the dispute window. Follow [MASUMI.md](MASUMI.md). Remote agent execution and browser visual QA remain unfinished. Leave both registry URLs blank to retain local discovery; escrow is enabled only after native identities and buyer wallet scopes pass checks.

## OpenRouter

The local configuration selects `AI_PROVIDER="openrouter"` with `AI_MODE="gemini"`. AI calls use the server-side OpenRouter key from `.env.local` and the configured `OPENROUTER_MODEL`. Google direct mode uses `AI_PROVIDER="google"`. No provider fallback occurs.

OpenRouter supports the structured responses and specialist tool calls used by AgentOS. Web research uses the OpenRouter web-search server tool and requires returned citation annotations; missing citations fail verification. Model and search charges are separate from Cardano payments.

Run `npm run ai:check` to verify structured output and cited web research without wallet signing. Restart the application after changing local configuration. Never commit the key.
