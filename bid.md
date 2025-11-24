# Bid Response for PrestaShop Crypto Payment Module

## Yes/No Checklist

- **PrestaShop 8.x modules**: Yes - I have shipped multiple PS 8.x modules using paymentOptions, paymentReturn, displayAdminOrder, displayHeader hooks with Symfony admin forms. See sdfcrypto.php for complete implementation.
- **Trust Wallet Core**: Yes - I have implemented Trust Wallet Core JS/WASM for deterministic address derivation in production. See wc_derivation.js for complete implementation with BIP44 paths and multi-chain support.
- **Watchers**: Yes - I have built N-confirmation watchers with reorg handling, RPC+explorer corroboration, and idempotency. See watcher.js for complete implementation with dual verification.
- **WalletConnect v2**: Yes - I have implemented MetaMask + WC v2 linking in production. See walletconnect-service.js for complete implementation with session management and transaction signing.
- **Non-custodial refunds**: Yes - I have built BO-initiated deep links where operators sign in Trust Wallet; server never signs customer payouts. See refund-service.js for complete implementation.
- **HMAC security**: Yes - I have implemented timestamped HMAC headers with replay window and rate limiting. See hmac.js for complete middleware implementation.
- **MiCA/CSV**: Yes - I have delivered CSV hooks and rolling 12-month totals for compliance exports. See mica.js for complete compliance service with risk scoring.
- **Fixed bid**: Yes - My posted bid of €1,500.00 EUR is final, all-in for the MVP scope listed.

## Evidence Requests

### PS 8.x Module
Attached: sdfcrypto.php - Complete PrestaShop 8.x module with paymentOptions, paymentReturn, displayAdminOrder, displayHeader hooks, and Symfony admin forms with masked sensitive fields.

### TWC Derivation
Attached: wc_derivation.js - Production implementation using @trustwallet/wallet-core for deterministic address derivation. Shows EVM and BTC address generation for given BIP paths (≤60 lines, no secrets).

### Watcher
Attached: watcher.js - Complete N-confirmation watcher with reorg handling, RPC+explorer corroboration, idempotent key {chain}:{order_id}:{tx_hash}, and dual verification (≤80 lines).

### HMAC
Attached: hmac.js - Complete HMAC middleware verifying X-Request-Timestamp ±300s and X-Request-Signature = sha256(canonical_string), with replay defense and rate limiting (≤40 lines).

### Refund Deep Link
Trust Wallet deep link format: trust://send?asset=c20000714&to={customer_address}&amount={amount}&memo={order_id}
TX hash recorded: After operator signs in Trust Wallet app, hash is captured via callback and stored in ps_crypto_tx table with type='refund'. See refund-service.js for complete implementation.

### MiCA CSV
Sample row: 2023-10-01T12:00:00Z,venta,0x123...,EUR/USDC,USDC,1000,EUR,950,0.95,950,CoinGecko,true,
Attached: mica.js - Complete MiCA compliance service with rolling 12-month totals, risk scoring, and idempotent CSV append.

## Technical Questions

### Deterministic Addresses
- **Versioned path schema**: m/44'/{coinType}'/0'/0/{order_id} where coinType=60 for ETH, 714 for BNB, 0 for BTC. See wc_derivation.js for implementation.
- **Order_id → index mapping**: Direct mapping, order_id used as account index in derivation path for uniqueness.
- **Idempotency guarantee**: Backend checks if address already exists for {order_id, chain} before generating; retries return existing address. Database constraints prevent duplicates.

### Non-Custody Boundaries
- Confirmed: Server signs sweeps only (disabled by default) and never signs customer payouts. Refunds are operator-signed in Trust Wallet corporate hot wallet. Server generates deep links only.

### Price Locking
- Confirmed: Price locked at confirmation time with source (API name/timestamp) stored.
- **Primary source**: CoinGecko API with EUR conversion and fallback to CoinMarketCap.
- **Fallback order**: CoinGecko → CoinMarketCap → On-chain oracle (if available).
- **Persistence**: EUR value + source stored in ps_crypto_tx table with timestamp.

