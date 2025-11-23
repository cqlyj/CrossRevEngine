import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deployMockSender: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts, network } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    if (network.name !== 'sepolia') {
        console.log(`[MockSender] Skipping deployment on ${network.name}`)
        return
    }

    console.log(`[MockSender] Deploying on ${network.name}`)

    const result = await deploy('MockSender', {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: 1,
    })

    console.log(`[MockSender] Deployed at: ${result.address}`)
}

deployMockSender.tags = ['MockSender']

export default deployMockSender
