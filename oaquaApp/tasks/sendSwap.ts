import { BigNumber, ContractTransaction, ethers } from 'ethers'
import { task, types } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { createLogger } from '@layerzerolabs/io-devtools'
import { Options } from '@layerzerolabs/lz-v2-utilities'

const logger = createLogger()
const BPS_DENOMINATOR = BigNumber.from(10_000)

type SendSwapArgs = {
    amount: string
    minAmountOut?: string
    recipient: string
    salt: string
    tokenIn?: string
    tokenOut?: string
    maker?: string
    makerTraits?: string
    program?: string
    takerData?: string
    metadata?: string
    composeGasLimit?: string
    strategyBuffer?: string
    feeBufferBps?: string
    nativeFeeWei?: string
}

const toBytes32 = (value: string): string => {
    if (ethers.utils.isHexString(value)) {
        return ethers.utils.hexZeroPad(value, 32)
    }
    return ethers.utils.formatBytes32String(value)
}

const normalizeHex = (value?: string, fallback = '0x'): string => {
    if (!value || value.length === 0) return fallback
    return ethers.utils.hexlify(value)
}

const parseAmount = (value?: string, fallback = '0'): BigNumber => {
    return value ? BigNumber.from(value) : BigNumber.from(fallback)
}

const resolveExecutorAddress = async (hre: HardhatRuntimeEnvironment, override?: string): Promise<string> => {
    if (override && override !== '') {
        return override
    }

    if (process.env.OAQUA_EXECUTOR_ADDRESS && process.env.OAQUA_EXECUTOR_ADDRESS !== '') {
        return process.env.OAQUA_EXECUTOR_ADDRESS
    }

    if (hre.companionNetworks?.base) {
        try {
            const baseDeployment = await hre.companionNetworks.base.deployments.get('OAquaExecutor')
            return baseDeployment.address
        } catch (error) {
            console.warn('Could not resolve OAquaExecutor from base-mainnet deployments.')
        }
    }

    throw new Error('Unable to determine OAquaExecutor address. Deploy it on Base first or pass --maker 0x...')
}

