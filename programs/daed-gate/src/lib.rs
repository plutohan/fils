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
use anchor_spl::token_interface::{
    FreezeAccount, Mint, ThawAccount, TokenAccount, TokenInterface,
    freeze_account as token_freeze_account, thaw_account as token_thaw_account,
};

declare_id!("HfYBcwBTbHdtNmAD1Kcu8WSxwECfoSX3ELc77qEnzqWG");

pub const GATE_SEED: &[u8] = b"gate";
pub const KYC_SEED: &[u8] = b"kyc";

#[program]
pub mod daed_gate {
    use super::*;

    /// Issuer-only, once per mint. The issuer must FIRST set the mint's
    /// freeze authority to this gate's config PDA (client-side SetAuthority);
    /// this instruction then records the attestor and verifies the handover.
    pub fn initialize_gate(ctx: Context<InitializeGate>, attestor: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.gate_config;
        config.mint = ctx.accounts.mint.key();
        config.issuer = ctx.accounts.payer.key();
        config.attestor = attestor;
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
    pub bump: u8,
}

impl GateConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1;
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
}
