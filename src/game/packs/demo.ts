/**
 * The default demo question pack: general crypto / Base-ecosystem / Flaunch knowledge.
 *
 * Pack format (see README "pack format"):
 *   - Pack tiers are authored (1 = broadly known, 2 = moderately specific, 3 = Flaunch/Base deep).
 *   - Each pack must supply enough questions per tier to sample a 10-rung ladder without obvious
 *     repeat exposure (aim for >= 7 per tier; this demo has 8/8/9).
 *   - `correct` is the index into `options` (as authored). It is never sent to the client.
 */
import type { Config } from '../rules.js';

const base = {
  completionBonus: 500,
  speedBonusCap: 0.5,
  rungsPerTier: [4, 4, 2] as [number, number, number],
  tierSpecs: {
    1: { points: 100, budgetMs: 8_000 },
    2: { points: 200, budgetMs: 7_000 },
    3: { points: 400, budgetMs: 6_000 },
  } as Config['tierSpecs'],
};

export const demoPack: Config = {
  ...base,
  packId: 'flaunch-base-crypto-demo-v1',
  title: 'How well do you know crypto & Base?',
  questions: [
    // ---- Tier 1: broadly known --------------------------------------------------
    {
      id: 't1q1',
      tier: 1,
      prompt: 'Which of these is an EVM Layer 2 network built by Coinbase?',
      options: ['📦 Arbitrum', '🟣 Base', '🌀 Polygon', '☀️ Solana'],
      correct: 1,
    },
    {
      id: 't1q2',
      tier: 1,
      prompt: 'What is a memecoin?',
      options: [
        'A coin that lives inside video game loot',
        'A cryptocurrency inspired by an internet meme or joke',
        'A stablecoin pegged to a memory token',
        'A token that stores your saved game files',
      ],
      correct: 1,
    },
    {
      id: 't1q3',
      tier: 1,
      prompt: 'What does a "fair launch" typically mean for a token?',
      options: [
        'Everyone has a fair shot at buying early instead of insiders getting the first dips',
        'The token is launched by a court auction house',
        'Only verified KYC users can buy',
        'The founder sets the price fairly on a website',
      ],
      correct: 0,
    },
    {
      id: 't1q4',
      tier: 1,
      prompt: 'A "wallet" in crypto is best described as:',
      options: [
        'A physical vault that holds dollar bills',
        'Software that lets you sign transactions and manage keys for your assets',
        'An exchange account you must share a password for',
        'A hardware-only device with no software',
      ],
      correct: 1,
    },
    {
      id: 't1q5',
      tier: 1,
      prompt: 'What is "gas" on a blockchain?',
      options: [
        'The fuel used by miners in a physical engine',
        'A fee paid in the native token to process a transaction',
        'A type of governance vote',
        'A storage space for Developer gas logs',
      ],
      correct: 1,
    },
    {
      id: 't1q6',
      tier: 1,
      prompt: 'What does the "EVM" in EVM chains stand for?',
      options: [
        'Ethereum Virtual Machine',
        'Every Valid Merchant',
        'Extended Value Mechanism',
        'Ethereum Value Market',
      ],
      correct: 0,
    },
    {
      id: 't1q7',
      tier: 1,
      prompt: 'Which is closest to a "stablecoin"?',
      options: [
        'A token designed to hold a steady value, often tied to a fiat currency',
        'A coin whose price is always going up',
        'A token locked in a smart contract forever',
        'A coin with stable development but volatile price',
      ],
      correct: 0,
    },
    {
      id: 't1q8',
      tier: 1,
      prompt: 'A "smart contract" is:',
      options: [
        'A legal document signed with a smart pen',
        'Code on a blockchain that runs automatically when its conditions are met',
        'An AI lawyer service',
        'A blockchain created by smart people',
      ],
      correct: 1,
    },

    // ---- Tier 2: moderately specific ---------------------------------------------
    {
      id: 't2q1',
      tier: 2,
      prompt: 'What is the relationship between Base and Ethereum?',
      options: [
        'Base is a separate network with no connection to Ethereum',
        'Base is a Layer 2 rollup that settles and inherits security from Ethereum',
        'Base is a wallet app for Ethereum only',
        'Base is Ethereum rebranded',
      ],
      correct: 1,
    },
    {
      id: 't2q2',
      tier: 2,
      prompt: 'Which company pioneered and backs Base?',
      options: ['Binance', 'Kraken', 'Coinbase', 'BlackRock'],
      correct: 2,
    },
    {
      id: 't2q3',
      tier: 2,
      prompt: 'In an AMM (automated market maker), the swap price is set by:',
      options: [
        'A central exchange order book',
        'A formula based on the ratio of tokens in a liquidity pool',
        'A government regulator',
        'The token\'s release schedule',
      ],
      correct: 1,
    },
    {
      id: 't2q4',
      tier: 2,
      prompt: 'When you "bridge" assets to Base, you typically:',
      options: [
        'Move tokens across networks, usually with a bridging contract',
        'Mine new tokens on Base',
        'Vote on a governance proposal',
        'Create a new wallet address automatically',
      ],
      correct: 0,
    },
    {
      id: 't2q5',
      tier: 2,
      prompt: 'Which of these is a token standard used for fungible tokens?',
      options: ['ERC-721', 'ERC-20', 'ERC-1155', 'ERC-404'],
      correct: 1,
    },
    {
      id: 't2q6',
      tier: 2,
      prompt: 'What is "liquidity" in a token pool?',
      options: [
        'The total supply of a token',
        'Tokens deposited so trades can happen without large price swings',
        'The amount of gas a contract uses',
        'The number of holders',
      ],
      correct: 1,
    },
    {
      id: 't2q7',
      tier: 2,
      prompt: 'What does "rug pull" most commonly refer to?',
      options: [
        'A token\'s price dipping after a sale',
        'Developers draining liquidity or abandoning a project after raising money',
        'A network rejecting transactions',
        'A soft-fork upgrade',
      ],
      correct: 1,
    },
    {
      id: 't2q8',
      tier: 2,
      prompt: 'On Base, transaction fees are paid in:',
      options: ['USDC', 'ETH', 'COIN', 'Base-native gas token'],
      correct: 1,
    },

    // ---- Tier 3: Flaunch-specific & deep Base ------------------------------------
    {
      id: 't3q1',
      tier: 3,
      prompt: 'What is Flaunch\'s "Game Mode"?',
      options: [
        'A feature that adds gamification badges to trading',
        'A framework where playing a game is the only way to earn a spot on a token\'s launch curve',
        'A gaming console for blockchain',
        'A token that powers Flaunch\'s own coin',
      ],
      correct: 1,
    },
    {
      id: 't3q2',
      tier: 3,
      prompt: 'Why does Flaunch\'s Knowledge archetype specifically reward trivia over reflexes?',
      options: [
        'Trivia is cheaper to build than reflex games',
        'It ensures the community that earns the launch curve allocation actually understands the project',
        'Reflex games require hardware that most users lack',
        'Knowledge games run faster on Base',
      ],
      correct: 1,
    },
    {
      id: 't3q3',
      tier: 3,
      prompt: 'How do Flaunch library games earn revenue?',
      options: [
        'By charging players an entry fee in ETH',
        'A share (about 5%) of trading fees of every coin launched through them',
        'By selling ad space in the game',
        'By minting their own token',
      ],
      correct: 1,
    },
    {
      id: 't3q4',
      tier: 3,
      prompt: 'In Game Mode, when is the only time you can get onto the bonding curve?',
      options: [
        'Any time, like an open pool',
        'During a fixed window, by earning a spending allowance through playing',
        'Only if you run a node',
        'Only during the first block',
      ],
      correct: 1,
    },
    {
      id: 't3q5',
      tier: 3,
      prompt: 'What is a "spend-gated launch"?',
      options: [
        'A launch that refuses purchases from big wallets',
        'A launch where each wallet\'s ability to spend is capped and gated by earned allowance',
        'A launch that requires a subscription',
        'A launch that only allows spending in a store',
      ],
      correct: 1,
    },
    {
      id: 't3q6',
      tier: 3,
      prompt: 'What does "knowledge" mean as a Game Mode archetype?',
      options: [
        'A reflex-based game',
        'A trivia round gating the launch on a community that actually knows its subject',
        'A game that teaches you about crypto',
        'An AI that solves questions for you',
      ],
      correct: 1,
    },
    {
      id: 't3q7',
      tier: 3,
      prompt: 'In a Game Mode game, who computes and awards the score?',
      options: [
        'The player\'s browser, so it is fast',
        'The server, which re-runs every move from raw inputs instead of trusting the browser',
        'A third-party oracle',
        'The token\'s creator manually',
      ],
      correct: 1,
    },
    {
      id: 't3q8',
      tier: 3,
      prompt: 'Games in Flaunch\'s library are described as:',
      options: [
        'Never tokenized, holding no coin of their own',
        'Always launching their own token',
        'Required to have an in-game economy token',
        'Required to run on their own layer-1',
      ],
      correct: 0,
    },
    {
      id: 't3q9',
      tier: 3,
      prompt: 'Why would a project choose a Knowledge game over a reflex game as its gate?',
      options: [
        'Because reflex games are banned',
        'Because it rewards a community that genuinely knows the project instead of the fastest bot',
        'Because it is faster to load',
        'Because it always produces the same holders',
      ],
      correct: 1,
    },
  ],
};