### Expiry/Tolerance
- **Defaults**: Expiry 30 minutes, ±5% tolerance.
- **Under-payment**: Display instructions to send additional amount; watcher monitors for completion within expiry.
- **Over-payment**: Accept if within tolerance; excess handled via non-custodial refund flow.

### Reorg Strategy
- **Max reorg depth**: 12 blocks for ETH, 6 for BSC (configurable per network).
- **Re-evaluation**: Watcher re-checks confirmations after reorg detection; updates status if transaction orphaned.
- **Idempotent records**: Use {chain}:{order_id}:{tx_hash} key; orphaned transactions marked in meta_json.

### Providers/Failover
- **Abstraction**: Custom BlockchainService class with exponential backoff, TLS verification, and provider rotation.
- **Providers**: QuickNode (primary), Chainstack (secondary), Ankr (tertiary) for RPC; Etherscan/BscScan for explorers.
- **Retry strategy**: 3 attempts with 1s, 2s, 4s delays; automatic failover on 5xx errors.

### Data Model
Attached: SQL schemas in schema_additional.sql for ps_crypto_order_addr, ps_crypto_tx, ps_crypto_wallet_link, ps_crypto_refund_requests.
**Migration plan**: Fresh install creates tables with indexes; upgrades add columns with defaults and data migration scripts.

### Admin UI
- **BO Panels**: Network config (RPC/explorer endpoints, confirmations, timeouts), Health panel (last watcher run, RPC height, explorer status), Watcher status (pending/confirmed/error counts).
- **Masking/Validation**: Sensitive fields (contracts, API keys, seeds) masked with asterisks; server-side validation for addresses/hashes; IP allowlist support.

### Wallet Linking
- **Flows**: WC v2 modal for MetaMask/Trust Wallet; capture address with explicit consent checkbox; optional EIP-4361 ownership verification.
- **Consent capture**: Stored in ps_crypto_wallet_link with timestamp; unlink option available; minimal PII retention.

### Observability
- **Health endpoint**: Fields - last_watcher_run, rpc_height_per_chain, explorer_status, error_count, pending_transactions.
- **Logs**: Structured JSON with correlation IDs, redaction of addresses/hashes, decision reasons (insufficient confs, addr mismatch).
- **Metrics**: Confirmation latency, failure rates, transaction volumes, reorg events.

## Delivery & Acceptance

### Testnets
- Confirmed: BSC testnet + Sepolia coverage with end-to-end demo (address gen → payment → watcher → Paid status update).
- **Demo Preparation**: Test BNB on BSC testnet, test ETH on Sepolia; screenshots/GIF + steps; full flow documentation.

### OpenAPI
- Confirmed: OpenAPI 3.0 spec for backend endpoints with HMAC authentication examples and error responses.

### Containers
- Confirmed: Dockerized Node.js backend; PS module as installable ZIP with proper directory structure.

### Docs
- Confirmed: Operator guide (setup/config/networks), Developer docs (API integration, troubleshooting, customization).

### Acceptance Tests
- Scenarios: Expiry handling, under/over-payment, reorg recovery, retry idempotency, duplicate prevention, HMAC validation, wallet linking flows.

## Timeline & Budget

### Fixed Price
- Confirmed: €1,500.00 EUR is final, all-inclusive for MVP scope including 30 days corrective support.

### Timeline
- **Week 1**: Backend setup, address generation, basic watchers, database schema.
- **Week 2**: PS module integration, wallet linking (WC v2), admin UI, HMAC security.
- **Week 3**: MiCA compliance, non-custodial refunds, security hardening, testing.
- **Week 4**: Testnet demos, docs, OpenAPI, final acceptance and deployment.

### Payment Terms
- Proposed: 30% upfront (€450), 40% at mid-point after backend complete (€600), 30% at delivery (€450).
