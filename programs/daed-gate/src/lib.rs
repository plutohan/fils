//! daed-gate — attestation-gated **permissionless thaw** for a
//! default-frozen AED payment token.
//!
//! This is the Token ACL (sRFC37) pattern, which the Solana Foundation now
//! recommends over per-transfer hooks for holder gating: the mint is created
//! with `DefaultAccountState = Frozen` and its freeze authority is handed to
//! this program's GateConfig PDA. New token accounts are born frozen and
//! useless; anyone may thaw an account through `thaw_account` — but the thaw
//! only succeeds if the account owner holds a **valid KYC attestation entry**
//! written by the configured attestor. Transfers themselves stay completely
//! standard afterwards (no per-transfer overhead, full DeFi composability).
//!
//! Roles are deliberately split the way the Solana Attestation Service (SAS)
//! splits them: the **issuer** (mint authority) configures the gate; the
//! **attestor** (an IDV provider such as Sumsub/Civic in production) writes
//! and revokes attestations. Swapping this program's attestation registry for
//! on-chain SAS attestation verification is the planned v2 (see ROADMAP);
//! production deployments should prefer the audited Token ACL program with
//! this logic as a Gate Program.
//!
//! Reference implementation for the Fils toolkit — audit before mainnet use.

use anchor_lang::{prelude::*, solana_program::program_option::COption};
use anchor_spl::{
    token_2022::spl_token_2022::{
        extension::{
            BaseStateWithExtensions, PodStateWithExtensions,
            default_account_state::DefaultAccountState,
        },
        pod::PodMint,
        state::AccountState,
    },
    token_interface::{
        FreezeAccount, Mint, ThawAccount, TokenAccount, TokenInterface,
        freeze_account as token_freeze_account, thaw_account as token_thaw_account,
    },
};
use solana_attestation_service_client::accounts::{
    Attestation as SasAttestation, Credential as SasCredential, Schema as SasSchema,
};

declare_id!("HfYBcwBTbHdtNmAD1Kcu8WSxwECfoSX3ELc77qEnzqWG");

pub const GATE_SEED: &[u8] = b"gate";
pub const KYC_SEED: &[u8] = b"kyc";

/// Solana Attestation Service (mainnet program, dumpable to any cluster).
pub const SAS_PROGRAM_ID: Pubkey =
    anchor_lang::pubkey!("22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG");
/// First byte of an SAS `Attestation` account.
pub const SAS_ATTESTATION_DISCRIMINATOR: u8 = 2;

#[program]
pub mod daed_gate {
    use super::*;

    /// Issuer-only, once per mint. The issuer must FIRST set the mint's
    /// freeze authority to this gate's config PDA (client-side SetAuthority);
    /// this instruction then records the attestor and verifies the handover.
    ///
    /// `sas_credential`/`sas_schema` (both or neither) additionally accept
    /// **Solana Attestation Service** attestations: any wallet holding a
    /// valid attestation issued under that credential+schema (e.g. by a
    /// Sumsub/Civic-style IDV provider) can thaw via `thaw_account_with_sas`
    /// — no gate-specific attestation registry write needed.
    pub fn initialize_gate(
        ctx: Context<InitializeGate>,
        attestor: Pubkey,
        sas_credential: Option<Pubkey>,
        sas_schema: Option<Pubkey>,
    ) -> Result<()> {
        require!(
            sas_credential.is_some() == sas_schema.is_some(),
            DaedGateError::SasPolicyIncomplete
        );

        // The whole gate rests on new token accounts being born frozen
        // (Token-2022 DefaultAccountState = Frozen). Enforce it here so a gate
        // can never be attached to a mint whose accounts are usable without a
        // thaw, which would silently bypass the KYC perimeter.
        {
            let mint_info = ctx.accounts.mint.to_account_info();
            let mint_data = mint_info.try_borrow_data()?;
            let mint_state = PodStateWithExtensions::<PodMint>::unpack(&mint_data)
                .map_err(|_| DaedGateError::MintNotDefaultFrozen)?;
            let default_state = mint_state
                .get_extension::<DefaultAccountState>()
                .map_err(|_| DaedGateError::MintNotDefaultFrozen)?;
            require!(
                default_state.state == AccountState::Frozen as u8,
                DaedGateError::MintNotDefaultFrozen
            );
        }

        let config = &mut ctx.accounts.gate_config;
        config.mint = ctx.accounts.mint.key();
        config.issuer = ctx.accounts.payer.key();
        config.attestor = attestor;
        config.sas_credential = sas_credential;
        config.sas_schema = sas_schema;
        config.bump = ctx.bumps.gate_config;
        Ok(())
    }