task('oaqua:send-swap', 'Dispatches a SwapPayload through OAquaSender')
    .addParam('amount', 'Amount (local decimals) to send', undefined, types.string)
    .addParam('recipient', 'Address on destination chain that receives tokenOut', undefined, types.string)
    .addParam('salt', 'Strategy salt (hex or string)', undefined, types.string)
    .addOptionalParam('minAmountOut', 'Minimum tokenOut amount', '0', types.string)
    .addOptionalParam(
        'tokenIn',
        'Destination chain tokenIn address (Base USDC, not Arbitrum USDC!)',
        process.env.USDC_ADDRESS_BASE,
        types.string
    )
    .addOptionalParam('tokenOut', 'Destination chain tokenOut address', process.env.USDT_ADDRESS_BASE, types.string)
    .addOptionalParam('maker', 'Override executor address on destination', undefined, types.string)
    .addOptionalParam('makerTraits', 'SwapVM maker traits', '0', types.string)
    .addOptionalParam(
        'program',
        'SwapVM program bytes (generate with scripts/generate_aqua_program.ts)',
        '0x1100',
        types.string
    )
    .addOptionalParam('takerData', 'Taker traits/data bytes', '0x', types.string)
    .addOptionalParam('metadata', 'Metadata blob', '0x', types.string)
    .addOptionalParam('composeGasLimit', 'Gas allocated to lzCompose on Base', '2000000', types.string)
    .addOptionalParam(
        'feeBufferBps',
        'Extra buffer to apply on top of the native fee quote (basis points)',
        '2000',
        types.string
    )
    .addOptionalParam(
        'nativeFeeWei',
        'Override the msg.value sent along with sendSwap (in wei)',
        undefined,
        types.string
    )
    .setAction(async (args: SendSwapArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners()
        const senderDeployment = await hre.deployments.get('OAquaSender')
        const sender = await hre.ethers.getContractAt('OAquaSender', senderDeployment.address, signer)

        const maker = await resolveExecutorAddress(hre, args.maker)

        // IMPORTANT: tokenIn and tokenOut in the PAYLOAD must be the DESTINATION chain addresses (Base)!
        // But we need to approve the SOURCE chain USDC (Arbitrum) for Stargate to bridge.
        const destinationTokenIn = args.tokenIn ?? process.env.USDC_ADDRESS_BASE
        const destinationTokenOut = args.tokenOut ?? process.env.USDT_ADDRESS_BASE
        const sourceTokenIn = process.env.USDC_ADDRESS_ARBITRUM

        if (!destinationTokenIn || !destinationTokenOut) {
            throw new Error('Missing token addresses (set USDC_ADDRESS_BASE / USDT_ADDRESS_BASE or pass flags)')
        }
        if (!sourceTokenIn) {
            throw new Error('Missing USDC_ADDRESS_ARBITRUM')
        }

        const amountLD = BigNumber.from(args.amount)
        const strategySalt = toBytes32(args.salt)

        // Create initial payload for quoting (will be updated with actual received amount after quote)
        let payload = {
            maker,
            tokenIn: destinationTokenIn,
            tokenOut: destinationTokenOut,
            recipient: args.recipient,
            amountLD, // Will be updated to amountReceivedLD after Stargate quote
            minAmountOutLD: parseAmount(args.minAmountOut),
            makerTraits: parseAmount(args.makerTraits),
            program: normalizeHex(args.program),
            takerTraitsAndData: normalizeHex(args.takerData, '0x'),
            strategySalt,
            strategyTokens: [destinationTokenIn, destinationTokenOut],
            strategyBalances: [amountLD, BigNumber.from(args.strategyBuffer ?? '0')], // Will be updated
            metadata: normalizeHex(args.metadata, '0x'),
        }

        const composeGas = BigInt(args.composeGasLimit ?? '2000000')
        const extraOptions = Options.newOptions().addExecutorComposeOption(0, composeGas, 0n).toHex()

        logger.info(`Dispatching OAqua swap via ${senderDeployment.address} on ${hre.network.name}`)
        logger.info(`Recipient: ${args.recipient}`)
        logger.info(`Amount LD: ${amountLD.toString()}`)
        logger.info(`Strategy salt: ${strategySalt}`)

        const stargatePool = await sender.STARGATE_POOL()
        // Use the Stargate ABI to quoteOFT directly
        const stargateAbi = [
            'function quoteOFT((uint32,bytes32,uint256,uint256,bytes,bytes,bytes)) view returns ((uint256,uint256), tuple(int256,string,string)[], (uint256,uint256) receipt)',
        ]
        const stargateContract = await hre.ethers.getContractAt(stargateAbi, stargatePool, signer)

        const executor = await sender.DESTINATION_EXECUTOR()
        const executorBytes32 = ethers.utils.hexZeroPad(executor, 32)
        const dstEid = await sender.DESTINATION_EID()

        // Pre-calculate the compose message to get accurate quote
        // Note: The payload.amountLD here is the *original* amount. We need to update it AFTER quote.
        // But quoteOFT needs the payload in composeMsg to estimate gas? No, quoteOFT is view.
        // Stargate V2 usually ignores the content of composeMsg for fee calculation unless it's very large.
        // We use a placeholder payload for the quote.
        const encodedPayload = ethers.utils.defaultAbiCoder.encode(
            [
                'tuple(address,address,address,address,uint256,uint256,uint256,bytes,bytes,bytes32,address[],uint256[],bytes)',
            ],
            [
                [
                    payload.maker,
                    payload.tokenIn,
                    payload.tokenOut,
                    payload.recipient,
                    payload.amountLD,
                    payload.minAmountOutLD,
                    payload.makerTraits,
                    payload.program,
                    payload.takerTraitsAndData,
                    payload.strategySalt,
                    payload.strategyTokens,
                    payload.strategyBalances,
                    payload.metadata,
                ],
            ]
        )

        const sendParamTuple = [
            dstEid,
            executorBytes32,
            amountLD,
            0, // minAmountLD placeholder
            extraOptions,
            encodedPayload,
            '0x',
        ]

        logger.info(`Quoting Stargate OFT...`)
        const [, , oftReceipt] = await stargateContract.quoteOFT(sendParamTuple)
        // oftReceipt is a struct, but getContractAt with array ABI might return an array or object depending on ethers version.
        // Debug log it first.
        logger.info(`OFT Receipt: ${JSON.stringify(oftReceipt)}`)
        const amountReceivedLD = oftReceipt.amountReceivedLD || oftReceipt[1] // Try object then array index 1 (index 0 is amountSentLD)
        logger.info(`Stargate Quote: Sent ${amountLD.toString()} -> Received ${amountReceivedLD.toString()}`)

        // Update payload with the actual amount that will be received on destination
        payload = {
            ...payload,
            amountLD: amountReceivedLD,
            strategyBalances: [amountReceivedLD, BigNumber.from(args.strategyBuffer ?? '0')],
        }

        // Apply slippage (e.g., 0.5%) for minAmountLD
        const minAmountLD = amountReceivedLD.mul(9950).div(10000)
        logger.info(`Setting minAmountLD with 0.5% slippage: ${minAmountLD.toString()}`)

        const quote = await sender.quoteSendSwap(payload, extraOptions, minAmountLD)
        logger.info(`LayerZero fee quote: ${hre.ethers.utils.formatEther(quote.nativeFee)} ETH`)

        let nativeFee: BigNumber
        if (args.nativeFeeWei != null) {
            nativeFee = BigNumber.from(args.nativeFeeWei)
            logger.warn(
                `Using manual nativeFee override: ${hre.ethers.utils.formatEther(nativeFee)} ETH (buffer disabled)`
            )
        } else {
            const feeBufferBps = BigNumber.from(args.feeBufferBps ?? '2000')
            const bufferedFee = quote.nativeFee.mul(BPS_DENOMINATOR.add(feeBufferBps)).div(BPS_DENOMINATOR)
            nativeFee = bufferedFee.gt(quote.nativeFee) ? bufferedFee : quote.nativeFee

            logger.info(
                `LayerZero fee w/ buffer (+${feeBufferBps.toString()} bps): ${hre.ethers.utils.formatEther(nativeFee)} ETH`
            )
        }

        // Approve the SOURCE chain USDC (Arbitrum), not the destination one
        const tokenInContract = await hre.ethers.getContractAt('IERC20', sourceTokenIn, signer)
        const allowance = await tokenInContract.allowance(signer.address, sender.address)
        if (allowance.lt(amountLD)) {
            logger.info(`Approving OAquaSender to spend ${amountLD.toString()} of ${sourceTokenIn}...`)
            const approveTx = await tokenInContract.approve(sender.address, ethers.constants.MaxUint256)
            await approveTx.wait()
            logger.info(`Approved.`)
        }

        const tx: ContractTransaction = await sender.sendSwap(payload, extraOptions, minAmountLD, {
            value: nativeFee,
            gasLimit: 2500000, // Explicit gas limit to bypass estimation issues
        })
        const receipt = await tx.wait()

        logger.info(`Swap dispatched. Tx hash: ${receipt.transactionHash}`)
        return receipt.transactionHash
    })
