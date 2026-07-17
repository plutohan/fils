//! daed-hook — a Token-2022 transfer-hook program implementing a
//! licensed-holder allowlist for a regulated AED payment token.
//!
//! One issuer-control design (a choice, not a regulatory mandate): a licensed
//! dirham payment token issuer may enforce a positive-permission distribution
//! perimeter on-chain. With this hook attached to the mint, **every** token
//! transfer — wallet-to-wallet, DEX, CPI — fails unless the *destination
//! owner* has an active allowlist entry created by the issuer (mint
//! authority). Freezing individual
//! accounts stays with the mint's freeze authority; this hook adds the
//! positive-permission perimeter on top.
//!
//! Accounts follow the SPL transfer-hook interface: the allowlist entry PDA
//! is resolved automatically by wallets/clients from the ExtraAccountMetaList,
//! keyed on the destination token account's owner (read via an account-data
//! seed at offset 32 of the token account).
//!
//! Reference implementation for the Fils toolkit — audit before any mainnet
//! use. Known limitations (reference scope):
//! - The hook gates the transfer *destination*: it blocks a non-allowlisted
//!   wallet from receiving, but does not stop a *revoked* holder from sending
//!   an existing balance on to another allowlisted wallet.
//!   `set_allowed(wallet, false)` closes the receive side only; to immobilise a
//!   revoked account's existing balance, freeze it with the mint's freeze
//!   authority (or the daed-gate perimeter). Gating the *source* owner as well
//!   would also break delegate- and DEX-routed transfers, so suspension is
//!   deliberately left to freeze rather than the allowlist.
//! - The mint authority administering the allowlist is a single Ed25519 signer,
//!   not an SPL multisig or governance PDA; a production issuer would adapt this.

use anchor_lang::{
    prelude::*,
    solana_program::program_option::COption,
    system_program::{CreateAccount, create_account},
};
use anchor_spl::{
    token_2022::spl_token_2022::{
        extension::{
            BaseStateWithExtensions, PodStateWithExtensions,
            transfer_hook::{TransferHook as MintTransferHook, TransferHookAccount},
        },
        pod::{PodAccount, PodMint},
    },
    token_interface::{Mint, TokenAccount},
};
// For the SPL_DISCRIMINATOR_SLICE constants used as Anchor discriminators.
use spl_discriminator::SplDiscriminate;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::{
    ExecuteInstruction, InitializeExtraAccountMetaListInstruction,
};

declare_id!("WVoJTCXkkLWip4rSP3ho3N9bAoZdcAsoHJEGtjmqkU1");

/// Seed prefix for allowlist entry PDAs: ["allow", mint, wallet].
pub const ALLOW_SEED: &[u8] = b"allow";

#[program]
pub mod daed_hook {
    use super::*;

    /// Create the ExtraAccountMetaList PDA for `mint`, declaring that Execute
    /// needs the allowlist entry of the destination token account's owner.
    /// Only the mint authority (the issuer) may initialize it.
    #[instruction(discriminator = InitializeExtraAccountMetaListInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Only wire up the allowlist for a mint whose Token-2022 TransferHook
        // extension actually points to this program. Otherwise the perimeter
        // could be "set up" for a mint whose transfers never invoke this hook,
        // so nothing is enforced.
        {
            let mint_info = ctx.accounts.mint.to_account_info();
            let mint_data = mint_info.try_borrow_data()?;
            let mint_state = PodStateWithExtensions::<PodMint>::unpack(&mint_data)
                .map_err(|_| DaedHookError::MintHookMismatch)?;
            let hook = mint_state
                .get_extension::<MintTransferHook>()
                .map_err(|_| DaedHookError::MintHookMismatch)?;
            let hook_program = Option::<Pubkey>::from(hook.program_id);
            require!(
                hook_program.map(|program| program.to_bytes()) == Some(crate::ID.to_bytes()),
                DaedHookError::MintHookMismatch
            );
        }

