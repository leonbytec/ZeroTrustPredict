# ZeroTrustPredict

ZeroTrustPredict is a fully homomorphic encryption (FHE) powered prediction market. Creators launch markets with two to six options, participants stake the encrypted PredictCoin (ERC-7984) token, and every choice, tally, and stake remains encrypted end to end. The protocol proves that interactions happened without exposing who picked what or how much they staked.

## Highlights
- Private by default: option selections, stake sizes, and tallies stay encrypted on-chain through Zama FHEVM.
- Verifiable flow: PredictCoin transfers are enforced in smart contracts, and access control is applied to encrypted state to ensure only the owner or contract can decrypt what they should.
- On-chain UX: users create markets, stake, and review encrypted totals directly from the Sepolia network UI.
- Built for shipping: contracts, deployment scripts, tests, docs, and a production-ready React + Vite frontend (no Tailwind, no environment variables on the frontend).

## Problem This Solves
- Removes guess-the-crowd leakage: observers cannot read interim vote distributions or stake sizes while markets are active.
- Protects strategy: participants can size positions and change picks without revealing preferences.
- Keeps audits simple: all critical logic (limits, staking, activity toggles) executes in contracts, avoiding off-chain trust.

## Core Components
- **ZeroTrustPredict.sol**: manages predictions, enforces 2–6 options, records encrypted counts/stakes per option, and tracks user-specific encrypted stakes/choices. Creators can toggle markets on/off; only active markets accept selections.
- **PredictCoin.sol**: ERC-7984 confidential token with a faucet for test minting. Provides `confidentialTransferFrom` for encrypted stake movement.
- **Frontend (`src/`)**: React + Vite app using RainbowKit for wallets, `viem` for reads, and `ethers` for writes. The UI handles encrypted inputs/proofs via the Zama relayer SDK, lists live markets, and lets users create predictions, faucet PCoin, and place encrypted selections.
- **Docs (`docs/`)**: Zama contract guide (`zama_llm.md`) and relayer/frontend guidance (`zama_doc_relayer.md`).
- **Deployment (`deploy/`)**: Hardhat-deploy script wiring PredictCoin and ZeroTrustPredict.
- **Tests (`test/`)**: Hardhat + Chai coverage for creation, staking, encrypted tallies, and permission checks.

## Architecture at a Glance
- **Encryption flow**: the frontend builds encrypted option indices and stake amounts with the Zama gateway/relayer SDK, passes proofs to `placeEncryptedSelection`, and contracts update encrypted tallies. Access control uses `FHE.allowThis` for contract logic and `FHE.allow` for user-readable ciphertexts.
- **Data layout**: predictions store metadata, option labels, encrypted selection counts, encrypted stake sums, and a total encrypted stake. Per-user mappings keep the last encrypted choice and cumulative stake.
- **Token flow**: every selection calls `confidentialTransferFrom` on PredictCoin to move encrypted stake into the prediction contract before updating tallies.

## Advantages
- End-to-end confidentiality for every market interaction.
- Deterministic, auditable Solidity logic with explicit bounds (2–6 options) and creator-controlled activation.
- Unified token model: PredictCoin funds every stake and supports encrypted balance reads.
- Composable: ABIs live in `deployments/sepolia` and are shared with the frontend; reads and writes split across `viem`/`ethers` for efficiency.

## Tech Stack
- Solidity 0.8.27 with Zama FHEVM libraries and ERC-7984 confidential token standard.
- Hardhat, `hardhat-deploy`, TypeChain, and the Zama Hardhat plugin for encrypted test inputs.
- React 18 + Vite, TypeScript, RainbowKit, `viem` (reads), `ethers` (writes), and React Query.
- Node.js 20+, npm package management.

## Repository Layout
- `contracts/`: PredictCoin and ZeroTrustPredict contracts.
- `deploy/`: deployment script wiring PredictCoin into ZeroTrustPredict.
- `deployments/`: network artifacts and ABIs (use these for the frontend).
- `tasks/`: Hardhat tasks (accounts, FHECounter reference).
- `test/`: contract tests, including encrypted selection flows.
- `docs/`: Zama FHE and relayer references.
- `src/`: frontend (Vite project) with components, config, and styles.

## Prerequisites
- Node.js 20+ and npm.
- Access to a Sepolia RPC endpoint (Infura recommended).
- A funded Sepolia account for deployments (private key only; no mnemonic).

## Backend Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment (`.env` in the repo root):
   ```
   INFURA_API_KEY=your_infura_key
   PRIVATE_KEY=0xYourPrivateKey  # used for deployments; do not use mnemonics
   ETHERSCAN_API_KEY=optional_for_verification
   ```
3. Compile and test:
   ```bash
   npm run compile
   npm run test
   ```
   Tests use the Zama Hardhat plugin’s mock mode to generate encrypted inputs and verify decrypted results.

## Deployment
- **Local (Hardhat)**:
  ```bash
  npx hardhat node
  npx hardhat deploy --network hardhat
  ```
- **Sepolia**:
  ```bash
  npx hardhat deploy --network sepolia
  npx hardhat verify --network sepolia <ZeroTrustPredict_address> <PredictCoin_address_optional_if_needed>
  ```
  After deployment, copy the generated ABIs from `deployments/sepolia/*.json` into the frontend config and update contract addresses.

## Frontend Setup (`src/`)
1. Install frontend dependencies:
   ```bash
   cd src
   npm install
   ```
2. Set contract details in `src/src/config/contracts.ts`:
   - Replace the zero addresses with the Sepolia addresses from `deployments/sepolia/ZeroTrustPredict.json` and `PredictCoin.json`.
   - Keep ABIs sourced from `deployments/sepolia` to stay in sync with the contracts.
3. Run the app:
   ```bash
   npm run dev
   ```
   The app targets Sepolia (no localhost or frontend environment variables).

## User Flows
- **Create a prediction**: wallet connects via RainbowKit, user provides a title plus 2–6 option labels, contract stores encrypted tallies initialized to zero.
- **Fund with PredictCoin**: faucet on PredictCoin mints encrypted tokens for testing; users grant operator permissions to ZeroTrustPredict before staking.
- **Place encrypted selection**: frontend encrypts option index and stake, sends proofs to `placeEncryptedSelection`, and the contract updates encrypted counts, per-user stake, and totals.
- **Inspect markets**: list active markets, view encrypted counts/stakes per option, see total encrypted stake, and retrieve user-specific encrypted stake/choice handles for decryption through the relayer.

## Security & Privacy Notes
- Enforced option bounds (2–6) and creator-only activation toggles prevent malformed markets.
- All tallies and stakes stay encrypted; access control uses `FHE.allowThis`/`FHE.allow` to scope decryption.
- PredictCoin transfers happen inside the market call, ensuring stakes always move before tallies update.

## Roadmap
- Settlement and rewards: add outcome resolution, encrypted reward calculations, and claim flows.
- Governance and risk controls: market pause/close policies, creator bonding, and dispute hooks.
- Expanded analytics: user-facing decrypted snapshots under permission, historical charts, and event indexing.
- Multi-asset support: allow additional confidential ERC-7984 tokens as collateral.
- Reliability hardening: fuzzing, gas benchmarking, and production relayer deployment guides.

## References
- Zama FHE docs: `docs/zama_llm.md`
- Relayer/frontend guidance: `docs/zama_doc_relayer.md`
- License: BSD-3-Clause-Clear (see `LICENSE`)

ZeroTrustPredict brings privacy-first prediction markets to Ethereum using FHE—ship features rapidly while keeping user choices confidential.
