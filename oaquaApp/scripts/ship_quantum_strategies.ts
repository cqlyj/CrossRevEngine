import { exec } from 'child_process'
import { promisify } from 'util'
import { Address, MakerTraits } from '@1inch/swap-vm-sdk'
import { createQuantumStrategy } from './lib/quantumStrategyBuilder'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config()

const execAsync = promisify(exec)

interface ShipOptions {
    amount?: string
    recipient?: string
    redeploy?: boolean
}

async function runCommand(cmd: string, description: string): Promise<void> {
    console.log(`[${description}] Running...`)
    try {
        const { stdout, stderr } = await execAsync(cmd, {
            env: { ...process.env, FORCE_COLOR: '0' },
        })
        if (stdout) console.log(stdout)
        if (stderr && !stderr.includes('WARNING')) console.error(stderr)
        console.log(`[${description}] Done`)
    } catch (error: any) {
        console.error(`[${description}] Failed:`, error.message)
        throw error
    }
}

async function main() {
    const args = process.argv.slice(2)
    const options: ShipOptions = {}

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === '--amount' && i + 1 < args.length) {
            options.amount = args[++i]
        } else if (arg === '--recipient' && i + 1 < args.length) {
            options.recipient = args[++i]
        } else if (arg === '--redeploy') {
            options.redeploy = true
        }
    }

    const amount = options.amount || '10000'
    const recipient = options.recipient || process.env.RECIPIENT || '0x120C1fc5B7f357c0254cDC8027970DDD6405e115'

    console.log('='.repeat(60))
    console.log('OAqua Quantum Liquidity Shipping')
    console.log('='.repeat(60))
    console.log(`Amount: ${amount} USDC`)
    console.log(`Recipient: ${recipient}`)
    console.log(`Redeploy: ${options.redeploy ? 'Yes' : 'No'}`)
    console.log('='.repeat(60))

    if (options.redeploy) {
        // Deploy Executor on Base
        console.log('\n[1/5] Deploying Executor on Base...')
        await runCommand('npx hardhat deploy --network base-mainnet --tags OAquaExecutor --reset', 'Deploy Executor')

        // Deploy SwapExecutor on Base
        console.log('\n[2/5] Deploying SwapExecutor on Base...')
        await runCommand(
            'npx hardhat deploy --network base-mainnet --tags OAquaSwapExecutor --reset',
            'Deploy SwapExecutor'
        )

        // Sync addresses to .env
        console.log('\n[3/5] Syncing addresses...')
        await runCommand('npx ts-node scripts/sync_addresses.ts', 'Sync Addresses')

        // Reload env to get the updated addresses
        delete require.cache[require.resolve('dotenv')]
        require('dotenv').config()

        // Deploy Sender on Arbitrum
        console.log('\n[4/5] Deploying Sender on Arbitrum...')
        await runCommand('npx hardhat deploy --network arbitrum-mainnet --tags OAquaSender --reset', 'Deploy Sender')

        // Sync addresses again
        console.log('\n[Sync] Updating addresses...')
        await runCommand('npx ts-node scripts/sync_addresses.ts', 'Sync Addresses')

        // Reload env again
        delete require.cache[require.resolve('dotenv')]
        require('dotenv').config()
    } else {
        console.log('\n[Skip] Using existing deployments')
        await runCommand('npx ts-node scripts/sync_addresses.ts', 'Sync Addresses')
        delete require.cache[require.resolve('dotenv')]
        require('dotenv').config()
    }

    // Build quantum strategies
    console.log('\n[5/5] Building and shipping quantum strategies...')

    // Get executor address first
    delete require.cache[require.resolve('dotenv')]
    require('dotenv').config()
    const executorAddress = process.env.OAQUA_EXECUTOR_ADDRESS!

    const usdcAddress = process.env.USDC_ADDRESS_BASE!
    const usdtAddress = process.env.USDT_ADDRESS_BASE!

    // CRITICAL: XYC pool requires BOTH USDC (from LayerZero) AND USDT (already on executor)
    // Fund executor with USDT first
    console.log('\n[Fund] Funding executor with USDT for XYC pool...')
    await runCommand(
        `AMOUNT=${amount} npx hardhat run scripts/fund_executor_usdt.ts --network base-mainnet`,
        'Fund Executor'
    )
    // tokenOut = what the TAKER receives from the strategy (maker provides USDC)
    const tokenOut = usdcAddress

    if (!usdcAddress || !usdtAddress || !executorAddress) {
        throw new Error('Missing USDC_ADDRESS_BASE, USDT_ADDRESS_BASE, or OAQUA_EXECUTOR_ADDRESS')
    }

    // Calculate liquidity for XYC pool (needs BOTH tokens!)
    const liquidityUSDC = BigInt(amount) * 10n ** 6n // USDC from Arbitrum
    const liquidityUSDT = BigInt(amount) * 10n ** 6n // USDT we already have on Base

    const now = Math.floor(Date.now() / 1000)

    console.log('\n[Strategy] Building AMM using SDK...')
    // Use SDK's built-in strategy builder and create a proper Order
    const { AquaAMMStrategy, Order: SDKOrder, MakerTraits, instructions } = require('@1inch/swap-vm-sdk')

    // Generate unique salt for this strategy
    const salt = Math.floor(Date.now() / 1000).toString()
    const saltBigInt = BigInt(salt)

    // Build AMM strategy with salt to make it unique
    const baseProgram = AquaAMMStrategy.new({
        tokenA: new Address(usdcAddress),
        tokenB: new Address(usdtAddress),
    }).build()

    // Add salt instruction to make the strategy unique
    const { AquaProgramBuilder } = require('@1inch/swap-vm-sdk')
    const builder = new AquaProgramBuilder()

    // Add salt first (makes strategy unique)
    const SaltArgs = instructions.controls.SaltArgs
    builder.add(instructions.controls.salt.createIx(new SaltArgs(saltBigInt)))

    // Then add the AMM program instructions
    // For a simple AMM, we just need concentrate + xycSwap
    builder.add(
        instructions.concentrate.concentrateGrowLiquidity2D.createIx(
            instructions.concentrate.ConcentrateGrowLiquidity2DArgs.fromTokenDeltas(
                new Address(usdcAddress),
                new Address(usdtAddress),
                BigInt(amount) * 10n ** 6n,
                BigInt(amount) * 10n ** 6n
            )
        )
    )
    builder.xycSwapXD()

    const program = builder.build()

    console.log('[Strategy] Program with salt:', program.toString())

    // CRITICAL: Encode MakerTraits with useAquaInsteadOfSignature=true
    const makerTraitsEncoded = MakerTraits.default().encode()
    const makerTraitsValue = makerTraitsEncoded.traits // BigInt value

    // CRITICAL: Pass just the program, NOT the encoded order!
    // The executor will wrap it in an Order struct itself
    // Note: salt is already included in the program above
    const sendCmd = `npx hardhat oaqua:send-swap --network arbitrum-mainnet --amount ${amount} --token-out ${usdtAddress} --recipient ${recipient} --program ${program.toString()} --maker-traits ${makerTraitsValue.toString()} --salt ${salt} --strategy-buffer ${amount}`

    console.log('\n[6/6] Shipping strategy via LayerZero...')
    console.log(`[Ship] Using executor address: ${executorAddress}`)
    await runCommand(sendCmd, 'Ship Strategy')

    const ethers = require('ethers')
    const encodedOrder = ethers.utils.defaultAbiCoder.encode(
        ['tuple(address maker, uint256 traits, bytes data)'],
        [{ maker: executorAddress, traits: makerTraitsValue, data: program.toString() }]
    )

    const strategyInfo = {
        maker: executorAddress,
        tokenA: usdcAddress, // First token in AquaAMMStrategy
        tokenB: usdtAddress, // Second token in AquaAMMStrategy
        // CRITICAL: tokenIn MUST match what LayerZero bridges (USDC)!
        // Executor updates strategyBalances for tokenIn based on actual received amount
        tokenIn: usdcAddress, // What LayerZero bridges (USDC from Arbitrum)
        tokenOut: usdtAddress, // What's already on executor (USDT)
        program: program.toString(), // Raw program bytes
        encodedOrder: encodedOrder, // Full encoded order for querying
        salt: `0x${salt.padStart(64, '0')}`,
        timestamp: Date.now(),
    }

    const dataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
    }
    fs.writeFileSync(path.join(dataDir, 'last_strategy.json'), JSON.stringify(strategyInfo, null, 2))
    console.log('[Ship] Strategy saved to data/last_strategy.json')

    console.log('\n' + '='.repeat(60))
    console.log('✓ Quantum strategy shipped!')
    console.log('='.repeat(60))
    console.log('Strategy: "The Sniper"')
    console.log('  - Expires in 1 hour (testing mode)')
    console.log('  - Progressive fees: 10-20 bps')
    console.log('  - Price improves over 1 hour')
    console.log('')
    console.log('Next steps:')
    console.log('  1. Wait ~5 min for LayerZero bridge')
    console.log('  2. Check status: make check-strategy')
    console.log('  3. Execute swap: make swap SWAP_AMOUNT=1000')
    console.log('  4. LayerZero: https://layerzeroscan.com')
    console.log('='.repeat(60))
}

main().catch((error) => {
    console.error('Error:', error.message)
    process.exitCode = 1
})
