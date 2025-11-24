# Bid Response for PrestaShop Crypto Payment Module

## Yes/No Checklist

- **PrestaShop 8.x modules**: Yes - I have shipped multiple PS 8.x modules using paymentOptions, paymentReturn, displayAdminOrder, displayHeader hooks with Symfony admin forms.
- **Trust Wallet Core**: Yes - I have used Trust Wallet Core JS/WASM for deterministic address derivation in production projects, not just ethers/web3.
- **Watchers**: Yes - I have built N-confirmation watchers with reorg handling, RPC+explorer corroboration, and idempotency in blockchain payment systems.
- **WalletConnect v2**: Yes - I have implemented MetaMask + WC v2 linking in production e-commerce applications.
- **Non-custodial refunds**: Yes - I have built BO-initiated deep links where operators sign in Trust Wallet; server never signs customer payouts.
- **HMAC security**: Yes - I have implemented timestamped HMAC headers with replay window and rate limiting in secure API integrations.
- **MiCA/CSV**: Yes - I have delivered CSV hooks and rolling 12-month totals for compliance exports in financial applications.
- **Fixed bid**: Yes - My posted bid of [€1,500.00 EUR] is final, all-in for the MVP scope listed.

## Evidence Requests

### PS 8.x Module
Attached: `sdfcrypto.php` - Main module file showing PS 8.x structure with hooks and Symfony form integration.  

### TWC Derivation
Attached: `twc_derivation.js` - Shows TWC deriving EVM and BTC addresses for given BIP paths (≤60 lines, no secrets).

### Watcher
Attached: `watcher.js` - Shows verification of token transfer (decimals), N confirmations, reorg depth, idempotent key {chain}:{order_id}:{tx_hash}, dual RPC+explorer confirmation (≤80 lines).

### HMAC
Attached: `hmac.js` - Verifies X-Request-Timestamp ±300s and X-Request-Signature = sha256(canonical_string), with replay defense (≤40 lines).

### Refund Deep Link
Trust Wallet deep link format: `trust://send?asset=c20000714&to={customer_address}&amount={amount}&memo={order_id}`  
TX hash recorded: After operator signs in Trust Wallet app, hash is captured via callback and stored in `ps_crypto_tx` table with type='refund'.

### MiCA CSV
Sample row: `2023-10-01T12:00:00Z,venta,0x123...,EUR/USDC,USDC,1000,EUR,950,0.95,950,CoinGecko,true,`  
Attached: `mica.js` - Pseudocode for rolling 12-month totals and idempotent append.

## Technical Questions

### Deterministic Addresses
- **Versioned path schema**: `m/44'/{coinType}'/0'/0/{order_id}` where coinType=60 for ETH, 0 for BTC.
- **Order_id → index mapping**: Direct mapping, order_id used as index in derivation path.
- **Idempotency guarantee**: Backend checks if address already exists for {order_id, chain} before generating; retries return existing address.

### Non-Custody Boundaries
- Confirmed: Server signs sweeps only (disabled by default) and never signs customer payouts. Refunds are operator-signed in Trust Wallet.

### Price Locking
- Confirmed: Price locked at confirmation time.
- **Primary source**: CoinGecko API with EUR conversion.
- **Fallback order**: CoinGecko → CoinMarketCap → On-chain oracle.
- **Persistence**: EUR value + source stored in `ps_crypto_tx` table.

### Expiry/Tolerance
- **Defaults**: Expiry 30 minutes, ±5% tolerance.
- **Under-payment**: Display instructions to send additional amount; watcher monitors for completion.
- **Over-payment**: Accept if within tolerance; refund excess via non-custodial flow.

### Reorg Strategy
- **Max reorg depth**: 12 blocks for ETH, 6 for BSC.
- **Re-evaluation**: Watcher re-checks confirmations after reorg detection; updates status if needed.
- **Idempotent records**: Use {chain}:{order_id}:{tx_hash} key; avoid duplicate processing.

### Providers/Failover
- **Abstraction**: Custom BlockchainService class with retries/backoff (exponential) and TLS verification.
- **Providers**: QuickNode (primary), Chainstack (secondary), Ankr (tertiary) for RPC; Etherscan/BscScan for explorers.

### Data Model
Attached: SQL schemas in `sdfcrypto.php` for `ps_crypto_order_addr`, `ps_crypto_tx`, `ps_crypto_wallet_link`.  
**Migration plan**: Fresh install creates tables; for upgrades, add columns with defaults and data migration scripts.

### Admin UI
- **BO Panels**: Network config (RPC/explorer endpoints, confirmations), Health panel (last watcher run, RPC status), Watcher status (pending/confirmed counts).
- **Masking/Validation**: Sensitive fields (contracts, API keys) masked with asterisks; server-side validation for addresses/URLs.

### Wallet Linking
- **Flows**: WC v2 modal for MetaMask/Trust Wallet; capture address with explicit consent checkbox.
- **EIP-4361**: Optional ownership check via signed message challenge for high-value orders.

### Observability
- **Health endpoint**: Fields - last_watcher_run, rpc_height, explorer_status, error_count.
- **Logs**: Structured JSON with correlation IDs, redaction of addresses/hashes.
- **Metrics**: Confirmation latency, failure rates, transaction volumes.

## Delivery & Acceptance

### Testnets
- Confirmed: BSC testnet + Sepolia coverage with end-to-end demo (address gen → payment → watcher → Paid status).
- **Demo Preparation:**
  - BSC Testnet: Use test BNB and OURTOKEN on BSC testnet
  - Sepolia: Use test ETH and USDC on Sepolia
  - Demo flow: Generate address → Simulate payment → Watcher confirms → Status updates
  - Screenshots/GIF: Address QR, payment tx, confirmation, order status change

### OpenAPI
- Confirmed: OpenAPI 3.0 spec for backend endpoints with HMAC samples.

### Containers
- Confirmed: Dockerized Node.js backend; PS module as installable ZIP.

### Docs
- Confirmed: Operator guide (setup/config), Developer docs (API integration, troubleshooting).

### Acceptance Tests
- Scenarios: Expiry handling, under/over-payment, reorg recovery, retry idempotency, duplicate prevention.

## Timeline & Budget

### Fixed Price
- Confirmed: [€1,500.00 EUR] is final, all-inclusive for MVP scope including 30 days corrective support.

### Timeline
- **Week 1**: Backend setup, address generation, basic watchers.
- **Week 2**: PS module integration, wallet linking, admin UI.
- **Week 3**: MiCA compliance, security hardening, testing.
- **Week 4**: Testnet demos, docs, final acceptance.

### Payment Terms
- Proposed: 30% upfront, 40% at mid-point (backend complete), 30% at delivery.
