import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deployOAquaBridge: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts, network } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    if (network.name !== 'arbitrum-mainnet') {
        console.log(`[Bridge] Skipping deployment on ${network.name}`)
        return
    }

    const oaquaSenderAddress = process.env.OAQUA_SENDER_ADDRESS_ARBITRUM
    if (!oaquaSenderAddress) {
        throw new Error('OAQUA_SENDER_ADDRESS_ARBITRUM not set')
    }

    console.log(`[Bridge] Deploying OAquaBridge on ${network.name}`)
    console.log(`[Bridge] OAquaSender: ${oaquaSenderAddress}`)

    const result = await deploy('OAquaBridge', {
        from: deployer,
        args: [oaquaSenderAddress],
        log: true,
        waitConfirmations: 1,
    })

    console.log(`[Bridge] Deployed at: ${result.address}`)
    console.log(`[Bridge] Update config.staging.json:`)
    console.log(`  "oaquaBridgeAddress": "${result.address}"`)
}

deployOAquaBridge.tags = ['OAquaBridge']

export default deployOAquaBridge