        let extra_account_metas = vec![ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: ALLOW_SEED.to_vec() },
                // Account 1 of Execute = the mint.
                Seed::AccountKey { index: 1 },
                // Account 2 of Execute = the destination token account; its
                // owner is the 32 bytes at offset 32 of the account data.
                Seed::AccountData { account_index: 2, data_index: 32, length: 32 },
            ],
            false, // is_signer
            false, // is_writable
        )?];

        let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())? as u64;
        let lamports = Rent::get()?.minimum_balance(account_size as usize);

        let mint = ctx.accounts.mint.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"extra-account-metas", mint.as_ref(), &[ctx.bumps.extra_account_meta_list]]];
        create_account(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
            )
            .with_signer(signer_seeds),
            lamports,
            account_size,
            ctx.program_id,
        )?;

        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
            &extra_account_metas,
        )?;
        Ok(())
    }

    /// Invoked by Token-2022 on every transfer of the hooked mint. Fails the
    /// whole transfer unless the destination owner holds an active allowlist
    /// entry. (PDA derivation in the accounts struct already proves the entry
    /// belongs to this mint + destination owner.)
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        check_is_transferring(&ctx)?;
        require!(ctx.accounts.allow_entry.allowed, DaedHookError::DestinationNotAllowlisted);
        Ok(())
    }

    /// Issuer-only: create or flip the allowlist entry for `wallet`.
    /// `allowed = false` revokes without closing the account, so revocation
    /// is cheap and reversible (licence suspended vs. never licensed).
    pub fn set_allowed(ctx: Context<SetAllowed>, wallet: Pubkey, allowed: bool) -> Result<()> {
        let entry = &mut ctx.accounts.allow_entry;
        entry.allowed = allowed;
        msg!("allowlist[{}] = {}", wallet, allowed);
        Ok(())
    }
}

/// Token-2022 sets a `transferring` flag on the source account for the
/// duration of the transfer CPI. Rejecting calls without it prevents anyone
/// from invoking Execute directly outside a real transfer.
fn check_is_transferring(ctx: &Context<TransferHook>) -> Result<()> {
    let source_info = ctx.accounts.source_token.to_account_info();
    let source_data = source_info.try_borrow_data()?;
    let source = PodStateWithExtensions::<PodAccount>::unpack(&source_data)?;
    let extension = source.get_extension::<TransferHookAccount>()?;
    require!(bool::from(extension.transferring), DaedHookError::NotTransferring);
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: created and initialized in the handler at the interface's
    /// canonical PDA; layout is the TLV ExtraAccountMetaList.
    #[account(mut, seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    #[account(
        constraint = mint.mint_authority == COption::Some(payer.key()) @ DaedHookError::AuthorityMismatch,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    // Validate the source only by mint. The interface's 4th account is the
    // transfer *authority*, which for a delegate, vault, or DEX transfer is not
    // the source token owner, so constraining `token::authority = owner` here
    // would reject otherwise valid transfers before the allowlist check.
    #[account(token::mint = mint)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: the transfer authority (owner or delegate); not used for gating,
    /// which keys off the destination owner's allowlist entry.
    pub owner: UncheckedAccount<'info>,
    /// CHECK: canonical ExtraAccountMetaList PDA for this mint.
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// The destination owner's allowlist entry. Requiring this account to
    /// exist *and* deserialize at this exact PDA is the allowlist check;
    /// `allowed` covers issuer-revoked entries.
    #[account(
        seeds = [ALLOW_SEED, mint.key().as_ref(), destination_token.owner.as_ref()],
        bump,
    )]
    pub allow_entry: Account<'info, AllowEntry>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct SetAllowed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        constraint = mint.mint_authority == COption::Some(authority.key()) @ DaedHookError::AuthorityMismatch,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        space = AllowEntry::SPACE,
        seeds = [ALLOW_SEED, mint.key().as_ref(), wallet.as_ref()],
        bump,
    )]
    pub allow_entry: Account<'info, AllowEntry>,
    pub system_program: Program<'info, System>,
}

/// One licensed-holder entry per (mint, wallet).
#[account]
pub struct AllowEntry {
    pub allowed: bool,
}

impl AllowEntry {
    /// Anchor discriminator + `allowed`.
    pub const SPACE: usize = 8 + 1;
}

#[error_code]
pub enum DaedHookError {
    #[msg("destination owner is not on the issuer's allowlist")]
    DestinationNotAllowlisted,
    #[msg("hook may only run inside a Token-2022 transfer")]
    NotTransferring,
    #[msg("signer is not the mint authority")]
    AuthorityMismatch,
    #[msg("the mint's transfer-hook program is not this program")]
    MintHookMismatch,
}
