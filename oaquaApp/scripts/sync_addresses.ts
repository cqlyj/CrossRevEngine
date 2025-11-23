import * as fs from 'fs'
import * as path from 'path'
import { updateEnvFile } from './lib/envUpdater'

async function main() {
    console.log('[Sync] Syncing deployment addresses to .env...')

    // Read executor address
    const executorPath = path.join(__dirname, '../deployments/base-mainnet/OAquaExecutor.json')
    if (fs.existsSync(executorPath)) {
        const executorDeployment = JSON.parse(fs.readFileSync(executorPath, 'utf8'))
        const executorAddress = executorDeployment.address
        console.log('[Sync] Executor:', executorAddress)
        updateEnvFile('OAQUA_EXECUTOR_ADDRESS', executorAddress)
        updateEnvFile('OAQUA_EXECUTOR_ADDRESS_BASE', executorAddress)
    } else {
        console.log('[Sync] Warning: No executor deployment found')
    }

    // Read sender address
    const senderPath = path.join(__dirname, '../deployments/arbitrum-mainnet/OAquaSender.json')
    if (fs.existsSync(senderPath)) {
        const senderDeployment = JSON.parse(fs.readFileSync(senderPath, 'utf8'))
        const senderAddress = senderDeployment.address
        console.log('[Sync] Sender:', senderAddress)
        updateEnvFile('OAQUA_SENDER_ADDRESS', senderAddress)
        updateEnvFile('OAQUA_SENDER_ADDRESS_ARBITRUM', senderAddress)
    } else {
        console.log('[Sync] Warning: No sender deployment found')
    }

    console.log('[Sync] Done')
}

main().catch((error) => {
    console.error('[Sync] Error:', error.message)
    process.exitCode = 1
})

