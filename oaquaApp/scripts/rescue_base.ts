import { ethers } from "hardhat";

async function main() {
    const EXECUTOR_ADDRESS = "0xDcBF42769b0ac3bb37771F25CA9BB9C0f6Ed5242";
    const USDC_ADDRESS = process.env.USDC_ADDRESS_BASE;
    
    if (!USDC_ADDRESS) throw new Error("USDC_ADDRESS_BASE not set");

    const [signer] = await ethers.getSigners();
    console.log(`Rescuing tokens from ${EXECUTOR_ADDRESS} on Base...`);

    const executor = await ethers.getContractAt("OAquaExecutor", EXECUTOR_ADDRESS, signer);
    
    // Check balance
    const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS, signer);
    const balance = await usdc.balanceOf(EXECUTOR_ADDRESS);
    console.log(`Executor Balance: ${balance.toString()} USDC`);

    if (balance.gt(0)) {
        console.log("Rescuing...");
        const tx = await executor.rescueToken(USDC_ADDRESS, signer.address, balance);
        console.log(`Rescue tx: ${tx.hash}`);
        await tx.wait();
        console.log("Rescued!");
    } else {
        console.log("No tokens to rescue.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

