import { exec } from 'child_process'
import { promisify } from 'util'
import assert from 'assert'

const execAsync = promisify(exec)

interface DeployAndSendOptions {
    amount?: string
    tokenOut?: string
    recipient?: string
    program?: string
    redeploy?: boolean
}

async function runCommand(cmd: string, description: string): Promise<void> {
    console.log(`[${description}] Running...`)
    try {
        const { stdout, stderr } = await execAsync(cmd, {
            env: { ...process.env, FORCE_COLOR: '0' },
        })
        if (stdout) console.log(stdout)
        if (stderr) console.error(stderr)
        console.log(`[${description}] Done`)
    } catch (error: any) {
        console.error(`[${description}] Failed:`, error.message)
        throw error
    }
}

async function main() {
    const args = process.argv.slice(2)
    const options: DeployAndSendOptions = {}

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === '--amount' && i + 1 < args.length) {
            options.amount = args[++i]
        } else if (arg === '--token-out' && i + 1 < args.length) {
            options.tokenOut = args[++i]
        } else if (arg === '--recipient' && i + 1 < args.length) {
            options.recipient = args[++i]
        } else if (arg === '--program' && i + 1 < args.length) {
            options.program = args[++i]
        } else if (arg === '--redeploy') {
            options.redeploy = true
        }
    }

    const amount = options.amount || '10000'
    const tokenOut = options.tokenOut || process.env.USDT_ADDRESS_BASE
    const recipient = options.recipient || process.env.RECIPIENT || '0x120C1fc5B7f357c0254cDC8027970DDD6405e115'
    const program = options.program || '0x1100'
    const salt = Math.floor(Date.now() / 1000).toString()

    console.log('='.repeat(60))
    console.log('OAqua Deploy & Send')
    console.log('='.repeat(60))
    console.log(`Amount: ${amount}`)
    console.log(`Token Out: ${tokenOut}`)
    console.log(`Recipient: ${recipient}`)
    console.log(`Program: ${program}`)
    console.log(`Redeploy: ${options.redeploy ? 'Yes' : 'No'}`)
    console.log('='.repeat(60))

    if (options.redeploy) {
        // Deploy Executor on Base
        console.log('\n[1/4] Deploying Executor on Base...')
        await runCommand('npx hardhat deploy --network base-mainnet --tags OAquaExecutor --reset', 'Deploy Executor')

        // Sync addresses to .env
        console.log('\n[2/4] Syncing addresses...')
        await runCommand('npx ts-node scripts/sync_addresses.ts', 'Sync Addresses')

        // Reload env to get the updated OAQUA_EXECUTOR_ADDRESS
        delete require.cache[require.resolve('dotenv')]
        require('dotenv').config()

        // Deploy Sender on Arbitrum
        console.log('\n[3/4] Deploying Sender on Arbitrum...')
        await runCommand('npx hardhat deploy --network arbitrum-mainnet --tags OAquaSender --reset', 'Deploy Sender')

        // Sync addresses again
        console.log('\n[Sync] Updating addresses...')
        await runCommand('npx ts-node scripts/sync_addresses.ts', 'Sync Addresses')

        // Reload env again
        delete require.cache[require.resolve('dotenv')]
        require('dotenv').config()
    } else {
        console.log('\n[Skip] Using existing deployments')
        // Still sync addresses to make sure .env is up to date
        await runCommand('npx ts-node scripts/sync_addresses.ts', 'Sync Addresses')
        delete require.cache[require.resolve('dotenv')]
        require('dotenv').config()
    }

    // Send swap
    console.log('\n[4/4] Sending swap message...')
    const sendCmd = `npx hardhat oaqua:send-swap --network arbitrum-mainnet --amount ${amount} --token-out ${tokenOut} --recipient ${recipient} --program ${program} --salt ${salt}`
    await runCommand(sendCmd, 'Send Swap')

    console.log('\n' + '='.repeat(60))
    console.log('Complete!')
    console.log('='.repeat(60))
    console.log('Check status: npx hardhat run scripts/check_aqua_strategy.ts --network base-mainnet')
    console.log('LayerZero scan: https://layerzeroscan.com')
}

main().catch((error) => {
    console.error('Error:', error.message)
    process.exitCode = 1
})