    /// Attestor-only: record (or refresh) a KYC attestation for `wallet`.
    /// In production this row is the projection of an off-chain KYC check —
    /// exactly what an SAS attestation represents.
    pub fn attest(ctx: Context<Attest>, wallet: Pubkey, expiry: i64) -> Result<()> {
        require!(expiry > Clock::get()?.unix_timestamp, DaedGateError::ExpiryInPast);
        let entry = &mut ctx.accounts.attestation;
        entry.wallet = wallet;
        entry.expiry = expiry;
        entry.revoked = false;
        Ok(())
    }

    /// Attestor-only: revoke `wallet`'s attestation (licence suspended).
    /// Existing thawed accounts keep working until `freeze_wallet_account`
    /// is called — revocation and enforcement are separate compliance acts.
    pub fn revoke(ctx: Context<Revoke>, wallet: Pubkey) -> Result<()> {
        let _ = wallet;
        ctx.accounts.attestation.revoked = true;
        Ok(())
    }

    /// PERMISSIONLESS: thaw any token account of the gated mint whose owner
    /// holds a valid (non-revoked, non-expired) attestation. This is the
    /// self-service onboarding step — no issuer round-trip.
    pub fn thaw_account(ctx: Context<Thaw>) -> Result<()> {
        let entry = &ctx.accounts.attestation;
        require!(!entry.revoked, DaedGateError::AttestationRevoked);
        require!(entry.expiry > Clock::get()?.unix_timestamp, DaedGateError::AttestationExpired);

        let mint = ctx.accounts.gate_config.mint;
        let signer_seeds: &[&[&[u8]]] =
            &[&[GATE_SEED, mint.as_ref(), &[ctx.accounts.gate_config.bump]]];
        token_thaw_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            ThawAccount {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.gate_config.to_account_info(),
            },
            signer_seeds,
        ))
    }

    /// PERMISSIONLESS: like `thaw_account`, but the proof is a **Solana
    /// Attestation Service** attestation for the token account's owner,
    /// issued under the credential + schema this gate trusts (a real IDV
    /// provider's KYC passport). Verified: SAS-owned, Attestation-typed,
    /// matching credential and schema, bound to the owner via the nonce,
    /// not expired — and the credential/schema are checked in their **current**
    /// state (schema not paused, signer still authorized), not just as they
    /// were embedded in the attestation at issuance.
    pub fn thaw_account_with_sas(ctx: Context<ThawWithSas>) -> Result<()> {
        let config = &ctx.accounts.gate_config;
        let credential = config.sas_credential.ok_or(DaedGateError::SasNotConfigured)?;
        let schema = config.sas_schema.ok_or(DaedGateError::SasNotConfigured)?;

        // The passed credential and schema accounts must be exactly the gate's
        // trusted ones and still owned by SAS. Key equality binds them to the
        // gate config so their *live* state can be trusted below.
        require!(
            ctx.accounts.sas_credential.key() == credential,
            DaedGateError::SasWrongCredential
        );
        require!(ctx.accounts.sas_schema.key() == schema, DaedGateError::SasWrongSchema);
        require!(
            ctx.accounts.sas_credential.owner == &SAS_PROGRAM_ID,
            DaedGateError::SasWrongOwner
        );
        require!(ctx.accounts.sas_schema.owner == &SAS_PROGRAM_ID, DaedGateError::SasWrongOwner);

        let info = &ctx.accounts.sas_attestation;
        require!(info.owner == &SAS_PROGRAM_ID, DaedGateError::SasWrongOwner);
        let now = Clock::get()?.unix_timestamp;
        {
            let data = info.try_borrow_data()?;
            require!(
                data.first() == Some(&SAS_ATTESTATION_DISCRIMINATOR),
                DaedGateError::SasWrongAccountType
            );
            let attestation =
                SasAttestation::from_bytes(&data).map_err(|_| DaedGateError::SasMalformed)?;
            require!(
                attestation.credential.to_bytes() == credential.to_bytes(),
                DaedGateError::SasWrongCredential
            );
            require!(
                attestation.schema.to_bytes() == schema.to_bytes(),
                DaedGateError::SasWrongSchema
            );
            require!(
                attestation.nonce.to_bytes() == ctx.accounts.token_account.owner.to_bytes(),
                DaedGateError::SasSubjectMismatch
            );
            require!(attestation.expiry > now, DaedGateError::AttestationExpired);

            // Current policy state. Expiry alone does not cover a schema paused
            // or a signer removed from the credential *after* a (possibly
            // compromised) attestation was issued, so check both live here.
            let schema_data = ctx.accounts.sas_schema.try_borrow_data()?;
            let schema_account =
                SasSchema::from_bytes(&schema_data).map_err(|_| DaedGateError::SasMalformed)?;
            require!(
                schema_account.credential.to_bytes() == credential.to_bytes(),
                DaedGateError::SasWrongSchema
            );
            require!(!schema_account.is_paused, DaedGateError::SasSchemaPaused);

            let credential_data = ctx.accounts.sas_credential.try_borrow_data()?;
            let credential_account = SasCredential::from_bytes(&credential_data)
                .map_err(|_| DaedGateError::SasMalformed)?;
            require!(
                credential_account
                    .authorized_signers
                    .iter()
                    .any(|signer| signer.to_bytes() == attestation.signer.to_bytes()),
                DaedGateError::SasSignerNotAuthorized
            );
        }

        let mint = config.mint;
        let signer_seeds: &[&[&[u8]]] = &[&[GATE_SEED, mint.as_ref(), &[config.bump]]];
        token_thaw_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            ThawAccount {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.gate_config.to_account_info(),
            },
            signer_seeds,
        ))
    }

    /// Issuer- or attestor-only: re-freeze a specific token account
    /// (enforcement after revocation, or a law-enforcement action).
    pub fn freeze_wallet_account(ctx: Context<Freeze>) -> Result<()> {
        let mint = ctx.accounts.gate_config.mint;
        let signer_seeds: &[&[&[u8]]] =
            &[&[GATE_SEED, mint.as_ref(), &[ctx.accounts.gate_config.bump]]];
        token_freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            FreezeAccount {
                account: ctx.accounts.token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.gate_config.to_account_info(),
            },
            signer_seeds,
        ))
    }
}

