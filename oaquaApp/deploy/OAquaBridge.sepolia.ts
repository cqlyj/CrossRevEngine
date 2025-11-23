import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deployOAquaBridgeSepolia: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts, network } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    if (network.name !== 'sepolia') {
        console.log(`[BridgeSepolia] Skipping deployment on ${network.name}`)
        return
    }

    // Get MockSender address
    const mockSender = await deployments.get('MockSender')

    console.log(`[BridgeSepolia] Deploying OAquaBridge on ${network.name}`)
    console.log(`[BridgeSepolia] MockSender: ${mockSender.address}`)

    const result = await deploy('OAquaBridge', {
        from: deployer,
        args: [mockSender.address],
        log: true,
        waitConfirmations: 1,
    })

    console.log(`[BridgeSepolia] Deployed at: ${result.address}`)
    console.log(`\n=== CRE Configuration ===`)
    console.log(`Update chainlink-cre/ghost-liquidity/config.sepolia.json:`)
    console.log(`  "oaquaBridgeAddress": "${result.address}"`)
}

deployOAquaBridgeSepolia.tags = ['OAquaBridgeSepolia']
deployOAquaBridgeSepolia.dependencies = ['MockSender']

export default deployOAquaBridgeSepolia
