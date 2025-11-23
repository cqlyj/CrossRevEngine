import * as fs from 'fs'
import * as path from 'path'

export function updateEnvFile(key: string, value: string): void {
    const envPath = path.join(__dirname, '../../.env')

    if (!fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, '')
    }

    let envContent = fs.readFileSync(envPath, 'utf8')
    const lines = envContent.split('\n')

    let found = false
    const updatedLines = lines.map((line) => {
        const trimmed = line.trim()
        if (trimmed.startsWith(`${key}=`) || trimmed.startsWith(`${key} =`)) {
            found = true
            return `${key}=${value}`
        }
        return line
    })

    if (!found) {
        updatedLines.push(`${key}=${value}`)
    }

    fs.writeFileSync(envPath, updatedLines.join('\n'))
}

export function readEnvValue(key: string): string | undefined {
    const envPath = path.join(__dirname, '../../.env')

    if (!fs.existsSync(envPath)) {
        return undefined
    }

    const envContent = fs.readFileSync(envPath, 'utf8')
    const lines = envContent.split('\n')

    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith(`${key}=`)) {
            return trimmed.substring(key.length + 1)
        }
    }

    return undefined
}
