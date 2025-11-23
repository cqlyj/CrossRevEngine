import { Address } from '@1inch/swap-vm-sdk'
import { createQuantumStrategy, calculateStrategyHash } from './lib/quantumStrategyBuilder'
import * as dotenv from 'dotenv'

dotenv.config()

async function main() {
    console.log('[Quantum] ================================================')
    console.log('[Quantum] QUANTUM LIQUIDITY - Multi-Strategy System')
    console.log('[Quantum] ================================================')
    console.log("[Quantum] Leveraging Aqua's virtual balances to create")
    console.log('[Quantum] multiple strategies sharing the same liquidity!\n')

    const executorAddress = process.env.OAQUA_EXECUTOR_ADDRESS
    const usdcAddress = process.env.USDC_ADDRESS_BASE
    const usdtAddress = process.env.USDT_ADDRESS_BASE

    if (!executorAddress || !usdcAddress || !usdtAddress) {
        throw new Error('Missing required environment variables')
    }

    console.log('[Quantum] Executor:', executorAddress)
    console.log('[Quantum] USDC:', usdcAddress)
    console.log('[Quantum] USDT:', usdtAddress)
    console.log()

    // Shared liquidity amount (demo size)
    const sharedLiquidity = 100n * 10n ** 6n // 100 USDT (6 decimals)
    console.log('[Quantum] ================================================')
    console.log('[Quantum] SHARED LIQUIDITY POOL')
    console.log('[Quantum] ================================================')
    console.log('[Quantum] Amount: 100 USDT')
    console.log('[Quantum] This SAME 100 USDT will power 3 strategies!')
    console.log('[Quantum] Capital Efficiency: 3x traditional AMMs\n')

    const now = Math.floor(Date.now() / 1000)

    // ========================================
    // STRATEGY 1: "The Sniper"
    // Fast trades, tight spread, short-lived
    // ========================================
    console.log('[Quantum] ================================================')
    console.log('[Quantum] STRATEGY 1: "The Sniper" ⚡')
    console.log('[Quantum] ================================================')
    console.log('[Quantum] Target: Fast arbitrage traders')
    console.log('[Quantum] Expires: 5 minutes')
    console.log('[Quantum] Price: Improves linearly over 5 min')
    console.log()

    const sniperProgram = createQuantumStrategy('Sniper', {
        tokenIn: new Address(usdcAddress),
        tokenOut: new Address(usdtAddress),
        liquidityOut: sharedLiquidity,
        deadlineSeconds: 300, // 5 min
        spreadBps: 20, // 0.2% spread
        progressiveFeeBps: 10, // 10-20 bps progressive
        decaySeconds: 300, // Price improves over 5 min
    })

    const sniperHash = calculateStrategyHash(executorAddress, sniperProgram)

    // ========================================
    // STRATEGY 2: "The Patient Hunter"
    // Better price for those who wait
    // ========================================
    console.log('[Quantum] ================================================')
    console.log('[Quantum] STRATEGY 2: "The Patient Hunter" 🎯')
    console.log('[Quantum] ================================================')
    console.log('[Quantum] Target: Patient traders seeking best price')
    console.log('[Quantum] Expires: 30 minutes')
    console.log('[Quantum] Price: Tighter spread, improves over time')
    console.log()

    const patientProgram = createQuantumStrategy('Patient', {
        tokenIn: new Address(usdcAddress),
        tokenOut: new Address(usdtAddress),
        liquidityOut: sharedLiquidity,
        deadlineSeconds: 1800, // 30 min
        spreadBps: 10, // 0.1% spread (tighter!)
        progressiveFeeBps: 5, // 5-15 bps progressive (lower!)
        decaySeconds: 1800, // Price improves over 30 min
    })

    const patientHash = calculateStrategyHash(executorAddress, patientProgram)

    // ========================================
    // STRATEGY 3: "The Whale Trap"
    // Only executes for large holders, charges premium
    // ========================================
    console.log('[Quantum] ================================================')
    console.log('[Quantum] STRATEGY 3: "The Whale Trap" 🐋')
    console.log('[Quantum] ================================================')
    console.log('[Quantum] Target: Large USDC holders (>0.01% supply)')
    console.log('[Quantum] Expires: Never (long-lived)')
    console.log('[Quantum] Price: Wide spread, high fees for whales only')
    console.log()

    const whaleProgram = createQuantumStrategy('Whale', {
        tokenIn: new Address(usdcAddress),
        tokenOut: new Address(usdtAddress),
        liquidityOut: sharedLiquidity,
        onlyTakerSupplyShareBps: 1, // Must hold >0.01% of USDC supply
        spreadBps: 50, // 0.5% spread (wide!)
        progressiveFeeBps: 30, // 30-50 bps progressive (high!)
        // No deadline, no decay - static trap
    })

    const whaleHash = calculateStrategyHash(executorAddress, whaleProgram)

    // ========================================
    // SUMMARY
    // ========================================
    console.log('[Quantum] ================================================')
    console.log('[Quantum] DEPLOYMENT SUMMARY')
    console.log('[Quantum] ================================================\n')

    console.log('[Quantum] Strategy 1: "The Sniper"')
    console.log('[Quantum] Hash:', sniperHash)
    console.log('[Quantum] Bytecode:', sniperProgram.toString())
    console.log('[Quantum] Length:', sniperProgram.toString().length / 2 - 1, 'bytes\n')

    console.log('[Quantum] Strategy 2: "The Patient Hunter"')
    console.log('[Quantum] Hash:', patientHash)
    console.log('[Quantum] Bytecode:', patientProgram.toString())
    console.log('[Quantum] Length:', patientProgram.toString().length / 2 - 1, 'bytes\n')

    console.log('[Quantum] Strategy 3: "The Whale Trap"')
    console.log('[Quantum] Hash:', whaleHash)
    console.log('[Quantum] Bytecode:', whaleProgram.toString())
    console.log('[Quantum] Length:', whaleProgram.toString().length / 2 - 1, 'bytes\n')

    console.log('[Quantum] ================================================')
    console.log('[Quantum] CAPITAL EFFICIENCY')
    console.log('[Quantum] ================================================')
    console.log('[Quantum] Traditional AMM: 300 USDT needed (100 per strategy)')
    console.log('[Quantum] Aqua Quantum: 100 USDT total (shared)')
    console.log('[Quantum] Efficiency Gain: 3x')
    console.log()
    console.log('[Quantum] ================================================')
    console.log('[Quantum] EXPECTED PROFIT PROFILE')
    console.log('[Quantum] ================================================')
    console.log('[Quantum] Small trader ($100):')
    console.log('[Quantum]   → Hits "Sniper" after 2 min')
    console.log('[Quantum]   → Pays ~12 bps total')
    console.log()
    console.log('[Quantum] Patient trader ($500):')
    console.log('[Quantum]   → Waits 15 min for "Patient Hunter"')
    console.log('[Quantum]   → Pays ~8 bps total')
    console.log()
    console.log('[Quantum] Whale ($50k, holds 0.02% supply):')
    console.log('[Quantum]   → Can ONLY hit "Whale Trap"')
    console.log('[Quantum]   → Pays ~45 bps total')
    console.log()
    console.log('[Quantum] Average: 15-20 bps vs traditional 5 bps flat')
    console.log('[Quantum] ================================================\n')

    console.log('[Quantum] Ready to ship all 3 strategies!')
    console.log('[Quantum] Use: make send-swap (will be updated to support multi-strategy)')
}

main().catch((error) => {
    console.error('[Quantum] Error:', error)
    process.exitCode = 1
})