#[derive(Accounts)]
pub struct InitializeGate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = GateConfig::SPACE,
        seeds = [GATE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub gate_config: Account<'info, GateConfig>,
    #[account(
        constraint = mint.mint_authority == COption::Some(payer.key())
            @ DaedGateError::AuthorityMismatch,
        constraint = mint.freeze_authority == COption::Some(gate_config.key())
            @ DaedGateError::FreezeAuthorityNotGate,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct Attest<'info> {
    #[account(mut, constraint = attestor.key() == gate_config.attestor @ DaedGateError::AuthorityMismatch)]
    pub attestor: Signer<'info>,
    #[account(seeds = [GATE_SEED, gate_config.mint.as_ref()], bump = gate_config.bump)]
    pub gate_config: Account<'info, GateConfig>,
    #[account(
        init_if_needed,
        payer = attestor,
        space = Attestation::SPACE,
        seeds = [KYC_SEED, gate_config.mint.as_ref(), wallet.as_ref()],
        bump,
    )]
    pub attestation: Account<'info, Attestation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct Revoke<'info> {
    #[account(constraint = attestor.key() == gate_config.attestor @ DaedGateError::AuthorityMismatch)]
    pub attestor: Signer<'info>,
    #[account(seeds = [GATE_SEED, gate_config.mint.as_ref()], bump = gate_config.bump)]
    pub gate_config: Account<'info, GateConfig>,
    #[account(mut, seeds = [KYC_SEED, gate_config.mint.as_ref(), wallet.as_ref()], bump)]
    pub attestation: Account<'info, Attestation>,
}

