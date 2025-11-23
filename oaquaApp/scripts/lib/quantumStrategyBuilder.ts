import { Address, HexString } from '@1inch/swap-vm-sdk'
import { AquaProgramBuilder, instructions } from '@1inch/swap-vm-sdk'
import { ethers } from 'ethers'

const { decay, concentrate, fee, controls } = instructions

export interface QuantumStrategyParams {
    tokenIn: Address
    tokenOut: Address
    liquidityOut: bigint

    // Deadline (optional)
    deadlineSeconds?: number

    // Pricing
    spreadBps: number

    // Fees
    progressiveFeeBps: number

    // Decay (optional)
    decaySeconds?: number

    // Conditional execution (optional)
    onlyTakerSupplyShareBps?: number // e.g., 100 = 1% supply
    onlyTakerBalanceGte?: bigint
}

/**
 * Creates a Quantum Liquidity strategy
 * These strategies can share the same virtual balance in Aqua!
 */
export function createQuantumStrategy(strategyName: string, params: QuantumStrategyParams): HexString {
    const {
        tokenIn,
        tokenOut,
        liquidityOut,
        deadlineSeconds,
        spreadBps,
        progressiveFeeBps,
        decaySeconds,
        onlyTakerSupplyShareBps,
        onlyTakerBalanceGte,
    } = params

    console.log(`[${strategyName}] Building strategy...`)
    console.log(`[${strategyName}] Token In: ${tokenIn.toString()}`)
    console.log(`[${strategyName}] Token Out: ${tokenOut.toString()}`)
    console.log(`[${strategyName}] Liquidity: ${liquidityOut.toString()}`)
    console.log(`[${strategyName}] Spread: ${spreadBps} bps`)
    console.log(`[${strategyName}] Progressive Fee: ${progressiveFeeBps} bps base`)

    const builder = new AquaProgramBuilder()

    // Step 1: Conditional guards (if any)
    if (onlyTakerSupplyShareBps !== undefined) {
        const supplyShareArgs = new controls.OnlyTakerTokenSupplyShareGteArgs(tokenIn, BigInt(onlyTakerSupplyShareBps))
        builder.add(controls.onlyTakerTokenSupplyShareGte.createIx(supplyShareArgs))
        console.log(`[${strategyName}] Added supply share check: >=${onlyTakerSupplyShareBps} bps`)
    }

    if (onlyTakerBalanceGte !== undefined) {
        const balanceArgs = new controls.OnlyTakerTokenBalanceGteArgs(tokenIn, onlyTakerBalanceGte)
        builder.add(controls.onlyTakerTokenBalanceGte.createIx(balanceArgs))
        console.log(`[${strategyName}] Added balance check: >=${onlyTakerBalanceGte}`)
    }

    // Step 2: Deadline (if specified)
    if (deadlineSeconds !== undefined) {
        const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds
        const deadlineArgs = new controls.DeadlineArgs(BigInt(deadline))
        builder.add(controls.deadline.createIx(deadlineArgs))
        console.log(
            `[${strategyName}] Added deadline: ${deadlineSeconds}s (expires at ${new Date(deadline * 1000).toISOString()})`
        )
    }

    // Step 3: Set liquidity concentration
    const concentrateData = concentrate.ConcentrateGrowLiquidity2DArgs.fromTokenDeltas(
        tokenIn,
        tokenOut,
        0n,
        liquidityOut
    )
    builder.add(concentrate.concentrateGrowLiquidity2D.createIx(concentrateData))
    console.log(`[${strategyName}] Added liquidity concentration`)

    // Step 4: Apply decay (if specified)
    if (decaySeconds !== undefined && decaySeconds > 0) {
        const decayArgs = new decay.DecayXDArgs(BigInt(decaySeconds))
        builder.add(decay.decayXD.createIx(decayArgs))
        console.log(`[${strategyName}] Added decay: ${decaySeconds}s`)
    }

    // Step 5: Apply progressive fees
    const feeArgs = fee.FlatFeeArgs.fromBps(progressiveFeeBps)
    builder.add(fee.progressiveFeeOutXD.createIx(feeArgs))
    console.log(`[${strategyName}] Added progressive fee: ${progressiveFeeBps} bps base`)

    // Step 6: Execute XYC swap
    builder.xycSwapXD()
    console.log(`[${strategyName}] Added XYC swap`)

    const program = builder.build()
    console.log(`[${strategyName}] Program built, size: ${program.toString().length / 2 - 1} bytes\n`)

    return program
}

/**
 * Calculate strategy hash for a given program and maker
 */
export function calculateStrategyHash(maker: string, program: HexString): string {
    const order = {
        maker,
        traits: 0,
        data: program.toString(),
    }

    const encoded = ethers.utils.defaultAbiCoder.encode(['tuple(address maker, uint256 traits, bytes data)'], [order])

    return ethers.utils.keccak256(encoded)
}