#[derive(Accounts)]
pub struct Thaw<'info> {
    #[account(mut, token::mint = mint)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(seeds = [GATE_SEED, mint.key().as_ref()], bump = gate_config.bump)]
    pub gate_config: Account<'info, GateConfig>,
    /// The token-account owner's attestation — PDA derivation on the owner is
    /// the membership proof.
    #[account(seeds = [KYC_SEED, mint.key().as_ref(), token_account.owner.as_ref()], bump)]
    pub attestation: Account<'info, Attestation>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ThawWithSas<'info> {
    #[account(mut, token::mint = mint)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(seeds = [GATE_SEED, mint.key().as_ref()], bump = gate_config.bump)]
    pub gate_config: Account<'info, GateConfig>,
    /// CHECK: verified in the handler — owned by the SAS program, Attestation
    /// discriminator, trusted credential+schema, nonce == token account
    /// owner, not expired.
    pub sas_attestation: UncheckedAccount<'info>,
    /// CHECK: verified in the handler: must equal the gate's trusted SAS
    /// credential and be SAS-owned; its authorized-signers list is read to
    /// confirm the attestation's signer is still authorized.
    pub sas_credential: UncheckedAccount<'info>,
    /// CHECK: verified in the handler: must equal the gate's trusted SAS
    /// schema and be SAS-owned; read to confirm the schema is not paused.
    pub sas_schema: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Freeze<'info> {
    #[account(
        constraint = authority.key() == gate_config.issuer || authority.key() == gate_config.attestor
            @ DaedGateError::AuthorityMismatch,
    )]
    pub authority: Signer<'info>,
    #[account(mut, token::mint = mint)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(seeds = [GATE_SEED, mint.key().as_ref()], bump = gate_config.bump)]
    pub gate_config: Account<'info, GateConfig>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Per-mint gate configuration; this PDA **is** the mint's freeze authority.
#[account]
pub struct GateConfig {
    pub mint: Pubkey,
    pub issuer: Pubkey,
    pub attestor: Pubkey,
    /// When set (with `sas_schema`), SAS attestations under this credential
    /// are accepted by `thaw_account_with_sas`.
    pub sas_credential: Option<Pubkey>,
    pub sas_schema: Option<Pubkey>,
    pub bump: u8,
}

impl GateConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + (1 + 32) + (1 + 32) + 1;
}

/// One KYC attestation per (mint, wallet), written by the attestor.
#[account]
pub struct Attestation {
    pub wallet: Pubkey,
    pub expiry: i64,
    pub revoked: bool,
}

impl Attestation {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

#[error_code]
pub enum DaedGateError {
    #[msg("signer is not authorized for this gate")]
    AuthorityMismatch,
    #[msg("the mint's freeze authority must be the gate config PDA")]
    FreezeAuthorityNotGate,
    #[msg("attestation expiry is in the past")]
    ExpiryInPast,
    #[msg("attestation has been revoked")]
    AttestationRevoked,
    #[msg("attestation has expired")]
    AttestationExpired,
    #[msg("sas_credential and sas_schema must be set together")]
    SasPolicyIncomplete,
    #[msg("this gate has no SAS policy configured")]
    SasNotConfigured,
    #[msg("attestation account is not owned by the Solana Attestation Service")]
    SasWrongOwner,
    #[msg("account is not an SAS Attestation")]
    SasWrongAccountType,
    #[msg("SAS attestation failed to deserialize")]
    SasMalformed,
    #[msg("SAS attestation is not under the trusted credential")]
    SasWrongCredential,
    #[msg("SAS attestation is not of the trusted schema")]
    SasWrongSchema,
    #[msg("SAS attestation is not bound to the token account owner")]
    SasSubjectMismatch,
    #[msg("the SAS schema is currently paused")]
    SasSchemaPaused,
    #[msg("the SAS attestation signer is no longer authorized on the credential")]
    SasSignerNotAuthorized,
    #[msg("the mint is not default-frozen (DefaultAccountState must be Frozen)")]
    MintNotDefaultFrozen,
}
